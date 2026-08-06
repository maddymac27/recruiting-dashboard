import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Opens a file-backed node:sqlite connection with the pragmas every
 * production connection must have (CR-02):
 * - `PRAGMA foreign_keys = ON` — SQLite disables FK enforcement per
 *   connection by default regardless of declared `.references()`
 *   constraints; without this, every FK in src/db/schema.ts is decorative
 *   and orphaned/invalid references silently succeed instead of throwing,
 *   which directly violates this project's fail-loud constraint.
 * - `PRAGMA journal_mode = WAL` — allows concurrent reads while a write is
 *   in flight.
 * - `PRAGMA busy_timeout = 5000` — WAL still serializes writers process-wide;
 *   without a busy_timeout, a scheduled sync script (Phase 4) and a running
 *   `next dev`/`next start` writing at the same instant get an immediate
 *   SQLITE_BUSY error instead of waiting briefly (RESEARCH Pitfall 4).
 *
 * Also creates the parent directory first — node:sqlite's DatabaseSync does
 * not create missing parent directories itself, so a first-ever run would
 * otherwise fail with a confusing native "unable to open database file"
 * error instead of a clear one.
 *
 * Centralized here (rather than duplicated per call site) so the pragma can
 * never again be forgotten in a new production connection: src/db/client.ts,
 * src/db/migrate.ts, src/db/seed-lookups.ts, and src/demo/seed/seed.ts all
 * open their connection through this function. tests/helpers/db.ts sets its
 * own pragma directly since it uses an in-memory `:memory:` database rather
 * than a file path.
 */
export function openSqliteFile(dbPath: string): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA busy_timeout = 5000");

  return sqlite;
}
