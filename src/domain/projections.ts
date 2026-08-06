import { asc, eq } from "drizzle-orm";
import type { NodeSQLiteDatabase, NodeSQLiteTransaction } from "drizzle-orm/node-sqlite";
import { applications, statusEvents } from "@/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbOrTx = NodeSQLiteDatabase | NodeSQLiteTransaction<any>;

/**
 * The ONLY writer of applications.current_stage_id / current_stage_since /
 * last_inbound_event_at (DATA-02, DATA-03, D-09). Reads every status_events
 * row for the application ordered by occurred_at ASC, id ASC — occurred_at
 * (the email's real-world timestamp) is what makes out-of-order ingestion
 * (a rejection processed before its confirmation) resolve to the correct
 * current stage; `id` is only a same-timestamp insertion-order tiebreak,
 * never a substitute for occurred_at (RESEARCH Pitfall 1). Takes the last
 * row after that ordering and writes the three projection columns. If no
 * events exist yet, leaves the projection columns untouched (null).
 */
export function recomputeCurrentStage(tx: DbOrTx, applicationId: number): void {
  const events = tx
    .select()
    .from(statusEvents)
    .where(eq(statusEvents.applicationId, applicationId))
    .orderBy(asc(statusEvents.occurredAt), asc(statusEvents.id))
    .all();

  if (events.length === 0) return;

  const latest = events[events.length - 1];

  tx.update(applications)
    .set({
      currentStageId: latest.stageId,
      currentStageSince: latest.occurredAt,
      lastInboundEventAt: latest.occurredAt,
    })
    .where(eq(applications.id, applicationId))
    .run();
}

/**
 * Free repair path: re-runs recomputeCurrentStage over every application.
 * Useful for backfilling if a projection bug is ever found and fixed.
 */
export function rebuildAllProjections(db: NodeSQLiteDatabase): void {
  const allApplications = db
    .select({ id: applications.id })
    .from(applications)
    .all();

  for (const { id } of allApplications) {
    recomputeCurrentStage(db, id);
  }
}
