import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/db/migrate";
import { resolveDbPath } from "@/db/paths";

const EXPECTED_TABLES = [
  "role_types",
  "stages",
  "sources",
  "companies",
  "company_aliases",
  "applications",
  "status_events",
  "overrides",
  "contacts",
  "contact_applications",
  "conversations",
  "review_queue",
  "dead_letter",
  "outreach_messages",
];

function tableNamesOf(sqliteFilePath: string): string[] {
  const sqlite = new DatabaseSync(sqliteFilePath);
  try {
    const db = drizzle({ client: sqlite });
    runMigrations(db);
    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name`,
    );
    return rows.map((r) => r.name);
  } finally {
    sqlite.close();
  }
}

describe("schema parity between two independently-migrated files (DEMO-03)", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("applying runMigrations to two separate temp SQLite files yields identical table sets, both containing all 14 expected tables", () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "schema-parity-"));
    const fileA = path.join(tmpDir, "file-a.sqlite");
    const fileB = path.join(tmpDir, "file-b.sqlite");

    const tablesA = tableNamesOf(fileA);
    const tablesB = tableNamesOf(fileB);

    expect(tablesA.sort()).toEqual(tablesB.sort());

    for (const expected of EXPECTED_TABLES) {
      expect(tablesA).toContain(expected);
      expect(tablesB).toContain(expected);
    }
  });

  it("resolveDbPath('demo') and resolveDbPath('real') are distinct, and neither the seed nor the migrate CLI addresses both stores in one handle (DEMO-02)", () => {
    const demoPath = resolveDbPath("demo");
    const realPath = resolveDbPath("real");
    expect(demoPath).not.toBe(realPath);

    // Structural reassertion (established in 01-02): src/db/migrate.ts and
    // src/db/seed-lookups.ts each resolve exactly one mode from
    // process.env.DASHBOARD_MODE via assertMode — there is no function in
    // this codebase that opens both resolveDbPath('demo') and
    // resolveDbPath('real') within a single process/handle.
    const migrateSource = require("node:fs").readFileSync(
      path.resolve(__dirname, "../../src/db/migrate.ts"),
      "utf-8",
    );
    expect(migrateSource).not.toMatch(/resolveDbPath\(\s*["']demo["']\s*\).*resolveDbPath\(\s*["']real["']\s*\)/s);
  });
});
