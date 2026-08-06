import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import {
  createApplication,
  getApplicationDetail,
  quickSaveApplication,
  updateApplication,
} from "@/domain/applications";
import { normalizeCompanyName } from "@/domain/companies";
import { appendStatusEvent } from "@/domain/events";
import { setOverride } from "@/domain/overrides";
import {
  applications,
  companies,
  roleTypes,
  sources,
  stages,
  statusEvents,
} from "@/db/schema";

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
  const rejectedStageId = Number(
    db
      .insert(stages)
      .values({ label: "Rejected", isTerminal: true, outcomeLabel: "Rejected" })
      .run().lastInsertRowid,
  );
  const offerStageId = Number(
    db
      .insert(stages)
      .values({ label: "Offer", isTerminal: true, outcomeLabel: "Offer" })
      .run().lastInsertRowid,
  );

  const roleTypeId = Number(
    db
      .insert(roleTypes)
      .values({ label: "Product Management" })
      .run().lastInsertRowid,
  );

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
    rejectedStageId,
    offerStageId,
    roleTypeId,
    sourceId,
    companyId,
  };
}

describe("createApplication / getApplicationDetail", () => {
  it("captures all dimensions in one record, with outcome derived from the current stage", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, roleTypeId, sourceId, companyId } =
        seedLookups(db);

      const dateApplied = new Date("2026-01-05T00:00:00.000Z");

      const applicationId = createApplication(db, {
        companyId,
        roleTitle: "Senior Product Manager",
        roleTypeId,
        sourceId,
        dateApplied,
      });

      // Simulate the current stage being set (recomputeCurrentStage is
      // implemented in a later task in this same plan) — Task 1 only tests
      // the read-side derivation, not how the projection gets written.
      db.update(applications)
        .set({ currentStageId: appliedStageId, currentStageSince: dateApplied })
        .where(eq(applications.id, applicationId))
        .run();

      const detail = getApplicationDetail(db, applicationId);

      expect(detail).toBeDefined();
      expect(detail?.companyId).toBe(companyId);
      expect(detail?.companyName).toBe("Acme Corp");
      expect(detail?.roleTitle).toBe("Senior Product Manager");
      expect(detail?.roleTypeId).toBe(roleTypeId);
      expect(detail?.roleTypeLabel).toBe("Product Management");
      expect(detail?.sourceId).toBe(sourceId);
      expect(detail?.sourceLabel).toBe("Referral");
      expect(detail?.dateApplied).toEqual(dateApplied);
      expect(detail?.currentStageId).toBe(appliedStageId);
      expect(detail?.currentStageLabel).toBe("Applied");
      // "Applied" has no outcome_label -> derived outcome is "Active"
      expect(detail?.outcome).toBe("Active");
    } finally {
      close();
    }
  });

  it("derives outcome from the current stage at read time — no stored outcome column exists", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, rejectedStageId, companyId } = seedLookups(db);

      const applicationId = createApplication(db, { companyId });

      db.update(applications)
        .set({ currentStageId: appliedStageId })
        .where(eq(applications.id, applicationId))
        .run();
      expect(getApplicationDetail(db, applicationId)?.outcome).toBe("Active");

      // Changing the current stage changes the derived outcome — nothing
      // else was written, proving outcome is computed, not stored.
      db.update(applications)
        .set({ currentStageId: rejectedStageId })
        .where(eq(applications.id, applicationId))
        .run();
      expect(getApplicationDetail(db, applicationId)?.outcome).toBe(
        "Rejected",
      );

      const columns = db.all<{ name: string }>(
        sql`PRAGMA table_info(applications)`,
      );
      expect(columns.map((c) => c.name)).not.toContain("outcome");
    } finally {
      close();
    }
  });
});

describe("quickSaveApplication", () => {
  it("atomically creates a company + application + exactly one Saved status event; currentStageId is never null", () => {
    const { db, close } = createTestDb();
    try {
      const { savedStageId } = seedLookups(db);

      const applicationId = quickSaveApplication(db, savedStageId, {
        companyName: "New Startup Co",
        roleTitle: "Product Manager",
        postingUrl: "https://example.com/jobs/123",
      });

      const detail = getApplicationDetail(db, applicationId);
      expect(detail?.companyName).toBe("New Startup Co");
      expect(detail?.roleTitle).toBe("Product Manager");
      expect(detail?.currentStageId).toBe(savedStageId);
      expect(detail?.currentStageLabel).toBe("Saved");

      const app = db
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .get();
      expect(app?.postingUrl).toBe("https://example.com/jobs/123");

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, applicationId))
        .all();
      expect(events).toHaveLength(1);
      expect(events[0]?.stageId).toBe(savedStageId);
    } finally {
      close();
    }
  });

  it("resolves an existing company instead of creating a duplicate", () => {
    const { db, close } = createTestDb();
    try {
      const { savedStageId, companyId } = seedLookups(db);

      const applicationId = quickSaveApplication(db, savedStageId, {
        companyName: "Acme Corp",
        roleTitle: "Engineer",
      });

      const detail = getApplicationDetail(db, applicationId);
      expect(detail?.companyId).toBe(companyId);

      const matchingCompanies = db
        .select()
        .from(companies)
        .where(eq(companies.normalizedKey, normalizeCompanyName("Acme Corp")))
        .all();
      expect(matchingCompanies).toHaveLength(1);
    } finally {
      close();
    }
  });

  it("rolls back the whole transaction if a step throws — no orphan company/application without its Saved event", () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);
      const bogusStageId = 999_999; // no such stage -> FK violation inside appendStatusEventTx

      expect(() =>
        quickSaveApplication(db, bogusStageId, {
          companyName: "Orphan Inc",
          roleTitle: "Founder",
        }),
      ).toThrow();

      const orphanCompany = db
        .select()
        .from(companies)
        .where(eq(companies.normalizedKey, normalizeCompanyName("Orphan Inc")))
        .get();
      expect(orphanCompany).toBeUndefined();

      const orphanEvents = db.select().from(statusEvents).all();
      expect(orphanEvents).toHaveLength(0);

      const allApplications = db.select().from(applications).all();
      expect(allApplications).toHaveLength(0);
    } finally {
      close();
    }
  });
});

describe("updateApplication", () => {
  it("with no stageId, updates only the given direct fields and leaves currentStageId untouched", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, companyId } = seedLookups(db);

      const applicationId = createApplication(db, { companyId });
      db.update(applications)
        .set({ currentStageId: appliedStageId })
        .where(eq(applications.id, applicationId))
        .run();

      updateApplication(db, applicationId, {
        roleTitle: "Updated Title",
      });

      const detail = getApplicationDetail(db, applicationId);
      expect(detail?.roleTitle).toBe("Updated Title");
      expect(detail?.currentStageId).toBe(appliedStageId);

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, applicationId))
        .all();
      expect(events).toHaveLength(0);
    } finally {
      close();
    }
  });

  it("with a stageId, appends exactly one new status event and recomputes the projection (never a direct column write)", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, rejectedStageId, companyId } = seedLookups(db);

      const applicationId = createApplication(db, { companyId });
      db.update(applications)
        .set({ currentStageId: appliedStageId })
        .where(eq(applications.id, applicationId))
        .run();

      updateApplication(db, applicationId, { stageId: rejectedStageId });

      const detail = getApplicationDetail(db, applicationId);
      expect(detail?.currentStageId).toBe(rejectedStageId);
      expect(detail?.outcome).toBe("Rejected");

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, applicationId))
        .all();
      expect(events).toHaveLength(1);
      expect(events[0]?.stageId).toBe(rejectedStageId);
    } finally {
      close();
    }
  });

  it("commits a combined field-edit + stage-change in one transaction with no nested-transaction error", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, offerStageId, companyId } = seedLookups(db);

      const applicationId = createApplication(db, { companyId });
      db.update(applications)
        .set({ currentStageId: appliedStageId })
        .where(eq(applications.id, applicationId))
        .run();

      expect(() =>
        updateApplication(db, applicationId, {
          roleTitle: "Senior Engineer",
          stageId: offerStageId,
        }),
      ).not.toThrow();

      const detail = getApplicationDetail(db, applicationId);
      expect(detail?.roleTitle).toBe("Senior Engineer");
      expect(detail?.currentStageId).toBe(offerStageId);
      expect(detail?.outcome).toBe("Offer");

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, applicationId))
        .all();
      expect(events).toHaveLength(1);
      expect(events[0]?.stageId).toBe(offerStageId);
    } finally {
      close();
    }
  });
});

describe("CAP-03 override precedence in read path", () => {
  it("override on current_stage wins over the derived stage, and survives a simulated re-parse", () => {
    const { db, close } = createTestDb();
    try {
      const { savedStageId, rejectedStageId } = seedLookups(db);

      const applicationId = quickSaveApplication(db, savedStageId, {
        companyName: "Override Test Co",
        roleTitle: "Product Manager",
      });

      // Pre-override: the derived stage is "Saved".
      expect(getApplicationDetail(db, applicationId)?.currentStageLabel).toBe(
        "Saved",
      );

      setOverride(db, applicationId, "current_stage", "Interview");

      // Override wins over the derived "Saved" value.
      expect(getApplicationDetail(db, applicationId)?.currentStageLabel).toBe(
        "Interview",
      );

      // Simulate a re-parse: a new status event for the same application
      // moves the derived projection to "Rejected". occurredAt must be
      // strictly after the Saved event's occurredAt (quickSaveApplication
      // uses `new Date()` at save time) — recomputeCurrentStage orders by
      // occurredAt, not insertion order, so an earlier-dated event here
      // would not become the current stage (DATA-03).
      appendStatusEvent(db, {
        applicationId,
        stageId: rejectedStageId,
        occurredAt: new Date(Date.now() + 60_000),
      });

      // The underlying projection did move...
      const rawRow = db
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .get();
      expect(rawRow?.currentStageId).toBe(rejectedStageId);

      // ...but the read path still reports the override — the correction
      // survives the re-sync (CAP-03).
      expect(getApplicationDetail(db, applicationId)?.currentStageLabel).toBe(
        "Interview",
      );
    } finally {
      close();
    }
  });

  it("override on company is returned by getApplicationDetail.companyName even after a field write", () => {
    const { db, close } = createTestDb();
    try {
      const { companyId } = seedLookups(db);

      const applicationId = createApplication(db, { companyId });

      setOverride(db, applicationId, "company", "Overridden Company Name");

      expect(getApplicationDetail(db, applicationId)?.companyName).toBe(
        "Overridden Company Name",
      );

      // A field write that does not touch `companies` (simulating an
      // unrelated re-parse writing role_title) must not disturb the
      // company override.
      updateApplication(db, applicationId, { roleTitle: "Re-parsed Title" });

      expect(getApplicationDetail(db, applicationId)?.companyName).toBe(
        "Overridden Company Name",
      );
    } finally {
      close();
    }
  });

  it("with no override set, getApplicationDetail returns the derived value unchanged", () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId, companyId } = seedLookups(db);

      const applicationId = createApplication(db, { companyId });
      db.update(applications)
        .set({ currentStageId: appliedStageId })
        .where(eq(applications.id, applicationId))
        .run();

      const detail = getApplicationDetail(db, applicationId);
      expect(detail?.companyName).toBe("Acme Corp");
      expect(detail?.currentStageLabel).toBe("Applied");
    } finally {
      close();
    }
  });
});
