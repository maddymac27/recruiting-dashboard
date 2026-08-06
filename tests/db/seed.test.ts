import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import { seedLookups } from "@/db/seed-lookups";
import { seedDemo } from "@/demo/seed/seed";

describe("seedLookups (D-05/D-06/D-07 — lookups)", () => {
  it("inserts the canonical stages, sources, and role types", () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      const stageRows = db.all<{ label: string; is_terminal: number; outcome_label: string | null }>(
        sql`SELECT label, is_terminal, outcome_label FROM stages ORDER BY id`,
      );
      const sourceRows = db.all<{ label: string }>(
        sql`SELECT label FROM sources ORDER BY id`,
      );
      const roleTypeRows = db.all<{ label: string }>(
        sql`SELECT label FROM role_types ORDER BY id`,
      );

      expect(stageRows.map((r) => r.label)).toEqual([
        "Saved",
        "Applied",
        "Screen",
        "Interview",
        "Offer",
        "Rejected",
        "Ghosted",
        "Withdrawn",
      ]);
      expect(sourceRows.map((r) => r.label)).toEqual([
        "Handshake",
        "Company site / ATS",
        "Referral",
        "LinkedIn",
        "Job board / Other",
      ]);
      expect(roleTypeRows.map((r) => r.label)).toEqual([
        "Product Management",
        "Strategy",
        "Chief of Staff",
        "Other",
      ]);

      const terminalOutcomes = Object.fromEntries(
        stageRows.map((r) => [r.label, { isTerminal: !!r.is_terminal, outcome: r.outcome_label }]),
      );
      expect(terminalOutcomes["Offer"]).toEqual({ isTerminal: true, outcome: "Offer" });
      expect(terminalOutcomes["Rejected"]).toEqual({ isTerminal: true, outcome: "Rejected" });
      expect(terminalOutcomes["Ghosted"]).toEqual({ isTerminal: true, outcome: "Ghosted" });
      expect(terminalOutcomes["Withdrawn"]).toEqual({ isTerminal: true, outcome: "Withdrawn" });
      expect(terminalOutcomes["Saved"]).toEqual({ isTerminal: false, outcome: null });
      expect(terminalOutcomes["Applied"]).toEqual({ isTerminal: false, outcome: null });
      expect(terminalOutcomes["Screen"]).toEqual({ isTerminal: false, outcome: null });
      expect(terminalOutcomes["Interview"]).toEqual({ isTerminal: false, outcome: null });
    } finally {
      close();
    }
  });

  it("is idempotent — running twice yields exactly one row per canonical label", () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);
      seedLookups(db);

      const stageCount = db.all<{ n: number }>(sql`SELECT COUNT(*) as n FROM stages`)[0].n;
      const sourceCount = db.all<{ n: number }>(sql`SELECT COUNT(*) as n FROM sources`)[0].n;
      const roleTypeCount = db.all<{ n: number }>(sql`SELECT COUNT(*) as n FROM role_types`)[0].n;

      expect(stageCount).toBe(8);
      expect(sourceCount).toBe(5);
      expect(roleTypeCount).toBe(4);
    } finally {
      close();
    }
  });
});

describe("seedDemo (DEMO-01, D-12 — invented-only demo dataset)", () => {
  it("populates >=15 invented companies spanning >=5 distinct stages, including Offer and Ghosted, with contacts and dated conversations", () => {
    const { db, close } = createTestDb();
    try {
      seedDemo(db);

      const companyRows = db.all<{ n: number }>(
        sql`SELECT COUNT(*) as n FROM companies`,
      );
      expect(companyRows[0].n).toBeGreaterThanOrEqual(15);

      const stageRows = db.all<{ label: string }>(
        sql`SELECT DISTINCT s.label as label
            FROM applications a
            JOIN stages s ON s.id = a.current_stage_id`,
      );
      const stageLabels = stageRows.map((r) => r.label);
      expect(stageLabels.length).toBeGreaterThanOrEqual(5);
      expect(stageLabels).toContain("Offer");
      expect(stageLabels).toContain("Ghosted");

      const contactCount = db.all<{ n: number }>(
        sql`SELECT COUNT(*) as n FROM contacts`,
      )[0].n;
      expect(contactCount).toBeGreaterThanOrEqual(1);

      const conversationCount = db.all<{ n: number }>(
        sql`SELECT COUNT(*) as n FROM conversations`,
      )[0].n;
      expect(conversationCount).toBeGreaterThanOrEqual(1);
    } finally {
      close();
    }
  });

  it("never references the real store path (structural isolation, Pitfall 4)", () => {
    const seedSource = readFileSync(
      path.resolve(__dirname, "../../src/demo/seed/seed.ts"),
      "utf-8",
    );
    expect(seedSource).not.toMatch(/resolveDbPath\(\s*["']real["']\s*\)/);
    expect(seedSource).not.toMatch(/real\.sqlite/);
  });
});
