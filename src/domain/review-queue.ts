import { and, desc, eq, ne } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { reviewQueue } from "@/db/schema";
import {
  newReviewQueueEntryInput,
  type NewReviewQueueEntryInput,
} from "@/db/validation";
import type { DbOrTx } from "./projections";

export const REVIEW_ITEM_RESOLUTION_STATUSES = [
  "confirmed",
  "reassigned",
  "rejected",
] as const;
export type ReviewItemResolutionStatus =
  (typeof REVIEW_ITEM_RESOLUTION_STATUSES)[number];

/**
 * Inserts a review_queue row, using a passed-in tx/db handle. Opens NO
 * transaction of its own — mirrors `appendStatusEventTx`'s
 * non-transaction-owning shape (src/domain/events.ts) so the orchestrator
 * (03-06) can compose one transaction per message: dedup-ledger insert +
 * routing-decision insert together (RESEARCH Pitfall 2). Validates via
 * `newReviewQueueEntryInput` before it reaches Drizzle (V5). Returns the new
 * row's id.
 */
export function insertReviewQueueEntryTx(
  tx: DbOrTx,
  input: NewReviewQueueEntryInput,
): number {
  const validated = newReviewQueueEntryInput.parse(input);

  const result = tx.insert(reviewQueue).values(validated).run();

  return Number(result.lastInsertRowid);
}

/**
 * Public entry point for callers that are NOT already inside their own
 * transaction: wraps `insertReviewQueueEntryTx` in a single `db.transaction`.
 */
export function insertReviewQueueEntry(
  db: NodeSQLiteDatabase,
  input: NewReviewQueueEntryInput,
): number {
  return db.transaction((tx) => insertReviewQueueEntryTx(tx, input));
}

/**
 * Returns every review_queue row awaiting a decision, newest first
 * (REL-01) — powers the review queue UI (03-08) and the sidebar badge count.
 * Orders by `createdAt` desc with `id` desc as a same-timestamp tiebreak
 * (SQLite's `unixepoch()` default has one-second resolution, so two inserts
 * in the same second need a deterministic secondary sort — mirrors
 * `recomputeCurrentStage`'s occurredAt+id tiebreak pattern).
 */
export function listPendingReviewItems(db: NodeSQLiteDatabase) {
  return db
    .select()
    .from(reviewQueue)
    .where(eq(reviewQueue.status, "pending"))
    .orderBy(desc(reviewQueue.createdAt), desc(reviewQueue.id))
    .all();
}

/**
 * Returns every review_queue row that has already been resolved
 * (confirmed/reassigned/rejected), newest first — the audit trail half of
 * REL-01/REL-02: resolved items are never deleted, only transitioned.
 */
export function listResolvedReviewItems(db: NodeSQLiteDatabase) {
  return db
    .select()
    .from(reviewQueue)
    .where(ne(reviewQueue.status, "pending"))
    .orderBy(desc(reviewQueue.createdAt), desc(reviewQueue.id))
    .all();
}

/**
 * Reads a single review_queue row by id, or undefined if it doesn't exist.
 * Added for 03-08's review actions: the client only ever supplies the
 * reviewId, never re-submits the item's own parsed fields
 * (parsedStageLabel/parsedEventDate/sourceMessageId/bodyText) — those are
 * read back here so a confirm/attach/log action always writes from the
 * server-trusted stored values, not anything the client could tamper with.
 */
export function getReviewItemById(db: NodeSQLiteDatabase, id: number) {
  return db.select().from(reviewQueue).where(eq(reviewQueue.id, id)).get();
}

/**
 * Transitions a pending review_queue row to a resolved status
 * (confirmed/reassigned/rejected), stamping `resolvedAt`. There is
 * deliberately NO delete/hard-remove function on this table — an item only
 * ever moves pending -> resolved, preserving the fail-loud audit trail
 * (REL-02, T-03-14).
 */
export function resolveReviewItem(
  db: NodeSQLiteDatabase,
  id: number,
  status: ReviewItemResolutionStatus,
): void {
  db.update(reviewQueue)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(reviewQueue.id, id), eq(reviewQueue.status, "pending")))
    .run();
}
