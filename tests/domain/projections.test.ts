import { describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import { appendStatusEvent } from "@/domain/events";
import { applications, companies, stages } from "@/db/schema";
import { eq } from "drizzle-orm";

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
  const screenStageId = Number(
    db
      .insert(stages)
      .values({ label: "Screen", isTerminal: false, outcomeLabel: null })
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

  return { appliedStageId, rejectedStageId, screenStageId, applicationId };
}

describe("recomputeCurrentStage (via appendStatusEvent)", () => {
  it("derives current stage from occurred_at ordering, not insertion order (DATA-03)", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, rejectedStageId, applicationId } =
        seedApplication(db);

      // Insert in REVERSE real-world order: the later-dated Rejected event
      // is appended first (simulating a rejection processed before the
      // confirmation), THEN the earlier-dated Applied event.
      appendStatusEvent(db, {
        applicationId,
        stageId: rejectedStageId,
        occurredAt: new Date("2026-01-10T00:00:00.000Z"),
        sourceMessageId: "msg-rejected",
      });
      appendStatusEvent(db, {
        applicationId,
        stageId: appliedStageId,
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        sourceMessageId: "msg-applied",
      });

      const application = db
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .get();

      // Correct because occurred_at ordering — not insertion order —
      // determined the latest event.
      expect(application?.currentStageId).toBe(rejectedStageId);
      expect(application?.currentStageSince).toEqual(
        new Date("2026-01-10T00:00:00.000Z"),
      );
      expect(application?.lastInboundEventAt).toEqual(
        new Date("2026-01-10T00:00:00.000Z"),
      );
    } finally {
      close();
    }
  });

  it("uses id as a deterministic tiebreak when two events share the same occurred_at", () => {
    const { db, close } = createTestDb();
    try {
      const { screenStageId, rejectedStageId, applicationId } =
        seedApplication(db);

      const sameTimestamp = new Date("2026-02-01T00:00:00.000Z");

      appendStatusEvent(db, {
        applicationId,
        stageId: screenStageId,
        occurredAt: sameTimestamp,
        sourceMessageId: "msg-a",
      });
      appendStatusEvent(db, {
        applicationId,
        stageId: rejectedStageId,
        occurredAt: sameTimestamp,
        sourceMessageId: "msg-b",
      });

      const application = db
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .get();

      // Same occurred_at for both events — id ASC tiebreak means the
      // later-inserted (higher id) row, "msg-b" / Rejected, wins
      // deterministically.
      expect(application?.currentStageId).toBe(rejectedStageId);
    } finally {
      close();
    }
  });
});
