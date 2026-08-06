import { describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import {
  FUNNEL_STAGE_ORDER,
  getAnalyticsSummary,
  getFunnelCounts,
} from "@/domain/analytics";
import { applications, companies, statusEvents, stages } from "@/db/schema";

// Hand-seeded stages mirroring tests/domain/board.test.ts's seedLookups
// pattern — every stage the funnel/summary computation needs to distinguish
// (the five funnel stages plus the three terminal outcomes) is inserted
// explicitly so isTerminal/outcomeLabel are exactly what analytics.ts reads.
function seedStages(db: TestDb["db"]) {
  const defs: Array<{
    label: string;
    isTerminal: boolean;
    outcomeLabel: string | null;
  }> = [
    { label: "Saved", isTerminal: false, outcomeLabel: null },
    { label: "Applied", isTerminal: false, outcomeLabel: null },
    { label: "Screen", isTerminal: false, outcomeLabel: null },
    { label: "Interview", isTerminal: false, outcomeLabel: null },
    { label: "Offer", isTerminal: true, outcomeLabel: "Offer" },
    { label: "Rejected", isTerminal: true, outcomeLabel: "Rejected" },
    { label: "Ghosted", isTerminal: true, outcomeLabel: "Ghosted" },
  ];

  const stageIds: Record<string, number> = {};
  for (const def of defs) {
    stageIds[def.label] = Number(
      db.insert(stages).values(def).run().lastInsertRowid,
    );
  }
  return stageIds;
}

function seedCompany(db: TestDb["db"]) {
  return Number(
    db
      .insert(companies)
      .values({ canonicalName: "Acme Corp", normalizedKey: "acme corp" })
      .run().lastInsertRowid,
  );
}

function createApplication(
  db: TestDb["db"],
  companyId: number,
  currentStageId: number | null,
) {
  return Number(
    db
      .insert(applications)
      .values({ companyId, currentStageId })
      .run().lastInsertRowid,
  );
}

function addEvent(
  db: TestDb["db"],
  applicationId: number,
  stageId: number,
  occurredAt: Date,
) {
  db.insert(statusEvents).values({ applicationId, stageId, occurredAt }).run();
}

describe("getFunnelCounts", () => {
  it("returns exactly five buckets in order Saved, Applied, Screen, Interview, Offer", () => {
    const { db, close } = createTestDb();
    try {
      seedStages(db);
      const funnel = getFunnelCounts(db);
      expect(funnel).toHaveLength(5);
      expect(funnel.map((b) => b.stageLabel)).toEqual([
        "Saved",
        "Applied",
        "Screen",
        "Interview",
        "Offer",
      ]);
      expect(FUNNEL_STAGE_ORDER).toEqual([
        "Saved",
        "Applied",
        "Screen",
        "Interview",
        "Offer",
      ]);
    } finally {
      close();
    }
  });

  it("counts an application that reaches Screen in Saved/Applied/Screen but not Interview/Offer", () => {
    const { db, close } = createTestDb();
    try {
      const stageIds = seedStages(db);
      const companyId = seedCompany(db);
      const appId = createApplication(db, companyId, stageIds.Screen ?? null);

      addEvent(db, appId, stageIds.Saved!, new Date("2026-01-01T00:00:00.000Z"));
      addEvent(db, appId, stageIds.Applied!, new Date("2026-01-02T00:00:00.000Z"));
      addEvent(db, appId, stageIds.Screen!, new Date("2026-01-03T00:00:00.000Z"));

      const funnel = getFunnelCounts(db);
      const byLabel = Object.fromEntries(funnel.map((b) => [b.stageLabel, b.count]));

      expect(byLabel.Saved).toBe(1);
      expect(byLabel.Applied).toBe(1);
      expect(byLabel.Screen).toBe(1);
      expect(byLabel.Interview).toBe(0);
      expect(byLabel.Offer).toBe(0);
    } finally {
      close();
    }
  });

  it("does not let a later Rejected event reduce a stage already reached (Rejected is not a funnel stage)", () => {
    const { db, close } = createTestDb();
    try {
      const stageIds = seedStages(db);
      const companyId = seedCompany(db);
      const appId = createApplication(db, companyId, stageIds.Rejected ?? null);

      addEvent(db, appId, stageIds.Saved!, new Date("2026-01-01T00:00:00.000Z"));
      addEvent(db, appId, stageIds.Applied!, new Date("2026-01-02T00:00:00.000Z"));
      addEvent(db, appId, stageIds.Screen!, new Date("2026-01-03T00:00:00.000Z"));
      addEvent(db, appId, stageIds.Rejected!, new Date("2026-01-04T00:00:00.000Z"));

      const funnel = getFunnelCounts(db);
      const byLabel = Object.fromEntries(funnel.map((b) => [b.stageLabel, b.count]));

      expect(byLabel.Screen).toBe(1);
      expect(byLabel.Interview).toBe(0);
      expect(byLabel.Offer).toBe(0);
    } finally {
      close();
    }
  });

  it("counts two applications both furthest-reaching Applied as Applied:2, Screen:0", () => {
    const { db, close } = createTestDb();
    try {
      const stageIds = seedStages(db);
      const companyId = seedCompany(db);

      const app1 = createApplication(db, companyId, stageIds.Applied ?? null);
      addEvent(db, app1, stageIds.Saved!, new Date("2026-01-01T00:00:00.000Z"));
      addEvent(db, app1, stageIds.Applied!, new Date("2026-01-02T00:00:00.000Z"));

      const app2 = createApplication(db, companyId, stageIds.Applied ?? null);
      addEvent(db, app2, stageIds.Saved!, new Date("2026-01-01T00:00:00.000Z"));
      addEvent(db, app2, stageIds.Applied!, new Date("2026-01-02T00:00:00.000Z"));

      const funnel = getFunnelCounts(db);
      const byLabel = Object.fromEntries(funnel.map((b) => [b.stageLabel, b.count]));

      expect(byLabel.Applied).toBe(2);
      expect(byLabel.Screen).toBe(0);
    } finally {
      close();
    }
  });

  it("returns monotonically non-increasing counts across the five buckets, with a never-reached stage at 0", () => {
    const { db, close } = createTestDb();
    try {
      const stageIds = seedStages(db);
      const companyId = seedCompany(db);

      // App A: reaches Interview (furthest)
      const appA = createApplication(db, companyId, stageIds.Interview ?? null);
      addEvent(db, appA, stageIds.Saved!, new Date("2026-01-01T00:00:00.000Z"));
      addEvent(db, appA, stageIds.Applied!, new Date("2026-01-02T00:00:00.000Z"));
      addEvent(db, appA, stageIds.Screen!, new Date("2026-01-03T00:00:00.000Z"));
      addEvent(db, appA, stageIds.Interview!, new Date("2026-01-04T00:00:00.000Z"));

      // App B: reaches Screen (furthest)
      const appB = createApplication(db, companyId, stageIds.Screen ?? null);
      addEvent(db, appB, stageIds.Saved!, new Date("2026-01-01T00:00:00.000Z"));
      addEvent(db, appB, stageIds.Applied!, new Date("2026-01-02T00:00:00.000Z"));
      addEvent(db, appB, stageIds.Screen!, new Date("2026-01-03T00:00:00.000Z"));

      // App C: reaches Applied (furthest)
      const appC = createApplication(db, companyId, stageIds.Applied ?? null);
      addEvent(db, appC, stageIds.Saved!, new Date("2026-01-01T00:00:00.000Z"));
      addEvent(db, appC, stageIds.Applied!, new Date("2026-01-02T00:00:00.000Z"));

      const funnel = getFunnelCounts(db);
      const counts = funnel.map((b) => b.count);

      expect(counts).toEqual([3, 3, 2, 1, 0]); // Saved, Applied, Screen, Interview, Offer

      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
      }

      // No application ever reached Offer.
      expect(funnel.find((b) => b.stageLabel === "Offer")?.count).toBe(0);
    } finally {
      close();
    }
  });

  it("returns all-zero buckets when zero applications exist", () => {
    const { db, close } = createTestDb();
    try {
      seedStages(db);
      const funnel = getFunnelCounts(db);
      expect(funnel.map((b) => b.count)).toEqual([0, 0, 0, 0, 0]);
    } finally {
      close();
    }
  });
});

describe("getAnalyticsSummary", () => {
  it("computes total/response-rate/active/closed/outcome breakdown from seeded fixtures", () => {
    const { db, close } = createTestDb();
    try {
      const stageIds = seedStages(db);
      const companyId = seedCompany(db);

      // reachedApplied population: exactly 3 applications ever reach at
      // least Applied (app1/app2/app3). Of those, only app3 goes on to
      // reach Screen+ -> responseRatePct = round(1/3*100) = 33. Note: Offer
      // IS itself a funnel stage (FUNNEL_STAGE_ORDER), so app5/app6 are kept
      // event-free below to avoid inflating reachedApplied/reachedScreenPlus
      // while still exercising the current-stage-label outcome breakdown.
      const app1 = createApplication(db, companyId, stageIds.Applied ?? null);
      addEvent(db, app1, stageIds.Saved!, new Date("2026-01-01T00:00:00.000Z"));
      addEvent(db, app1, stageIds.Applied!, new Date("2026-01-02T00:00:00.000Z"));

      const app2 = createApplication(db, companyId, stageIds.Rejected ?? null);
      addEvent(db, app2, stageIds.Saved!, new Date("2026-01-01T00:00:00.000Z"));
      addEvent(db, app2, stageIds.Applied!, new Date("2026-01-02T00:00:00.000Z"));
      addEvent(db, app2, stageIds.Rejected!, new Date("2026-01-03T00:00:00.000Z"));

      const app3 = createApplication(db, companyId, stageIds.Screen ?? null);
      addEvent(db, app3, stageIds.Saved!, new Date("2026-01-01T00:00:00.000Z"));
      addEvent(db, app3, stageIds.Applied!, new Date("2026-01-02T00:00:00.000Z"));
      addEvent(db, app3, stageIds.Screen!, new Date("2026-01-03T00:00:00.000Z"));

      // A fourth application still Saved (not applied) -- non-terminal,
      // does not reach Applied, so it must NOT count toward reachedApplied.
      const app4 = createApplication(db, companyId, stageIds.Saved ?? null);
      addEvent(db, app4, stageIds.Saved!, new Date("2026-01-01T00:00:00.000Z"));

      // A fifth application currently in Offer (terminal, outcome
      // breakdown) -- deliberately no statusEvents, so it contributes
      // nothing to the funnel counts above.
      const app5 = createApplication(db, companyId, stageIds.Offer ?? null);

      // A sixth application currently in Ghosted (terminal, outcome
      // breakdown) -- also event-free for the same reason.
      const app6 = createApplication(db, companyId, stageIds.Ghosted ?? null);

      const summary = getAnalyticsSummary(db);

      expect(summary.totalApplications).toBe(6);
      expect(summary.responseRatePct).toBe(33);
      // Non-terminal current stage: app1 (Applied), app3 (Screen), app4 (Saved) => active 3.
      expect(summary.active).toBe(3);
      // Terminal current stage: app2 (Rejected), app5 (Offer), app6 (Ghosted) => closed 3.
      expect(summary.closed).toBe(3);
      expect(summary.offers).toBe(1);
      expect(summary.rejected).toBe(1);
      expect(summary.ghosted).toBe(1);
    } finally {
      close();
    }
  });

  it("guards the divide-by-zero case: reachedApplied 0 => responseRatePct 0, never NaN/Infinity", () => {
    const { db, close } = createTestDb();
    try {
      const stageIds = seedStages(db);
      const companyId = seedCompany(db);

      // Only a Saved application exists -- reachedApplied is 0.
      const appId = createApplication(db, companyId, stageIds.Saved ?? null);
      addEvent(db, appId, stageIds.Saved!, new Date("2026-01-01T00:00:00.000Z"));

      const summary = getAnalyticsSummary(db);

      expect(summary.responseRatePct).toBe(0);
      expect(Number.isNaN(summary.responseRatePct)).toBe(false);
      expect(Number.isFinite(summary.responseRatePct)).toBe(true);
    } finally {
      close();
    }
  });

  it("returns zeroed-out totals when zero applications exist", () => {
    const { db, close } = createTestDb();
    try {
      seedStages(db);
      const summary = getAnalyticsSummary(db);

      expect(summary.totalApplications).toBe(0);
      expect(summary.responseRatePct).toBe(0);
      expect(summary.active).toBe(0);
      expect(summary.closed).toBe(0);
      expect(summary.offers).toBe(0);
      expect(summary.rejected).toBe(0);
      expect(summary.ghosted).toBe(0);

      const funnel = getFunnelCounts(db);
      expect(funnel.map((b) => b.count)).toEqual([0, 0, 0, 0, 0]);
    } finally {
      close();
    }
  });

  it("reconciles active + closed === totalApplications, including a null-currentStageId row (CR-01 regression)", () => {
    const { db, close } = createTestDb();
    try {
      const stageIds = seedStages(db);
      const companyId = seedCompany(db);

      // A row with no current stage assigned yet -- reachable via "Add
      // Application" with no stage picked (CR-01). Must land in `active`,
      // not be dropped from both buckets.
      createApplication(db, companyId, null);

      // A normal non-terminal row and a normal terminal row, to make sure
      // the reconciliation invariant holds across a mixed population too.
      createApplication(db, companyId, stageIds.Applied ?? null);
      createApplication(db, companyId, stageIds.Rejected ?? null);

      const summary = getAnalyticsSummary(db);

      expect(summary.totalApplications).toBe(3);
      expect(summary.active).toBe(2); // null-stage row + Applied row
      expect(summary.closed).toBe(1); // Rejected row
      expect(summary.active + summary.closed).toBe(summary.totalApplications);
    } finally {
      close();
    }
  });
});
