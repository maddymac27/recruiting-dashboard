import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import { appendStatusEvent, appendStatusEventTx } from "@/domain/events";
import { applications, companies, statusEvents, stages } from "@/db/schema";

function seedApplication(db: TestDb["db"]) {
  const appliedStageId = Number(
    db
      .insert(stages)
      .values({ label: "Applied", isTerminal: false, outcomeLabel: null })
      .run().lastInsertRowid,
  );
  const rejectedStageId = Number(
    db
      .insert(stages)
      .values({ label: "Rejected", isTerminal: true, outcomeLabel: "Rejected" })
      .run().lastInsertRowid,
  );

  const companyId = Number(
    db
      .insert(companies)
      .values({ canonicalName: "Acme Corp", normalizedKey: "acme corp" })
      .run().lastInsertRowid,
  );

  const applicationId = Number(
    db.insert(applications).values({ companyId }).run().lastInsertRowid,
  );

  return { appliedStageId, rejectedStageId, applicationId };
}

describe("appendStatusEvent", () => {
  it("append-only: two different events yield two rows, and neither is overwritten", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, rejectedStageId, applicationId } =
        seedApplication(db);

      appendStatusEvent(db, {
        applicationId,
        stageId: appliedStageId,
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        sourceMessageId: "msg-applied-1",
      });
      appendStatusEvent(db, {
        applicationId,
        stageId: rejectedStageId,
        occurredAt: new Date("2026-01-03T00:00:00.000Z"),
        sourceMessageId: "msg-rejected-1",
      });

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, applicationId))
        .orderBy(asc(statusEvents.id))
        .all();

      expect(events).toHaveLength(2);
      expect(events[0]?.stageId).toBe(appliedStageId);
      expect(events[0]?.sourceMessageId).toBe("msg-applied-1");
      expect(events[1]?.stageId).toBe(rejectedStageId);
      expect(events[1]?.sourceMessageId).toBe("msg-rejected-1");
    } finally {
      close();
    }
  });

  it("idempotent insert: re-inserting the same source_message_id creates no duplicate row (DATA-06)", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, applicationId } = seedApplication(db);

      const input = {
        applicationId,
        stageId: appliedStageId,
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        sourceMessageId: "msg-dup-1",
      };

      appendStatusEvent(db, input);
      appendStatusEvent(db, input);
      appendStatusEvent(db, input);

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.sourceMessageId, "msg-dup-1"))
        .all();

      expect(events).toHaveLength(1);
    } finally {
      close();
    }
  });

  it("two manual events with NULL source_message_id both persist (SQLite treats NULLs as distinct)", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, rejectedStageId, applicationId } =
        seedApplication(db);

      appendStatusEvent(db, {
        applicationId,
        stageId: appliedStageId,
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        sourceMessageId: null,
      });
      appendStatusEvent(db, {
        applicationId,
        stageId: rejectedStageId,
        occurredAt: new Date("2026-01-02T00:00:00.000Z"),
        sourceMessageId: null,
      });

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, applicationId))
        .all();

      expect(events).toHaveLength(2);
      expect(events.every((e) => e.sourceMessageId === null)).toBe(true);
    } finally {
      close();
    }
  });

  it("appendStatusEventTx is callable twice inside one outer transaction without a nested-transaction error (Pitfall 2 regression)", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, rejectedStageId, applicationId } =
        seedApplication(db);

      expect(() => {
        db.transaction((tx) => {
          appendStatusEventTx(tx, {
            applicationId,
            stageId: appliedStageId,
            occurredAt: new Date("2026-01-01T00:00:00.000Z"),
            sourceMessageId: null,
          });
          appendStatusEventTx(tx, {
            applicationId,
            stageId: rejectedStageId,
            occurredAt: new Date("2026-01-02T00:00:00.000Z"),
            sourceMessageId: null,
          });
        });
      }).not.toThrow();

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, applicationId))
        .orderBy(asc(statusEvents.id))
        .all();

      expect(events).toHaveLength(2);

      const [app] = db
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .all();

      expect(app?.currentStageId).toBe(rejectedStageId);
    } finally {
      close();
    }
  });
});
