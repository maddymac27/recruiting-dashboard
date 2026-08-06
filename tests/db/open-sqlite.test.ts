import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openSqliteFile } from "@/db/open-sqlite";
import { runMigrations } from "@/db/migrate";
import { companyAliases } from "@/db/schema";

/**
 * Regression test for CR-02: `PRAGMA foreign_keys = ON` was only ever set
 * in the test helper (tests/helpers/db.ts), never on any production
 * connection (src/db/client.ts, src/db/migrate.ts, src/db/seed-lookups.ts,
 * src/demo/seed/seed.ts). Every declared `.references()` constraint in
 * src/db/schema.ts was therefore decorative in the real/demo databases —
 * an insert referencing a nonexistent row would silently succeed instead
 * of throwing.
 *
 * This test exercises the SAME connection-opening path production code
 * uses (`openSqliteFile`, not the test helper's own pragma) against a
 * real temp file, and proves FK violations throw.
 */
describe("openSqliteFile enforces foreign keys on production-path connections (CR-02)", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("PRAGMA foreign_keys reads back as 1 on a helper-opened connection", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "open-sqlite-"));
    const dbPath = path.join(tmpDir, "test.sqlite");

    const sqlite = openSqliteFile(dbPath);
    try {
      const row = sqlite.prepare("PRAGMA foreign_keys").get() as {
        foreign_keys: number;
      };
      expect(row.foreign_keys).toBe(1);
    } finally {
      sqlite.close();
    }
  });

  it("throws on inserting a row with a nonexistent foreign key id, via the exact connection path production code uses", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "open-sqlite-"));
    const dbPath = path.join(tmpDir, "test.sqlite");

    const sqlite = openSqliteFile(dbPath);
    try {
      const db = drizzle({ client: sqlite });
      runMigrations(db);

      // No company with id 999999 exists in this fresh DB — this insert
      // must throw a foreign key constraint violation, not silently
      // succeed and create an orphaned row. drizzle wraps the underlying
      // node:sqlite error (message: "FOREIGN KEY constraint failed") in
      // `.cause` rather than its own top-level message, so assert on both
      // to be resilient to either surfacing.
      let thrown: unknown;
      try {
        db
          .insert(companyAliases)
          .values({
            companyId: 999999,
            alias: "Nonexistent Co",
            normalizedAlias: "nonexistent co",
          })
          .run();
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeDefined();
      const err = thrown as Error & { cause?: unknown };
      const combinedMessage = `${err.message} ${
        err.cause instanceof Error ? err.cause.message : String(err.cause ?? "")
      }`;
      expect(combinedMessage).toMatch(/foreign key/i);
    } finally {
      sqlite.close();
    }
  });
});
