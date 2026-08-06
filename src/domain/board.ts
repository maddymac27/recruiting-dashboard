import { eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { applications, companies, stages } from "@/db/schema";

export interface BoardApplication {
  id: number;
  companyId: number;
  companyName: string;
  roleTitle: string | null;
  roleTypeId: number | null;
  sourceId: number | null;
  postingUrl: string | null;
  dateApplied: Date | null; // null => "saved, not applied yet" (matches seed convention)
  currentStageId: number | null;
  currentStageLabel: string | null;
  currentStageIsTerminal: boolean | null;
  currentStageSince: Date | null;
}

/**
 * Returns one row per application (including saved-not-applied rows, where
 * `dateApplied` is null) joined to its company and current stage. This is
 * the single flat read model the pipeline board groups by `currentStageId`
 * to render columns — mirrors `getApplicationDetail`'s explicit `.select()`
 * projection + join shape, dropping the roleTypes/sources label joins the
 * board doesn't need to render a card (DASH-02).
 *
 * `companyId`/`roleTypeId`/`sourceId`/`postingUrl` are included alongside
 * the display fields so the 02-05 write slice's inline "edit" dialog can
 * pre-fill every editable field directly from the board's own read model,
 * without a second per-card `getApplicationDetail` fetch. `currentStageSince`
 * is included the same way (Phase 5, D5-01/D5-08) so the Today view's
 * activity clock and the board card's gone-quiet overlay don't need a
 * second per-application fetch — it is already maintained by
 * `recomputeCurrentStage` and never re-derived from `statusEvents` here.
 */
export function listBoardApplications(
  db: NodeSQLiteDatabase,
): BoardApplication[] {
  return db
    .select({
      id: applications.id,
      companyId: applications.companyId,
      companyName: companies.canonicalName,
      roleTitle: applications.roleTitle,
      roleTypeId: applications.roleTypeId,
      sourceId: applications.sourceId,
      postingUrl: applications.postingUrl,
      dateApplied: applications.dateApplied,
      currentStageId: applications.currentStageId,
      currentStageLabel: stages.label,
      currentStageIsTerminal: stages.isTerminal,
      currentStageSince: applications.currentStageSince,
    })
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .leftJoin(stages, eq(applications.currentStageId, stages.id))
    .all();
}

export interface PipelineSummary {
  applied: number;
  savedNotApplied: number;
  inProgress: number;
  closed: number;
}

/**
 * Derived entirely from `listBoardApplications()` in TypeScript (D2-07:
 * "derived from the board read model, not stored") — deliberately avoids a
 * second grouped-aggregate SQL query against the unverified
 * drizzle-orm 1.0.0-rc.4 group-by/count surface.
 *
 * Bucket rule ([FLAGGED] RESEARCH Assumption A2 — one reasonable reading of
 * DASH-04's four labels against the actual schema):
 *   - savedNotApplied: dateApplied is null
 *   - applied:         dateApplied is NOT null (a historical total — equals
 *                       inProgress + closed by construction)
 *   - inProgress:      applied AND currentStageIsTerminal === false
 *   - closed:          currentStageIsTerminal === true (Offer/Rejected/
 *                       Ghosted/Withdrawn)
 */
export function getPipelineSummary(db: NodeSQLiteDatabase): PipelineSummary {
  const rows = listBoardApplications(db);
  return rows.reduce<PipelineSummary>(
    (acc, row) => {
      if (row.dateApplied === null) {
        acc.savedNotApplied++;
      } else {
        acc.applied++;
        if (row.currentStageIsTerminal) acc.closed++;
        else acc.inProgress++;
      }
      return acc;
    },
    { applied: 0, savedNotApplied: 0, inProgress: 0, closed: 0 },
  );
}
