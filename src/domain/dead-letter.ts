import { and, desc, eq, ne } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { deadLetter } from "@/db/schema";
import {
  newDeadLetterEntryInput,
  type NewDeadLetterEntryInput,
} from "@/db/validation";
import type { DbOrTx } from "./projections";

/**
 * Inserts a dead_letter row, using a passed-in tx/db handle. Opens NO
 * transaction of its own — mirrors `appendStatusEventTx`'s
 * non-transaction-owning shape (src/domain/events.ts) so the orchestrator
 * (03-06) can compose one transaction per message (RESEARCH Pitfall 2).
 * Validates via `newDeadLetterEntryInput` before it reaches Drizzle (V5).
 * Returns the new row's id.
 */
export function insertDeadLetterEntryTx(
  tx: DbOrTx,
  input: NewDeadLetterEntryInput,
): number {
  const validated = newDeadLetterEntryInput.parse(input);

  const result = tx.insert(deadLetter).values(validated).run();

  return Number(result.lastInsertRowid);
}

/**
 * Public entry point for callers that are NOT already inside their own
 * transaction: wraps `insertDeadLetterEntryTx` in a single `db.transaction`.
 */
export function insertDeadLetterEntry(
  db: NodeSQLiteDatabase,
  input: NewDeadLetterEntryInput,
): number {
  return db.transaction((tx) => insertDeadLetterEntryTx(tx, input));
}

/**
 * Returns every dead_letter row awaiting resolution, newest first (REL-02)
 * — powers the dead-letter queue UI (03-08/03-09) and the sidebar badge
 * count. Orders by `createdAt` desc with `id` desc as a same-timestamp
 * tiebreak (SQLite's `unixepoch()` default has one-second resolution, so
 * two inserts in the same second need a deterministic secondary sort —
 * mirrors `recomputeCurrentStage`'s occurredAt+id tiebreak pattern).
 */
export function listPendingDeadLetter(db: NodeSQLiteDatabase) {
  return db
    .select()
    .from(deadLetter)
    .where(eq(deadLetter.status, "pending"))
    .orderBy(desc(deadLetter.createdAt), desc(deadLetter.id))
    .all();
}

/**
 * Returns every dead_letter row that has already been resolved, newest
 * first — the audit trail half of REL-02: resolved entries are never
 * deleted, only transitioned.
 */
export function listResolvedDeadLetter(db: NodeSQLiteDatabase) {
  return db
    .select()
    .from(deadLetter)
    .where(ne(deadLetter.status, "pending"))
    .orderBy(desc(deadLetter.createdAt), desc(deadLetter.id))
    .all();
}

/**
 * Flips a pending dead_letter row for the given source message id to
 * resolved, stamping `resolvedAt`. Used when a later re-parse of the same
 * message (e.g. after a parser fix ships) succeeds and produces a real
 * transition — the original failure record is preserved (not deleted) but
 * marked resolved (REL-02). Opens NO transaction of its own so it can be
 * composed with the re-parse's own transition write.
 */
export function resolveDeadLetterByMessageIdTx(
  tx: DbOrTx,
  messageId: string,
): void {
  tx.update(deadLetter)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(
      and(
        eq(deadLetter.sourceMessageId, messageId),
        eq(deadLetter.status, "pending"),
      ),
    )
    .run();
}
