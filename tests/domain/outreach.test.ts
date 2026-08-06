import { describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import {
  createOutreach,
  getOutreachCountsByContact,
  listOutreach,
} from "@/domain/outreach";
import { createContact } from "@/domain/contacts";
import { companies } from "@/db/schema";

function seedCompany(db: TestDb["db"], canonicalName = "Acme Corp") {
  return Number(
    db
      .insert(companies)
      .values({
        canonicalName,
        normalizedKey: canonicalName.toLowerCase(),
      })
      .run().lastInsertRowid,
  );
}

describe("createOutreach / listOutreach", () => {
  it("round-trips: create then list returns the row with contactName/companyName populated from the joins (OUT-01, OUT-03)", () => {
    const { db, close } = createTestDb();
    try {
      const companyId = seedCompany(db);
      const contactId = createContact(db, {
        companyId,
        name: "Jane Recruiter",
      });

      const sentDate = new Date("2026-02-01T00:00:00.000Z");
      const id = createOutreach(db, {
        contactId,
        companyId,
        channel: "LinkedIn",
        purpose: "Cold outreach",
        subject: "Quick question",
        body: "Hi Jane, would love to connect.",
        sentDate,
        responded: false,
        outcome: null,
      });

      const rows = listOutreach(db);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id,
        contactId,
        contactName: "Jane Recruiter",
        companyId,
        companyName: "Acme Corp",
        channel: "LinkedIn",
        purpose: "Cold outreach",
        subject: "Quick question",
        body: "Hi Jane, would love to connect.",
        responded: false,
        outcome: null,
      });
      expect(rows[0].sentDate).toEqual(sentDate);
    } finally {
      close();
    }
  });

  it("listOutreach() returns all rows; listOutreach({ contactId }) returns only that contact's rows (OUT-03)", () => {
    const { db, close } = createTestDb();
    try {
      const companyId = seedCompany(db);
      const contactA = createContact(db, { companyId, name: "Contact A" });
      const contactB = createContact(db, { companyId, name: "Contact B" });

      createOutreach(db, {
        contactId: contactA,
        companyId,
        channel: "Email",
        purpose: "Cold outreach",
        body: "A - first",
        sentDate: new Date("2026-01-01T00:00:00.000Z"),
      });
      createOutreach(db, {
        contactId: contactA,
        companyId,
        channel: "Email",
        purpose: "Follow-up",
        body: "A - second",
        sentDate: new Date("2026-01-02T00:00:00.000Z"),
      });
      createOutreach(db, {
        contactId: contactB,
        companyId,
        channel: "LinkedIn",
        purpose: "Cold outreach",
        body: "B - first",
        sentDate: new Date("2026-01-03T00:00:00.000Z"),
      });

      const all = listOutreach(db);
      expect(all).toHaveLength(3);

      const forA = listOutreach(db, { contactId: contactA });
      expect(forA).toHaveLength(2);
      expect(forA.every((r) => r.contactId === contactA)).toBe(true);

      const forB = listOutreach(db, { contactId: contactB });
      expect(forB).toHaveLength(1);
      expect(forB[0].contactId).toBe(contactB);
    } finally {
      close();
    }
  });

  it("a body containing unicode + emoji + embedded newlines reads back byte-identical (encoding edge)", () => {
    const { db, close } = createTestDb();
    try {
      const companyId = seedCompany(db);
      const contactId = createContact(db, { companyId, name: "Priya" });

      const body =
        "Hi Priya —\n\nLoved your post about scaling infra.\n" +
        "Unicode check: café, naïve, 你好, emoji 🎉🚀, dash—em, quote “curly”.";

      createOutreach(db, {
        contactId,
        companyId,
        channel: "LinkedIn",
        purpose: "Cold outreach",
        body,
        sentDate: new Date("2026-01-01T00:00:00.000Z"),
      });

      const rows = listOutreach(db);
      expect(rows[0].body).toBe(body);
      expect(rows[0].body.length).toBe(body.length);
    } finally {
      close();
    }
  });

  it("subject=null and outcome=null round-trip as null (partial/empty edge)", () => {
    const { db, close } = createTestDb();
    try {
      const companyId = seedCompany(db);
      const contactId = createContact(db, { companyId, name: "No Subject" });

      createOutreach(db, {
        contactId,
        companyId,
        channel: "Email",
        purpose: "Cold outreach",
        body: "No subject, no outcome yet.",
        sentDate: new Date("2026-01-01T00:00:00.000Z"),
      });

      const rows = listOutreach(db);
      expect(rows[0].subject).toBeNull();
      expect(rows[0].outcome).toBeNull();
    } finally {
      close();
    }
  });
});

describe("getOutreachCountsByContact", () => {
  it("returns a Map<contactId, count> built via TypeScript reduce, not a SQL aggregate (D-11, OUT-06)", () => {
    const { db, close } = createTestDb();
    try {
      const companyId = seedCompany(db);
      const contactA = createContact(db, { companyId, name: "Contact A" });
      const contactB = createContact(db, { companyId, name: "Contact B" });
      const contactC = createContact(db, { companyId, name: "Contact C" });

      createOutreach(db, {
        contactId: contactA,
        companyId,
        channel: "Email",
        purpose: "Cold outreach",
        body: "A - first",
        sentDate: new Date("2026-01-01T00:00:00.000Z"),
      });
      createOutreach(db, {
        contactId: contactA,
        companyId,
        channel: "Email",
        purpose: "Follow-up",
        body: "A - second",
        sentDate: new Date("2026-01-02T00:00:00.000Z"),
      });
      createOutreach(db, {
        contactId: contactB,
        companyId,
        channel: "LinkedIn",
        purpose: "Cold outreach",
        body: "B - first",
        sentDate: new Date("2026-01-03T00:00:00.000Z"),
      });

      const counts = getOutreachCountsByContact(db);
      expect(counts.get(contactA)).toBe(2);
      expect(counts.get(contactB)).toBe(1);
      expect(counts.has(contactC)).toBe(false);
    } finally {
      close();
    }
  });
});

describe("responded/outcome round-trip (OUT-06)", () => {
  it("responded=true with an outcome persists and reads back unchanged", () => {
    const { db, close } = createTestDb();
    try {
      const companyId = seedCompany(db);
      const contactId = createContact(db, { companyId, name: "Responded" });

      createOutreach(db, {
        contactId,
        companyId,
        channel: "LinkedIn",
        purpose: "Cold outreach",
        body: "Hi, are you hiring?",
        sentDate: new Date("2026-01-01T00:00:00.000Z"),
        responded: true,
        outcome: "call booked",
      });

      const rows = listOutreach(db);
      expect(rows[0].responded).toBe(true);
      expect(rows[0].outcome).toBe("call booked");
    } finally {
      close();
    }
  });

  it("responded=false reads back responded=false and outcome=null (empty + adjacency edge)", () => {
    const { db, close } = createTestDb();
    try {
      const companyId = seedCompany(db);
      const contactId = createContact(db, { companyId, name: "No Response" });

      createOutreach(db, {
        contactId,
        companyId,
        channel: "Email",
        purpose: "Cold outreach",
        body: "Hi, are you hiring?",
        sentDate: new Date("2026-01-01T00:00:00.000Z"),
        responded: false,
      });

      const rows = listOutreach(db);
      expect(rows[0].responded).toBe(false);
      expect(rows[0].outcome).toBeNull();
    } finally {
      close();
    }
  });
});
