import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { statusEvents } from "@/db/schema";
import { newStatusEventInput, type NewStatusEventInput } from "@/db/validation";
import { recomputeCurrentStage, type DbOrTx } from "./projections";

/**
 * Inserts a status_events row and recomputes the applications projection,
 * using a passed-in tx/db handle. Opens NO transaction of its own — this is
 * what makes it callable from inside another caller's `db.transaction(...)`
 * (e.g. `updateApplication`/`quickSaveApplication` doing a field edit and a
 * stage change atomically) without hitting SQLite's no-nested-transaction
 * limit (RESEARCH Pitfall 2). Mirrors `recomputeCurrentStage`'s
 * non-transaction-owning shape (see ./projections).
 *
 * Idempotent on `source_message_id` via ON CONFLICT DO NOTHING (DATA-06):
 * re-inserting an already-seen non-null message id is a no-op — exactly one
 * row survives. Recompute runs even when the insert was a conflict no-op,
 * so a retried caller never leaves the projection stale. SQLite treats NULL
 * as distinct from any other NULL, so manual events (source_message_id:
 * null) never collide with each other or with a real message id.
 *
 * Caller must NOT await anything inside the transaction callback that
 * invokes this — node:sqlite's driver commits immediately on callback
 * return, so an async callback would let `commit` run before a later
 * `await`ed statement inside it actually executed.
 */
export function appendStatusEventTx(tx: DbOrTx, validated: NewStatusEventInput) {
  const inserted = tx
    .insert(statusEvents)
    .values(validated)
    .onConflictDoNothing({ target: statusEvents.sourceMessageId })
    .run();

  recomputeCurrentStage(tx, validated.applicationId);

  return inserted;
}

/**
 * Public entry point for callers that are NOT already inside their own
 * transaction: validates then wraps `appendStatusEventTx` in a single
 * `db.transaction`. Never updates a stage/status column on `applications`
 * directly (D-09) — the only status mutation is the appended event row plus
 * the projection recompute performed by `appendStatusEventTx`.
 */
export function appendStatusEvent(
  db: NodeSQLiteDatabase,
  input: NewStatusEventInput,
) {
  const validated = newStatusEventInput.parse(input);

  return db.transaction((tx) => appendStatusEventTx(tx, validated));
}
