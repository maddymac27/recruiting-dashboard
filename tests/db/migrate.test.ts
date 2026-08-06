import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import { assertMode, resolveDbPath } from "@/db/paths";

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

describe("runMigrations (via createTestDb)", () => {
  it("creates all 14 expected tables in a fresh in-memory DB", () => {
    const { db, close } = createTestDb();
    try {
      const rows = db.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
      );
      const tableNames = rows.map((r) => r.name);
      for (const expected of EXPECTED_TABLES) {
        expect(tableNames).toContain(expected);
      }
    } finally {
      close();
    }
  });

  it("applications table includes a nullable posting_url column (CAP-01)", () => {
    const { db, close } = createTestDb();
    try {
      const columns = db.all<{ name: string; notnull: number }>(
        sql`PRAGMA table_info(applications)`,
      );
      const postingUrl = columns.find((c) => c.name === "posting_url");
      expect(postingUrl).toBeDefined();
      expect(postingUrl?.notnull).toBe(0);
    } finally {
      close();
    }
  });

  it("outreach_messages has the expected column shape (D-04..D-08)", () => {
    const { db, close } = createTestDb();
    try {
      const columns = db.all<{ name: string; notnull: number }>(
        sql`PRAGMA table_info(outreach_messages)`,
      );
      const byName = new Map(columns.map((c) => [c.name, c]));

      // nullable
      expect(byName.get("subject")?.notnull).toBe(0);
      expect(byName.get("outcome")?.notnull).toBe(0);
      expect(byName.get("source_message_id")?.notnull).toBe(0);

      // notNull
      expect(byName.get("body")?.notnull).toBe(1);
      expect(byName.get("sent_date")?.notnull).toBe(1);
      expect(byName.get("responded")?.notnull).toBe(1);
    } finally {
      close();
    }
  });
});

describe("paths", () => {
  it("resolveDbPath returns two distinct absolute paths for demo and real", () => {
    const demoPath = resolveDbPath("demo");
    const realPath = resolveDbPath("real");
    expect(demoPath).not.toBe(realPath);
  });

  it("assertMode throws on an unset/invalid mode (fail loud, no default)", () => {
    expect(() => assertMode(undefined)).toThrow();
    expect(() => assertMode("bogus")).toThrow();
    expect(() => assertMode("demo")).not.toThrow();
    expect(() => assertMode("real")).not.toThrow();
  });
});
