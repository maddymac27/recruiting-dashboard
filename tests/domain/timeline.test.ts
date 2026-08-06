import { describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import { getJobTimeline } from "@/domain/timeline";
import { addConversation, createContact } from "@/domain/contacts";
import { applications, companies, stages, statusEvents } from "@/db/schema";

function seedApplicationWithStages(db: TestDb["db"]) {
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

  const companyId = Number(
    db
      .insert(companies)
      .values({ canonicalName: "Acme Corp", normalizedKey: "acme corp" })
      .run().lastInsertRowid,
  );

  const applicationId = Number(
    db
      .insert(applications)
      .values({ companyId, roleTitle: "PM", currentStageId: savedStageId })
      .run().lastInsertRowid,
  );

  return { applicationId, savedStageId, appliedStageId, companyId };
}

describe("getJobTimeline", () => {
  it("merges status_events (joined to stages for the stage label) and conversations into one most-recent-first list", () => {
    const { db, close } = createTestDb();
    try {
      const { applicationId, savedStageId, appliedStageId, companyId } =
        seedApplicationWithStages(db);

      const savedAt = new Date("2026-01-01T00:00:00.000Z");
      const appliedAt = new Date("2026-01-05T00:00:00.000Z");

      db.insert(statusEvents)
        .values({ applicationId, stageId: savedStageId, occurredAt: savedAt })
        .run();
      db.insert(statusEvents)
        .values({
          applicationId,
          stageId: appliedStageId,
          occurredAt: appliedAt,
        })
        .run();

      const contactId = createContact(db, {
        companyId,
        name: "Jane Recruiter",
      });
      const conversationAt = new Date("2026-01-03T00:00:00.000Z");
      addConversation(db, {
        contactId,
        applicationId,
        occurredAt: conversationAt,
        channel: "email",
        notes: "Introductory call",
      });

      const timeline = getJobTimeline(db, applicationId);

      expect(timeline).toHaveLength(3);
      expect(timeline.map((e) => e.kind)).toEqual([
        "status_event",
        "conversation",
        "status_event",
      ]);
      expect(timeline[0].occurredAt).toEqual(appliedAt);
      expect(timeline[0].stageLabel).toBe("Applied");
      expect(timeline[1].occurredAt).toEqual(conversationAt);
      expect(timeline[1].contactName).toBe("Jane Recruiter");
      expect(timeline[1].notes).toBe("Introductory call");
      expect(timeline[2].occurredAt).toEqual(savedAt);
      expect(timeline[2].stageLabel).toBe("Saved");
    } finally {
      close();
    }
  });

  it("keeps a status_event and a conversation with identical occurredAt as two separate entries in a stable, deterministic order", () => {
    const { db, close } = createTestDb();
    try {
      const { applicationId, savedStageId, companyId } =
        seedApplicationWithStages(db);

      const sameInstant = new Date("2026-01-01T12:00:00.000Z");

      db.insert(statusEvents)
        .values({
          applicationId,
          stageId: savedStageId,
          occurredAt: sameInstant,
        })
        .run();

      const contactId = createContact(db, {
        companyId,
        name: "Alex Referral",
      });
      addConversation(db, {
        contactId,
        applicationId,
        occurredAt: sameInstant,
        channel: "call",
        notes: "Same-instant conversation",
      });

      const first = getJobTimeline(db, applicationId);
      const second = getJobTimeline(db, applicationId);

      expect(first).toHaveLength(2);
      expect(first.map((e) => e.kind)).toEqual(second.map((e) => e.kind));
      expect(first[0].occurredAt).toEqual(sameInstant);
      expect(first[1].occurredAt).toEqual(sameInstant);
      // Deterministic tie order (RESEARCH Assumption A3 / Open Question 2):
      // the events query runs before conversations, so on an exact tie the
      // status_event keeps a lower stable source-order and sorts first.
      expect(first[0].kind).toBe("status_event");
      expect(first[1].kind).toBe("conversation");
    } finally {
      close();
    }
  });

  it("returns an empty array for an application with no status events and no conversations", () => {
    const { db, close } = createTestDb();
    try {
      const { applicationId } = seedApplicationWithStages(db);

      const timeline = getJobTimeline(db, applicationId);

      expect(timeline).toEqual([]);
    } finally {
      close();
    }
  });
});
