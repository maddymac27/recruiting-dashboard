import { describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import {
  addConversation,
  createContact,
  getApplicationsForContact,
  getContactSummariesForApplication,
  getContactsForApplication,
  getConversationsForApplication,
  getConversationsForContact,
  linkContactToApplication,
} from "@/domain/contacts";
import { applications, companies } from "@/db/schema";

function seedCompanyAndApplications(db: TestDb["db"], count: number) {
  const companyId = Number(
    db
      .insert(companies)
      .values({ canonicalName: "Acme Corp", normalizedKey: "acme corp" })
      .run().lastInsertRowid,
  );

  const applicationIds: number[] = [];
  for (let i = 0; i < count; i++) {
    applicationIds.push(
      Number(
        db.insert(applications).values({ companyId }).run().lastInsertRowid,
      ),
    );
  }

  return { companyId, applicationIds };
}

describe("createContact / linkContactToApplication", () => {
  it("multi-job linkage: one contact links to two applications, one application to two contacts, dates preserved (DATA-05)", () => {
    const { db, close } = createTestDb();
    try {
      const { companyId, applicationIds } = seedCompanyAndApplications(db, 2);
      const [appA, appB] = applicationIds;

      const contact1 = createContact(db, {
        companyId,
        name: "Jane Recruiter",
        relationshipType: "recruiter",
      });
      const contact2 = createContact(db, {
        companyId,
        name: "Alex Referral",
        relationshipType: "referral",
      });

      const linkedAt1 = new Date("2026-01-01T00:00:00.000Z");
      const linkedAt2 = new Date("2026-02-01T00:00:00.000Z");
      const linkedAt3 = new Date("2026-03-01T00:00:00.000Z");

      linkContactToApplication(db, contact1, appA, linkedAt1);
      linkContactToApplication(db, contact1, appB, linkedAt2);
      linkContactToApplication(db, contact2, appA, linkedAt3);

      const appsForContact1 = getApplicationsForContact(db, contact1);
      expect(appsForContact1).toHaveLength(2);
      expect(appsForContact1.map((r) => r.applicationId).sort()).toEqual(
        [appA, appB].sort(),
      );
      const linkForAppA = appsForContact1.find(
        (r) => r.applicationId === appA,
      );
      expect(linkForAppA?.linkedAt).toEqual(linkedAt1);

      const contactsForAppA = getContactsForApplication(db, appA);
      expect(contactsForAppA).toHaveLength(2);
      expect(contactsForAppA.map((r) => r.contactId).sort()).toEqual(
        [contact1, contact2].sort(),
      );
      const linkForContact2 = contactsForAppA.find(
        (r) => r.contactId === contact2,
      );
      expect(linkForContact2?.linkedAt).toEqual(linkedAt3);
    } finally {
      close();
    }
  });

  it("dated conversations: two conversations attach to a contact and return in occurred_at order (D-01)", () => {
    const { db, close } = createTestDb();
    try {
      const { companyId } = seedCompanyAndApplications(db, 0);

      const contactId = createContact(db, {
        companyId,
        name: "Jane Recruiter",
      });

      const earlier = new Date("2026-01-01T00:00:00.000Z");
      const later = new Date("2026-02-01T00:00:00.000Z");

      addConversation(db, {
        contactId,
        occurredAt: later,
        channel: "email",
        notes: "Second touchpoint",
      });
      addConversation(db, {
        contactId,
        occurredAt: earlier,
        channel: "call",
        notes: "First touchpoint",
      });

      const conversations = getConversationsForContact(db, contactId);
      expect(conversations).toHaveLength(2);
      expect(conversations[0].occurredAt).toEqual(earlier);
      expect(conversations[1].occurredAt).toEqual(later);
    } finally {
      close();
    }
  });
});

describe("getConversationsForApplication", () => {
  it("returns only the given application's conversations, joined to contact name, ordered by occurred_at ascending (CAP-04 read helper)", () => {
    const { db, close } = createTestDb();
    try {
      const { companyId, applicationIds } = seedCompanyAndApplications(db, 2);
      const [appA, appB] = applicationIds;

      const contactId = createContact(db, {
        companyId,
        name: "Jane Recruiter",
      });

      const earlier = new Date("2026-01-01T00:00:00.000Z");
      const later = new Date("2026-02-01T00:00:00.000Z");

      addConversation(db, {
        contactId,
        applicationId: appA,
        occurredAt: later,
        channel: "email",
        notes: "Second touchpoint on appA",
      });
      addConversation(db, {
        contactId,
        applicationId: appA,
        occurredAt: earlier,
        channel: "call",
        notes: "First touchpoint on appA",
      });
      addConversation(db, {
        contactId,
        applicationId: appB,
        occurredAt: earlier,
        channel: "call",
        notes: "Conversation on a different application",
      });

      const conversations = getConversationsForApplication(db, appA);

      expect(conversations).toHaveLength(2);
      expect(conversations[0].occurredAt).toEqual(earlier);
      expect(conversations[0].notes).toBe("First touchpoint on appA");
      expect(conversations[1].occurredAt).toEqual(later);
      expect(conversations.every((c) => c.contactName === "Jane Recruiter")).toBe(
        true,
      );
      expect(
        conversations.some(
          (c) => c.notes === "Conversation on a different application",
        ),
      ).toBe(false);
    } finally {
      close();
    }
  });
});

describe("addConversation - long/unicode notes round-trip (CAP-04 free-text paste path)", () => {
  it("persists a long multi-paragraph unicode notes string unchanged, readable via getConversationsForApplication (self-forwarded LinkedIn note capture fidelity)", () => {
    const { db, close } = createTestDb();
    try {
      const { companyId, applicationIds } = seedCompanyAndApplications(db, 1);
      const [appA] = applicationIds;

      const contactId = createContact(db, {
        companyId,
        name: "Priya Recruiter",
      });

      const longNotes =
        "Self-forwarded LinkedIn note — full paste, no truncation.\n\n".repeat(
          50,
        ) +
        "Unicode check: café, naïve, 你好, emoji 🎉, dash—em, quote “curly”.";

      addConversation(db, {
        contactId,
        applicationId: appA,
        occurredAt: new Date("2026-03-15T00:00:00.000Z"),
        channel: "LinkedIn",
        notes: longNotes,
      });

      const conversations = getConversationsForApplication(db, appA);

      expect(conversations).toHaveLength(1);
      expect(conversations[0].notes).toBe(longNotes);
      expect(conversations[0].notes?.length).toBe(longNotes.length);
    } finally {
      close();
    }
  });
});

describe("getContactSummariesForApplication", () => {
  it("returns {contactId, name} for every contact linked to the application, ordered by linked_at ascending (CAP-04 contacts sub-list + select)", () => {
    const { db, close } = createTestDb();
    try {
      const { companyId, applicationIds } = seedCompanyAndApplications(db, 1);
      const [appA] = applicationIds;

      const contact1 = createContact(db, {
        companyId,
        name: "Jane Recruiter",
      });
      const contact2 = createContact(db, {
        companyId,
        name: "Alex Referral",
      });

      linkContactToApplication(
        db,
        contact1,
        appA,
        new Date("2026-01-01T00:00:00.000Z"),
      );
      linkContactToApplication(
        db,
        contact2,
        appA,
        new Date("2026-02-01T00:00:00.000Z"),
      );

      const summaries = getContactSummariesForApplication(db, appA);

      expect(summaries).toHaveLength(2);
      expect(summaries[0]).toMatchObject({
        contactId: contact1,
        name: "Jane Recruiter",
      });
      expect(summaries[1]).toMatchObject({
        contactId: contact2,
        name: "Alex Referral",
      });
    } finally {
      close();
    }
  });

  it("returns an empty array when no contacts are linked", () => {
    const { db, close } = createTestDb();
    try {
      const { applicationIds } = seedCompanyAndApplications(db, 1);
      const [appA] = applicationIds;

      expect(getContactSummariesForApplication(db, appA)).toEqual([]);
    } finally {
      close();
    }
  });
});
