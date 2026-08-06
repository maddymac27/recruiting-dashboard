import { asc, eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { statusEvents, stages } from "@/db/schema";
import { getConversationsForApplication } from "./contacts";

/**
 * One entry in a job's unified chronological history (DASH-05, D2-09) —
 * either a status transition or a conversation. `kind` discriminates which
 * optional fields are populated; the timeline UI (src/components/timeline)
 * renders each kind as its own row shape.
 *
 * Note: DASH-05's "linked message" is intentionally not represented here —
 * no messages entity exists until Phase 3 ingestion (RESEARCH Pattern 4
 * note). This phase's timeline interleaves status events + conversations
 * only.
 */
export interface TimelineEntry {
  occurredAt: Date;
  kind: "status_event" | "conversation";
  // status_event fields
  stageLabel?: string | null;
  // conversation fields
  contactName?: string;
  channel?: string | null;
  notes?: string | null;
}

/**
 * Composes status_events (joined to stages for the stage label) and
 * getConversationsForApplication into one merged, most-recent-first
 * timeline for a single application (DASH-05, D2-09).
 *
 * Sort is most-recent-first (descending by occurredAt). Two entries that
 * share an identical occurredAt both appear — never dropped or merged —
 * in a deterministic, reproducible order: each entry's original
 * query-result position (events first, then conversations, each already
 * ordered ascending by occurredAt) is captured as a stable secondary sort
 * key before sorting, so ties never reshuffle between renders/runs
 * (RESEARCH Assumption A3 / Open Question 2).
 */
export function getJobTimeline(
  db: NodeSQLiteDatabase,
  applicationId: number,
): TimelineEntry[] {
  const events: TimelineEntry[] = db
    .select({
      occurredAt: statusEvents.occurredAt,
      stageLabel: stages.label,
    })
    .from(statusEvents)
    .leftJoin(stages, eq(statusEvents.stageId, stages.id))
    .where(eq(statusEvents.applicationId, applicationId))
    .orderBy(asc(statusEvents.occurredAt))
    .all()
    .map((row) => ({ ...row, kind: "status_event" as const }));

  const conversationEntries: TimelineEntry[] = getConversationsForApplication(
    db,
    applicationId,
  ).map((row) => ({ ...row, kind: "conversation" as const }));

  const withOrder = [...events, ...conversationEntries].map(
    (entry, sourceOrder) => ({ entry, sourceOrder }),
  );

  withOrder.sort((a, b) => {
    const byDate = b.entry.occurredAt.getTime() - a.entry.occurredAt.getTime();
    if (byDate !== 0) return byDate;
    return a.sourceOrder - b.sourceOrder;
  });

  return withOrder.map(({ entry }) => entry);
}
