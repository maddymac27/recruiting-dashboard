import { desc, eq, sql } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import {
  deadLetter,
  ingestedMessages,
  reviewQueue,
  syncRuns,
  type NewIngestedMessage,
} from "@/db/schema";
import {
  newSyncRunInput,
  type NewSyncRunInput,
  type SyncRunStatus,
} from "@/db/validation";
import type { DbOrTx } from "./projections";

// ---------------------------------------------------------------------------
// Sync-run lifecycle (REL-03) — powers the health indicator.
// ---------------------------------------------------------------------------

/**
 * Starts a new sync_runs row (status "running") and returns its id. Called
 * once per sync attempt, before any per-message ingestion work begins.
 */
export function startSyncRun(db: NodeSQLiteDatabase): number {
  const result = db.insert(syncRuns).values({ status: "running" }).run();

  return Number(result.lastInsertRowid);
}

export type FinishSyncRunInput = Omit<NewSyncRunInput, "status"> & {
  status: Extract<SyncRunStatus, "success" | "failed">;
};

/**
 * Finishes a sync_runs row: stamps `finishedAt`, sets the terminal status
 * (success/failed), and records the new/review/dead-letter counts the
 * health indicator and sidebar badges read. Also persists the Phase 4
 * (ING-07/D4-05) `historyId` cursor + `usedFallback` flag — both validated
 * via `newSyncRunInput` (V5) before they reach Drizzle, never bypassed.
 */
export function finishSyncRun(
  db: NodeSQLiteDatabase,
  id: number,
  input: FinishSyncRunInput,
): void {
  const validated = newSyncRunInput.parse(input);

  db.update(syncRuns)
    .set({
      finishedAt: new Date(),
      status: validated.status ?? input.status,
      newCount: validated.newCount ?? 0,
      reviewCount: validated.reviewCount ?? 0,
      deadLetterCount: validated.deadLetterCount ?? 0,
      errorMessage: validated.errorMessage,
      historyId: validated.historyId,
      usedFallback: validated.usedFallback ?? false,
    })
    .where(eq(syncRuns.id, id))
    .run();
}

/**
 * Returns the most recently started sync_runs row (or undefined if none
 * exist yet) — the single source the health indicator (03-10) reads to show
 * "last synced" state, including a run still in progress. Orders by
 * `startedAt` desc with `id` desc as a same-timestamp tiebreak (SQLite's
 * `unixepoch()` default has one-second resolution, so two runs started in
 * the same second need a deterministic secondary sort).
 */
export function getLatestSyncRun(db: NodeSQLiteDatabase) {
  return db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
    .limit(1)
    .get();
}

/**
 * Returns the most recent status="success" sync_runs row (or undefined if
 * none has ever succeeded) — D4-04/D4-05: the single authoritative read
 * point for BOTH the next run's `lastSync` window and its `historyId`
 * cursor, so a failed intervening run neither narrows the fallback window
 * nor loses the last-good cursor (mirrors `getLatestSyncRun`'s same-second
 * `id` desc tiebreak).
 */
export function getLatestSuccessfulSyncRun(db: NodeSQLiteDatabase) {
  return db
    .select()
    .from(syncRuns)
    .where(eq(syncRuns.status, "success"))
    .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
    .limit(1)
    .get();
}

// ---------------------------------------------------------------------------
// Pending counts — the sidebar badges (REL-01, REL-02).
// ---------------------------------------------------------------------------

/**
 * Returns the count of review_queue rows still awaiting a decision — the
 * number the sidebar review badge displays.
 */
export function getReviewCount(db: NodeSQLiteDatabase): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(reviewQueue)
    .where(eq(reviewQueue.status, "pending"))
    .get();

  return row?.count ?? 0;
}

/**
 * Returns the count of dead_letter rows still awaiting resolution — the
 * number the sidebar dead-letter badge displays.
 */
export function getDeadLetterCount(db: NodeSQLiteDatabase): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(deadLetter)
    .where(eq(deadLetter.status, "pending"))
    .get();

  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Ingested-messages dedup ledger (DATA-06 / D3-06) — the primitive that
// makes "nothing is ever silently dropped, and nothing is ever double
// recorded" true for a retried/re-run sync.
// ---------------------------------------------------------------------------

/**
 * Returns whether a given Gmail message id has already been recorded in the
 * ingested_messages ledger. The orchestrator (03-06) checks this before
 * doing any parse/route work for a message, so a re-run sync never
 * reprocesses an already-handled message.
 */
export function isAlreadyIngested(
  db: NodeSQLiteDatabase,
  messageId: string,
): boolean {
  const row = db
    .select({ id: ingestedMessages.id })
    .from(ingestedMessages)
    .where(eq(ingestedMessages.messageId, messageId))
    .get();

  return row !== undefined;
}

/**
 * Records a message as ingested, using a passed-in tx/db handle. Opens NO
 * transaction of its own — mirrors `appendStatusEventTx`'s
 * non-transaction-owning shape (src/domain/events.ts) so the orchestrator
 * can compose the ledger insert with the routing-decision insert
 * (transition/review/dead-letter) in exactly one transaction per message
 * (RESEARCH Pitfall 2). Idempotent via `onConflictDoNothing` on the unique
 * `message_id` index (T-03-15) — a retried sync recording the same message
 * id twice is a no-op, never a duplicate row or a thrown error.
 */
export function recordIngestedTx(
  tx: DbOrTx,
  messageId: string,
  outcome: NewIngestedMessage["outcome"],
  applicationId?: number,
): void {
  tx.insert(ingestedMessages)
    .values({ messageId, outcome, applicationId })
    .onConflictDoNothing({ target: ingestedMessages.messageId })
    .run();
}
