import { asc, eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { applications, statusEvents, stages } from "@/db/schema";
import { listBoardApplications } from "./board";

// D5-07's explicit canonical funnel order — a fixed subset of the full
// 8-stage vocabulary (excludes Rejected/Ghosted/Withdrawn, which are
// terminal OUTCOMES, not funnel steps).
export const FUNNEL_STAGE_ORDER = [
  "Saved",
  "Applied",
  "Screen",
  "Interview",
  "Offer",
] as const;

export interface FunnelBucket {
  stageLabel: (typeof FUNNEL_STAGE_ORDER)[number];
  count: number;
}

/**
 * Funnel = distinct-application "ever reached stage" counts, computed by
 * scanning `statusEvents` (joined to `stages` for the label) and reducing in
 * TypeScript — NOT a SQL `GROUP BY`/`COUNT`/`MAX` aggregate query (RESEARCH
 * Pattern 3, mirrors `src/domain/board.ts`'s `getPipelineSummary` reduce-not-
 * groupBy convention). `drizzle-orm` is pinned at `1.0.0-rc.4` (a release
 * candidate) and this codebase deliberately avoids its group-by surface.
 *
 * For each application, the highest `FUNNEL_STAGE_ORDER` index it ever
 * reached is tracked. Rows for Rejected/Ghosted/Withdrawn events are simply
 * not in `FUNNEL_STAGE_ORDER` and contribute nothing — `.indexOf` returns -1
 * and is skipped, so a later terminal event can never reduce a stage an
 * application already reached.
 */
export function getFunnelCounts(db: NodeSQLiteDatabase): FunnelBucket[] {
  const rows = db
    .select({
      applicationId: statusEvents.applicationId,
      stageLabel: stages.label,
    })
    .from(statusEvents)
    .innerJoin(stages, eq(statusEvents.stageId, stages.id))
    .orderBy(asc(statusEvents.applicationId))
    .all();

  const furthestRankByApplication = new Map<number, number>();
  for (const row of rows) {
    const rank = FUNNEL_STAGE_ORDER.indexOf(
      row.stageLabel as (typeof FUNNEL_STAGE_ORDER)[number],
    );
    if (rank === -1) continue;
    const current = furthestRankByApplication.get(row.applicationId) ?? -1;
    if (rank > current) furthestRankByApplication.set(row.applicationId, rank);
  }

  return FUNNEL_STAGE_ORDER.map((stageLabel, rank) => ({
    stageLabel,
    count: [...furthestRankByApplication.values()].filter((r) => r >= rank)
      .length,
  }));
}

export interface AnalyticsSummary {
  totalApplications: number;
  responseRatePct: number;
  active: number;
  closed: number;
  offers: number;
  rejected: number;
  ghosted: number;
}

/**
 * Summary metrics beyond the Phase 2 KPI row (DASH-06), computed entirely in
 * TypeScript over two existing flat read models — `listBoardApplications`
 * (current-state counts: active/closed/outcome breakdown) and
 * `getFunnelCounts` (event-history counts: total/response rate) — never a
 * second grouped-aggregate SQL query (same Pattern 3 convention as the
 * funnel computation above).
 *
 * `responseRatePct`'s denominator is `reachedApplied` — the funnel's Applied
 * bucket, not `listBoardApplications`'s `dateApplied` field — for internal
 * event-sourced consistency with the numerator (`reachedScreenPlus`, the
 * funnel's Screen bucket): both sides of the ratio come from the same
 * "ever reached stage" history (D5-07). Divide-by-zero is explicitly
 * guarded: `reachedApplied === 0` short-circuits to `0`, never `NaN`/`Infinity`.
 */
export function getAnalyticsSummary(
  db: NodeSQLiteDatabase,
): AnalyticsSummary {
  const boardRows = listBoardApplications(db);
  const funnel = getFunnelCounts(db);

  const reachedApplied =
    funnel.find((b) => b.stageLabel === "Applied")?.count ?? 0;
  const reachedScreenPlus =
    funnel.find((b) => b.stageLabel === "Screen")?.count ?? 0;

  const responseRatePct =
    reachedApplied === 0
      ? 0
      : Math.round((reachedScreenPlus / reachedApplied) * 100);

  return boardRows.reduce<AnalyticsSummary>(
    (acc, row) => {
      acc.totalApplications++;
      if (row.currentStageIsTerminal === true) {
        acc.closed++;
      } else {
        acc.active++; // covers false AND null (no current stage assigned yet)
      }
      if (row.currentStageLabel === "Offer") acc.offers++;
      if (row.currentStageLabel === "Rejected") acc.rejected++;
      if (row.currentStageLabel === "Ghosted") acc.ghosted++;
      return acc;
    },
    {
      totalApplications: 0,
      responseRatePct,
      active: 0,
      closed: 0,
      offers: 0,
      rejected: 0,
      ghosted: 0,
    },
  );
}

// ---------------------------------------------------------------------------
// KPI change badges (#2 şişe redesign) — per-window "flow" counts feeding the
// increase/decrease badge on each pipeline summary box. For each window (90/30/
// 7 days): how many applications ENTERED each bucket during the current window
// vs the prior equal-length window. TS reduction over flat queries (no GROUP
// BY), same convention as getPipelineSummary/getFunnelCounts. applied/
// savedNotApplied come from the applications table (dateApplied/createdAt);
// inProgress/closed from statusEvents joined to stages.isTerminal.
// ---------------------------------------------------------------------------

export type KpiWindowDays = 90 | 30 | 7;
export const KPI_WINDOWS: KpiWindowDays[] = [90, 30, 7];

export interface KpiBucketDelta {
  current: number;
  prior: number;
}
export interface KpiWindowDeltas {
  applied: KpiBucketDelta;
  savedNotApplied: KpiBucketDelta;
  inProgress: KpiBucketDelta;
  closed: KpiBucketDelta;
}

export function getKpiDeltasByWindow(
  db: NodeSQLiteDatabase,
  now: Date = new Date(),
): Record<KpiWindowDays, KpiWindowDeltas> {
  const appRows = db
    .select({
      dateApplied: applications.dateApplied,
      createdAt: applications.createdAt,
    })
    .from(applications)
    .all();

  const eventRows = db
    .select({
      occurredAt: statusEvents.occurredAt,
      isTerminal: stages.isTerminal,
    })
    .from(statusEvents)
    .innerJoin(stages, eq(statusEvents.stageId, stages.id))
    .all();

  const nowMs = now.getTime();
  const DAY = 86_400_000;
  const result = {} as Record<KpiWindowDays, KpiWindowDeltas>;

  for (const w of KPI_WINDOWS) {
    const span = w * DAY;
    const currentStart = nowMs - span;
    const priorStart = nowMs - 2 * span;
    const inCurrent = (t: number) => t > currentStart && t <= nowMs;
    const inPrior = (t: number) => t > priorStart && t <= currentStart;

    const d: KpiWindowDeltas = {
      applied: { current: 0, prior: 0 },
      savedNotApplied: { current: 0, prior: 0 },
      inProgress: { current: 0, prior: 0 },
      closed: { current: 0, prior: 0 },
    };

    for (const a of appRows) {
      if (a.dateApplied) {
        const t = a.dateApplied.getTime();
        if (inCurrent(t)) d.applied.current++;
        else if (inPrior(t)) d.applied.prior++;
      } else if (a.createdAt) {
        const t = a.createdAt.getTime();
        if (inCurrent(t)) d.savedNotApplied.current++;
        else if (inPrior(t)) d.savedNotApplied.prior++;
      }
    }

    for (const e of eventRows) {
      const t = e.occurredAt.getTime();
      const bucket = e.isTerminal ? "closed" : "inProgress";
      if (inCurrent(t)) d[bucket].current++;
      else if (inPrior(t)) d[bucket].prior++;
    }

    result[w] = d;
  }

  return result;
}
