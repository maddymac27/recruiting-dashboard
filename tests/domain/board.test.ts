import { describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import { getPipelineSummary, listBoardApplications } from "@/domain/board";
import { listRoleTypes, listSources, listStages } from "@/domain/lookups";
import { applications, companies, roleTypes, sources, stages } from "@/db/schema";

function seedLookups(db: TestDb["db"]) {
  const savedStageId = Number(
    db
      .insert(stages)
      .values({ label: "Saved", isTerminal: false, outcomeLabel: null })
      .run().lastInsertRowid,
  );
  const appliedStageId = Number(
    db
      .insert(stages)
      .values({ label: "Applied", isTerminal: false, outcomeLabel: null })
      .run().lastInsertRowid,
  );
  const screenStageId = Number(
    db
      .insert(stages)
      .values({ label: "Screen", isTerminal: false, outcomeLabel: null })
      .run().lastInsertRowid,
  );
  const offerStageId = Number(
    db
      .insert(stages)
      .values({ label: "Offer", isTerminal: true, outcomeLabel: "Offer" })
      .run().lastInsertRowid,
  );
  const rejectedStageId = Number(
    db
      .insert(stages)
      .values({ label: "Rejected", isTerminal: true, outcomeLabel: "Rejected" })
      .run().lastInsertRowid,
  );

  const activeRoleTypeId = Number(
    db
      .insert(roleTypes)
      .values({ label: "Product Management", isActive: true })
      .run().lastInsertRowid,
  );
  db.insert(roleTypes)
    .values({ label: "Legacy Role", isActive: false })
    .run();

  const sourceId = Number(
    db.insert(sources).values({ label: "Referral" }).run().lastInsertRowid,
  );

  const companyId = Number(
    db
      .insert(companies)
      .values({ canonicalName: "Acme Corp", normalizedKey: "acme corp" })
      .run().lastInsertRowid,
  );

  return {
    savedStageId,
    appliedStageId,
    screenStageId,
    offerStageId,
    rejectedStageId,
    activeRoleTypeId,
    sourceId,
    companyId,
  };
}

describe("listBoardApplications", () => {
  it("returns one row per application, including saved-not-applied rows", () => {
    const { db, close } = createTestDb();
    try {
      const { savedStageId, appliedStageId, companyId } = seedLookups(db);

      const savedAppId = Number(
        db
          .insert(applications)
          .values({
            companyId,
            roleTitle: "Saved Role",
            dateApplied: null,
            currentStageId: savedStageId,
          })
          .run().lastInsertRowid,
      );

      const appliedAppId = Number(
        db
          .insert(applications)
          .values({
            companyId,
            roleTitle: "Applied Role",
            dateApplied: new Date("2026-01-05T00:00:00.000Z"),
            currentStageId: appliedStageId,
          })
          .run().lastInsertRowid,
      );

      const rows = listBoardApplications(db);

      expect(rows).toHaveLength(2);

      const savedRow = rows.find((r) => r.id === savedAppId);
      expect(savedRow).toBeDefined();
      expect(savedRow?.companyName).toBe("Acme Corp");
      expect(savedRow?.dateApplied).toBeNull();
      expect(savedRow?.currentStageId).toBe(savedStageId);
      expect(savedRow?.currentStageLabel).toBe("Saved");

      const appliedRow = rows.find((r) => r.id === appliedAppId);
      expect(appliedRow).toBeDefined();
      expect(appliedRow?.dateApplied).toEqual(
        new Date("2026-01-05T00:00:00.000Z"),
      );
      expect(appliedRow?.currentStageLabel).toBe("Applied");
    } finally {
      close();
    }
  });
});

describe("getPipelineSummary", () => {
  it("buckets applied / savedNotApplied / inProgress / closed from the board list", () => {
    const { db, close } = createTestDb();
    try {
      const { savedStageId, appliedStageId, offerStageId, rejectedStageId, companyId } =
        seedLookups(db);

      // one saved (dateApplied null)
      db.insert(applications)
        .values({ companyId, dateApplied: null, currentStageId: savedStageId })
        .run();

      // one applied + non-terminal (in progress)
      db.insert(applications)
        .values({
          companyId,
          dateApplied: new Date("2026-01-01T00:00:00.000Z"),
          currentStageId: appliedStageId,
        })
        .run();

      // one offer (terminal, closed)
      db.insert(applications)
        .values({
          companyId,
          dateApplied: new Date("2026-01-02T00:00:00.000Z"),
          currentStageId: offerStageId,
        })
        .run();

      // one rejected (terminal, closed)
      db.insert(applications)
        .values({
          companyId,
          dateApplied: new Date("2026-01-03T00:00:00.000Z"),
          currentStageId: rejectedStageId,
        })
        .run();

      const summary = getPipelineSummary(db);

      expect(summary).toEqual({
        savedNotApplied: 1,
        applied: 3,
        inProgress: 1,
        closed: 2,
      });
    } finally {
      close();
    }
  });
});

describe("lookups", () => {
  it("listStages returns all seeded stages ordered by id asc (canonical order)", () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      const result = listStages(db);

      expect(result.map((s) => s.label)).toEqual([
        "Saved",
        "Applied",
        "Screen",
        "Offer",
        "Rejected",
      ]);
      const ids = result.map((s) => s.id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    } finally {
      close();
    }
  });

  it("listRoleTypes returns only isActive rows", () => {
    const { db, close } = createTestDb();
    try {
      const { activeRoleTypeId } = seedLookups(db);

      const result = listRoleTypes(db);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(activeRoleTypeId);
      expect(result[0]?.label).toBe("Product Management");
    } finally {
      close();
    }
  });

  it("listSources returns all sources", () => {
    const { db, close } = createTestDb();
    try {
      const { sourceId } = seedLookups(db);

      const result = listSources(db);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(sourceId);
      expect(result[0]?.label).toBe("Referral");
    } finally {
      close();
    }
  });
});
