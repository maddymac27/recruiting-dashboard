import { describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import { getTodayItems } from "@/domain/today";
import {
  applications,
  companies,
  contacts,
  conversations,
  statusEvents,
  stages,
} from "@/db/schema";

// Integration test for the D5-01 Today-view read model — mirrors
// tests/domain/board.test.ts's hand-seed pattern (manual stages/companies/
// applications inserts, no seedLookups() production script).
// src/domain/today.ts does not exist yet at this commit — RED.

const now = new Date("2026-03-01T00:00:00.000Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * MS_PER_DAY);
}

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
  const ghostedStageId = Number(
    db
      .insert(stages)
      .values({ label: "Ghosted", isTerminal: true, outcomeLabel: "Ghosted" })
      .run().lastInsertRowid,
  );

  const companyId = Number(
    db
      .insert(companies)
      .values({ canonicalName: "Acme Corp", normalizedKey: "acme corp" })
      .run().lastInsertRowid,
  );

  return { savedStageId, appliedStageId, ghostedStageId, companyId };
}

function insertApplication(
  db: TestDb["db"],
  args: {
    companyId: number;
    currentStageId: number;
    currentStageSince: Date;
    dateApplied: Date | null;
  },
): number {
  return Number(
    db
      .insert(applications)
      .values({
        companyId: args.companyId,
        roleTitle: "Some Role",
        dateApplied: args.dateApplied,
        currentStageId: args.currentStageId,
        currentStageSince: args.currentStageSince,
      })
      .run().lastInsertRowid,
  );
}

function insertStatusEvent(
  db: TestDb["db"],
  args: { applicationId: number; stageId: number; occurredAt: Date },
): void {
  db.insert(statusEvents)
    .values({
      applicationId: args.applicationId,
      stageId: args.stageId,
      occurredAt: args.occurredAt,
    })
    .run();
}

function insertConversation(
  db: TestDb["db"],
  args: { applicationId: number; occurredAt: Date; companyId: number },
): void {
  const contactId = Number(
    db
      .insert(contacts)
      .values({ companyId: args.companyId, name: "A Recruiter" })
      .run().lastInsertRowid,
  );
  db.insert(conversations)
    .values({
      contactId,
      applicationId: args.applicationId,
      occurredAt: args.occurredAt,
    })
    .run();
}

describe("getTodayItems (D5-01, D5-03, D5-06)", () => {
  it("flags an Applied app whose latest status event (currentStageSince) is 20 days ago with no conversation as gone-quiet", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, companyId } = seedLookups(db);
      const appId = insertApplication(db, {
        companyId,
        currentStageId: appliedStageId,
        currentStageSince: daysAgo(20),
        dateApplied: daysAgo(20),
      });
      insertStatusEvent(db, {
        applicationId: appId,
        stageId: appliedStageId,
        occurredAt: daysAgo(20),
      });

      const items = getTodayItems(db, now);

      expect(items).toHaveLength(1);
      expect(items[0]?.application.id).toBe(appId);
      expect(items[0]?.status).toEqual({ kind: "gone-quiet", daysSince: 20 });
    } finally {
      close();
    }
  });

  it("uses the max of stage-change and conversation clocks (D5-01) — a recent conversation clears a stale stage change", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, companyId } = seedLookups(db);
      const appId = insertApplication(db, {
        companyId,
        currentStageId: appliedStageId,
        currentStageSince: daysAgo(20),
        dateApplied: daysAgo(20),
      });
      insertStatusEvent(db, {
        applicationId: appId,
        stageId: appliedStageId,
        occurredAt: daysAgo(20),
      });
      insertConversation(db, {
        applicationId: appId,
        occurredAt: daysAgo(2),
        companyId,
      });

      const items = getTodayItems(db, now);

      expect(items.find((item) => item.application.id === appId)).toBeUndefined();
    } finally {
      close();
    }
  });

  it("flags a Saved app (dateApplied null) whose Saved event is 10 days ago as saved-nudge", () => {
    const { db, close } = createTestDb();
    try {
      const { savedStageId, companyId } = seedLookups(db);
      const appId = insertApplication(db, {
        companyId,
        currentStageId: savedStageId,
        currentStageSince: daysAgo(10),
        dateApplied: null,
      });
      insertStatusEvent(db, {
        applicationId: appId,
        stageId: savedStageId,
        occurredAt: daysAgo(10),
      });

      const items = getTodayItems(db, now);

      expect(items).toHaveLength(1);
      expect(items[0]?.application.id).toBe(appId);
      expect(items[0]?.status).toEqual({ kind: "saved-nudge", daysSince: 10 });
    } finally {
      close();
    }
  });

  it("never flags a terminal (Ghosted) app regardless of age", () => {
    const { db, close } = createTestDb();
    try {
      const { ghostedStageId, companyId } = seedLookups(db);
      const appId = insertApplication(db, {
        companyId,
        currentStageId: ghostedStageId,
        currentStageSince: daysAgo(90),
        dateApplied: daysAgo(120),
      });
      insertStatusEvent(db, {
        applicationId: appId,
        stageId: ghostedStageId,
        occurredAt: daysAgo(90),
      });

      const items = getTodayItems(db, now);

      expect(items.find((item) => item.application.id === appId)).toBeUndefined();
    } finally {
      close();
    }
  });

  it("performs no writes — statusEvents row count is unchanged before and after (D5-06 read-time-only)", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, companyId } = seedLookups(db);
      const appId = insertApplication(db, {
        companyId,
        currentStageId: appliedStageId,
        currentStageSince: daysAgo(20),
        dateApplied: daysAgo(20),
      });
      insertStatusEvent(db, {
        applicationId: appId,
        stageId: appliedStageId,
        occurredAt: daysAgo(20),
      });

      const before = db.select().from(statusEvents).all().length;
      getTodayItems(db, now);
      const after = db.select().from(statusEvents).all().length;

      expect(after).toBe(before);
    } finally {
      close();
    }
  });

  it("orders gone-quiet items by daysSince descending, ties broken by application id ascending", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, companyId } = seedLookups(db);

      const appA = insertApplication(db, {
        companyId,
        currentStageId: appliedStageId,
        currentStageSince: daysAgo(20),
        dateApplied: daysAgo(20),
      });
      const appB = insertApplication(db, {
        companyId,
        currentStageId: appliedStageId,
        currentStageSince: daysAgo(20),
        dateApplied: daysAgo(20),
      });
      const appC = insertApplication(db, {
        companyId,
        currentStageId: appliedStageId,
        currentStageSince: daysAgo(30),
        dateApplied: daysAgo(30),
      });
      for (const [applicationId, occurredAt] of [
        [appA, daysAgo(20)],
        [appB, daysAgo(20)],
        [appC, daysAgo(30)],
      ] as const) {
        insertStatusEvent(db, { applicationId, stageId: appliedStageId, occurredAt });
      }

      const items = getTodayItems(db, now);

      expect(items.map((item) => item.application.id)).toEqual([
        appC,
        appA,
        appB,
      ]);
    } finally {
      close();
    }
  });
});
