import { eq } from "drizzle-orm";
import { Common } from "googleapis";
import { describe, expect, it } from "vitest";

import {
  applications,
  companies,
  deadLetter,
  ingestedMessages,
  reviewQueue,
  roleTypes,
  sources,
  statusEvents,
  stages,
} from "@/db/schema";
import { buildSenderQuery, KNOWN_SENDER_DOMAINS } from "@/gmail/query";
import { reparseDeadLetter, runGmailSync } from "@/domain/ingestion";
import { insertDeadLetterEntry } from "@/domain/dead-letter";
import { createTestDb, type TestDb } from "../helpers/db";
import { makeFakeGmailClient, type FakeGmailFixtures } from "../helpers/gmail";

const JOB_SEARCH_LABEL_ID = "Label_11";
const SENDER_QUERY = buildSenderQuery(KNOWN_SENDER_DOMAINS);

function encodeRawMessage(raw: string): string {
  return Buffer.from(raw, "utf-8").toString("base64url");
}

function workdayRaw({
  from = '"Visa" <visa@myworkday.com>',
  subject = "Application Update: Senior PM",
  body,
}: {
  from?: string;
  subject?: string;
  body: string;
}): string {
  return encodeRawMessage(
    [
      `From: ${from}`,
      `Subject: ${subject}`,
      "Date: Wed, 15 Jul 2026 10:00:00 -0700",
      'Content-Type: text/plain; charset="utf-8"',
      "",
      body,
      "",
    ].join("\r\n"),
  );
}

function labelMailRaw({
  from = '"Jamie Recruiter" <jamie@personalmail.example>',
  subject = "Re: your application",
  body = "Following up on our chat last week — let's grab time this Friday.",
}: {
  from?: string;
  subject?: string;
  body?: string;
} = {}): string {
  return encodeRawMessage(
    [
      `From: ${from}`,
      `Subject: ${subject}`,
      "Date: Wed, 15 Jul 2026 10:00:00 -0700",
      'Content-Type: text/plain; charset="utf-8"',
      "",
      body,
      "",
    ].join("\r\n"),
  );
}

const WORKDAY_APPLIED_BODY = [
  "Thank you for your interest in the Senior Product Manager position at Visa.",
  "We have received your application on July 15, 2026 and it is currently under review.",
].join("\n");

const WORKDAY_INTERVIEW_BODY = [
  "Thank you for your interest in the Senior Product Manager position at Visa.",
  "We would like to invite you to an interview for this role. Your interview has",
  "been scheduled for July 25, 2026.",
].join("\n");

const WORKDAY_BELOW_BAR_BODY = [
  "Thank you for your interest in the Senior Product Manager position at Visa.",
  "Your application is being processed. We will follow up soon.",
].join("\n");

const WORKDAY_UNMATCHED_BODY = [
  "Thank you for your interest in the Data Analyst position at Never Seen Inc.",
  "We have received your application on July 15, 2026 and it is currently under review.",
].join("\n");

// Same unknown company, but a REJECTION rather than an Applied confirmation
// — routing revision only auto-creates for "Applied"; anything else for a
// company we've never seen still needs a human to confirm it (03-02
// follow-up routing revision).
const WORKDAY_UNMATCHED_REJECTION_BODY = [
  "Thank you for your interest in the Data Analyst position at Never Seen Inc.",
  "After careful consideration, we have decided not to move forward with your",
  "application at this time. This decision was made on July 20, 2026.",
].join("\n");

function seedLookups(db: TestDb["db"]) {
  const savedStageId = Number(
    db.insert(stages).values({ label: "Saved", isTerminal: false, outcomeLabel: null }).run()
      .lastInsertRowid,
  );
  const appliedStageId = Number(
    db.insert(stages).values({ label: "Applied", isTerminal: false, outcomeLabel: null }).run()
      .lastInsertRowid,
  );
  db.insert(stages).values({ label: "Interview", isTerminal: false, outcomeLabel: null }).run();
  db.insert(stages).values({ label: "Rejected", isTerminal: true, outcomeLabel: "Rejected" }).run();
  db.insert(roleTypes).values({ label: "Product Management" }).run();
  db.insert(sources).values({ label: "Referral" }).run();
  db.insert(sources).values({ label: "Company site / ATS" }).run();

  return { savedStageId, appliedStageId };
}

/** Seeds a company + one open (non-terminal-stage) application for it, so a
 *  parsed transition has exactly one high-confidence candidate to attach to. */
function seedOpenApplication(
  db: TestDb["db"],
  companyName: string,
  stageId: number,
): number {
  const companyId = Number(
    db
      .insert(companies)
      .values({ canonicalName: companyName, normalizedKey: companyName.toLowerCase() })
      .run().lastInsertRowid,
  );
  const applicationId = Number(
    db.insert(applications).values({ companyId, currentStageId: stageId }).run()
      .lastInsertRowid,
  );
  return applicationId;
}

function buildClient(fixtures: FakeGmailFixtures) {
  return makeFakeGmailClient({
    labels: [{ id: JOB_SEARCH_LABEL_ID, name: "Job Search" }],
    pageSize: 50,
    ...fixtures,
  });
}

describe("runGmailSync", () => {
  it("Workday interview invite for a single open application becomes one dated transition, attached to the matched application, recorded once in the ledger", async () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId } = seedLookups(db);
      const applicationId = seedOpenApplication(db, "Visa", appliedStageId);

      const client = buildClient({
        messagesByQuery: {
          [SENDER_QUERY]: ["msg-interview"],
          [`label:${JOB_SEARCH_LABEL_ID}`]: [],
        },
        rawById: {
          "msg-interview": workdayRaw({ body: WORKDAY_INTERVIEW_BODY }),
        },
      });

      const counts = await runGmailSync(db, client, { lastSync: null, historyId: null });

      expect(counts).toEqual({
        newCount: 1,
        reviewCount: 0,
        deadLetterCount: 0,
        usedFallback: false,
      });

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, applicationId))
        .all();
      expect(events).toHaveLength(1);
      expect(events[0]?.sourceMessageId).toBe("msg-interview");
      // The parsed real-world event date (July 25, 2026), NEVER the raw
      // message's received-time (Wed, 15 Jul 2026 — D3-05).
      expect(events[0]?.occurredAt).toEqual(new Date("July 25, 2026"));

      const ledgerRow = db
        .select()
        .from(ingestedMessages)
        .where(eq(ingestedMessages.messageId, "msg-interview"))
        .get();
      expect(ledgerRow?.outcome).toBe("transition");
      expect(ledgerRow?.applicationId).toBe(applicationId);

      const app = db
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .get();
      // A parsed status is never written directly — only via the appended
      // event + projection recompute (D-09).
      expect(app?.currentStageId).not.toBeNull();
    } finally {
      close();
    }
  });

  it("a known-sender email below the D3-05 bar routes to dead_letter as known_sender_failed with the raw email attached", async () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      const client = buildClient({
        messagesByQuery: {
          [SENDER_QUERY]: ["msg-below-bar"],
          [`label:${JOB_SEARCH_LABEL_ID}`]: [],
        },
        rawById: {
          "msg-below-bar": workdayRaw({ body: WORKDAY_BELOW_BAR_BODY }),
        },
      });

      const counts = await runGmailSync(db, client, { lastSync: null, historyId: null });

      expect(counts).toEqual({
        newCount: 0,
        reviewCount: 0,
        deadLetterCount: 1,
        usedFallback: false,
      });

      const entry = db
        .select()
        .from(deadLetter)
        .where(eq(deadLetter.sourceMessageId, "msg-below-bar"))
        .get();
      expect(entry?.type).toBe("known_sender_failed");
      expect(entry?.rawPayload).toContain("being processed");

      const ledgerRow = db
        .select()
        .from(ingestedMessages)
        .where(eq(ingestedMessages.messageId, "msg-below-bar"))
        .get();
      expect(ledgerRow?.outcome).toBe("dead_letter");
    } finally {
      close();
    }
  });

  it("an unmatched known-sender APPLIED confirmation (no existing company) auto-creates the application + Applied event (03-02 routing revision)", async () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      const client = buildClient({
        messagesByQuery: {
          [SENDER_QUERY]: ["msg-unmatched"],
          [`label:${JOB_SEARCH_LABEL_ID}`]: [],
        },
        rawById: {
          "msg-unmatched": workdayRaw({ body: WORKDAY_UNMATCHED_BODY }),
        },
      });

      const counts = await runGmailSync(db, client, { lastSync: null, historyId: null });

      // Auto-create folds into newCount, exactly like any other transition
      // — never a review row for a high-confidence Applied confirmation.
      expect(counts).toEqual({
        newCount: 1,
        reviewCount: 0,
        deadLetterCount: 0,
        usedFallback: false,
      });

      expect(db.select().from(reviewQueue).all()).toHaveLength(0);

      const company = db
        .select()
        .from(companies)
        .where(eq(companies.canonicalName, "Never Seen Inc"))
        .get();
      expect(company).toBeDefined();

      const application = db
        .select()
        .from(applications)
        .where(eq(applications.companyId, company!.id))
        .get();
      expect(application).toBeDefined();
      expect(application?.dateApplied).toEqual(new Date("July 15, 2026"));

      // Source resolves to the existing "Company site / ATS" lookup value
      // (D-06) — never a new per-ATS-vendor source row.
      const atsSource = db
        .select()
        .from(sources)
        .where(eq(sources.label, "Company site / ATS"))
        .get();
      expect(application?.sourceId).toBe(atsSource!.id);

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, application!.id))
        .all();
      expect(events).toHaveLength(1);
      expect(events[0]?.sourceMessageId).toBe("msg-unmatched");
      expect(events[0]?.confidence).toBe(1);

      const appAfter = db
        .select()
        .from(applications)
        .where(eq(applications.id, application!.id))
        .get();
      expect(appAfter?.currentStageId).not.toBeNull();

      const ledgerRow = db
        .select()
        .from(ingestedMessages)
        .where(eq(ingestedMessages.messageId, "msg-unmatched"))
        .get();
      expect(ledgerRow?.outcome).toBe("transition");
      expect(ledgerRow?.applicationId).toBe(application!.id);
    } finally {
      close();
    }
  });

  it("an unmatched known-sender REJECTION (no existing company) still routes to review as unmatched_confirm_create — only Applied auto-creates", async () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      const client = buildClient({
        messagesByQuery: {
          [SENDER_QUERY]: ["msg-unmatched-rejection"],
          [`label:${JOB_SEARCH_LABEL_ID}`]: [],
        },
        rawById: {
          "msg-unmatched-rejection": workdayRaw({ body: WORKDAY_UNMATCHED_REJECTION_BODY }),
        },
      });

      const counts = await runGmailSync(db, client, { lastSync: null, historyId: null });

      expect(counts).toEqual({
        newCount: 0,
        reviewCount: 1,
        deadLetterCount: 0,
        usedFallback: false,
      });

      const entry = db
        .select()
        .from(reviewQueue)
        .where(eq(reviewQueue.sourceMessageId, "msg-unmatched-rejection"))
        .get();
      expect(entry?.type).toBe("unmatched_confirm_create");
      expect(entry?.parsedCompany).toBe("Never Seen Inc");
      expect(entry?.parsedStageLabel).toBe("Rejected");
      expect(entry?.candidateApplicationId).toBeNull();

      expect(db.select().from(applications).all()).toHaveLength(0);
      expect(db.select().from(companies).all()).toHaveLength(0);

      const ledgerRow = db
        .select()
        .from(ingestedMessages)
        .where(eq(ingestedMessages.messageId, "msg-unmatched-rejection"))
        .get();
      expect(ledgerRow?.outcome).toBe("review");
    } finally {
      close();
    }
  });

  it("a SECOND same-run Applied confirmation for a company just auto-created in this run matches it as a transition, not a duplicate application (de-dup via sequential per-message transactions)", async () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      const client = buildClient({
        messagesByQuery: {
          [SENDER_QUERY]: ["msg-unmatched-first", "msg-unmatched-second"],
          [`label:${JOB_SEARCH_LABEL_ID}`]: [],
        },
        rawById: {
          "msg-unmatched-first": workdayRaw({
            from: '"Never Seen Inc" <careers@myworkday.com>',
            body: WORKDAY_UNMATCHED_BODY,
          }),
          "msg-unmatched-second": workdayRaw({
            from: '"Never Seen Inc" <careers@myworkday.com>',
            body: [
              "Thank you for your interest in the Data Analyst position at Never Seen Inc.",
              "We would like to invite you to an interview for this role. Your interview has",
              "been scheduled for July 25, 2026.",
            ].join("\n"),
          }),
        },
      });

      const counts = await runGmailSync(db, client, { lastSync: null, historyId: null });

      // msg-unmatched-first: auto-create (newCount). msg-unmatched-second:
      // resolves via matchApplication to the SAME just-created application
      // (high-confidence transition) — also newCount, never a second
      // company/application row.
      expect(counts).toEqual({
        newCount: 2,
        reviewCount: 0,
        deadLetterCount: 0,
        usedFallback: false,
      });

      expect(db.select().from(companies).all()).toHaveLength(1);
      expect(db.select().from(applications).all()).toHaveLength(1);

      const application = db.select().from(applications).get();
      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, application!.id))
        .all();
      expect(events).toHaveLength(2);
    } finally {
      close();
    }
  });

  it("a label-only message (unknown sender, only in the Job Search label) routes to review as label_mail with the verbatim body", async () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      const client = buildClient({
        messagesByQuery: {
          [SENDER_QUERY]: [],
          [`label:${JOB_SEARCH_LABEL_ID}`]: ["msg-label-only"],
        },
        rawById: {
          "msg-label-only": labelMailRaw(),
        },
      });

      const counts = await runGmailSync(db, client, { lastSync: null, historyId: null });

      expect(counts).toEqual({
        newCount: 0,
        reviewCount: 1,
        deadLetterCount: 0,
        usedFallback: false,
      });

      const entry = db
        .select()
        .from(reviewQueue)
        .where(eq(reviewQueue.sourceMessageId, "msg-label-only"))
        .get();
      expect(entry?.type).toBe("label_mail");
      expect(entry?.bodyText).toContain("grab time this Friday");

      const ledgerRow = db
        .select()
        .from(ingestedMessages)
        .where(eq(ingestedMessages.messageId, "msg-label-only"))
        .get();
      expect(ledgerRow?.outcome).toBe("review");
    } finally {
      close();
    }
  });

  it("a query↔label overlap (same message id caught by both passes) is recorded once — the parsed-transition path wins, no duplicate label_mail row (D3-06)", async () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId } = seedLookups(db);
      const applicationId = seedOpenApplication(db, "Visa", appliedStageId);

      const client = buildClient({
        messagesByQuery: {
          [SENDER_QUERY]: ["msg-overlap"],
          [`label:${JOB_SEARCH_LABEL_ID}`]: ["msg-overlap"],
        },
        rawById: {
          "msg-overlap": workdayRaw({ body: WORKDAY_APPLIED_BODY }),
        },
      });

      const counts = await runGmailSync(db, client, { lastSync: null, historyId: null });

      expect(counts).toEqual({
        newCount: 1,
        reviewCount: 0,
        deadLetterCount: 0,
        usedFallback: false,
      });

      const ledgerRows = db
        .select()
        .from(ingestedMessages)
        .where(eq(ingestedMessages.messageId, "msg-overlap"))
        .all();
      expect(ledgerRows).toHaveLength(1);
      expect(ledgerRows[0]?.outcome).toBe("transition");

      const reviewRows = db
        .select()
        .from(reviewQueue)
        .where(eq(reviewQueue.sourceMessageId, "msg-overlap"))
        .all();
      expect(reviewRows).toHaveLength(0);

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, applicationId))
        .all();
      expect(events).toHaveLength(1);
    } finally {
      close();
    }
  });

  it("re-running a sync over the same messages is idempotent — no duplicate events/rows (DATA-06)", async () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId } = seedLookups(db);
      seedOpenApplication(db, "Visa", appliedStageId);

      const client = buildClient({
        messagesByQuery: {
          [SENDER_QUERY]: ["msg-interview", "msg-below-bar"],
          [`label:${JOB_SEARCH_LABEL_ID}`]: ["msg-label-only"],
        },
        rawById: {
          "msg-interview": workdayRaw({ body: WORKDAY_INTERVIEW_BODY }),
          "msg-below-bar": workdayRaw({ body: WORKDAY_BELOW_BAR_BODY }),
          "msg-label-only": labelMailRaw(),
        },
      });

      const first = await runGmailSync(db, client, { lastSync: null, historyId: null });
      expect(first).toEqual({
        newCount: 1,
        reviewCount: 1,
        deadLetterCount: 1,
        usedFallback: false,
      });

      const second = await runGmailSync(db, client, { lastSync: null, historyId: null });
      expect(second).toEqual({
        newCount: 0,
        reviewCount: 0,
        deadLetterCount: 0,
        usedFallback: false,
      });

      expect(db.select().from(statusEvents).all()).toHaveLength(1);
      expect(db.select().from(reviewQueue).all()).toHaveLength(1);
      expect(db.select().from(deadLetter).all()).toHaveLength(1);
      expect(db.select().from(ingestedMessages).all()).toHaveLength(3);
    } finally {
      close();
    }
  });
});

// Real-shape fixture (D3-05 REVISED): company + Applied status extract
// cleanly, but — matching every real Workday row sampled from
// data/real.sqlite — there is NO explicit date in the body at all. Under
// the revised policy this now resolves via received-time, not dead-letter.
const WORKDAY_APPLIED_NO_EXPLICIT_DATE_BODY = [
  "Thank you for your interest in the Senior Product Manager position at Visa.",
  "Thank you so much for applying! Your application will be taken into careful",
  "consideration and you will hear back from us after we review your application.",
].join("\n");

// The Date header every workdayRaw() fixture uses by default (see
// workdayRaw above) — the expected received-time fallback value.
const WORKDAY_RAW_RECEIVED_AT = new Date("Wed, 15 Jul 2026 10:00:00 -0700");

describe("reparseDeadLetter", () => {
  it("resolves a pending dead-letter row into a transition using the EXPLICIT date when one is present, re-fetching the message from Gmail", async () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId } = seedLookups(db);
      const applicationId = seedOpenApplication(db, "Visa", appliedStageId);

      insertDeadLetterEntry(db, {
        type: "known_sender_failed",
        sourceMessageId: "msg-reparse-transition",
        rawPayload: WORKDAY_INTERVIEW_BODY,
        sender: '"Visa" <visa@myworkday.com>',
        subject: "Application Update: Senior PM",
        failedStage: "extract",
        errorMessage: "pre-fix parser failure",
      });

      const client = buildClient({
        rawById: {
          "msg-reparse-transition": workdayRaw({ body: WORKDAY_INTERVIEW_BODY }),
        },
      });

      const counts = await reparseDeadLetter(db, client);

      expect(counts).toEqual({
        resolvedAsTransitionCount: 1,
        resolvedAsReviewCount: 0,
        stillFailedCount: 0,
      });

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, applicationId))
        .all();
      expect(events).toHaveLength(1);
      expect(events[0]?.sourceMessageId).toBe("msg-reparse-transition");
      // The explicit date (July 25, 2026) wins over the message's received
      // time (July 15, 2026 per WORKDAY_RAW_RECEIVED_AT) — explicit always
      // beats received-time fallback.
      expect(events[0]?.occurredAt).toEqual(new Date("July 25, 2026"));
      expect(events[0]?.occurredAt).not.toEqual(WORKDAY_RAW_RECEIVED_AT);

      const dlEntry = db
        .select()
        .from(deadLetter)
        .where(eq(deadLetter.sourceMessageId, "msg-reparse-transition"))
        .get();
      expect(dlEntry?.status).toBe("resolved");
      expect(dlEntry?.resolvedAt).not.toBeNull();
      // The original failure record is preserved, never deleted (REL-02).
      expect(dlEntry?.errorMessage).toBe("pre-fix parser failure");
    } finally {
      close();
    }
  });

  it("resolves a pending dead-letter row into a transition using RECEIVED-TIME when the real template has no explicit date (D3-05 revised policy)", async () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId } = seedLookups(db);
      const applicationId = seedOpenApplication(db, "Visa", appliedStageId);

      insertDeadLetterEntry(db, {
        type: "known_sender_failed",
        sourceMessageId: "msg-reparse-received-time",
        rawPayload: WORKDAY_APPLIED_NO_EXPLICIT_DATE_BODY,
        sender: '"Visa" <visa@myworkday.com>',
        subject: "Application Update: Senior PM",
      });

      const client = buildClient({
        rawById: {
          "msg-reparse-received-time": workdayRaw({
            body: WORKDAY_APPLIED_NO_EXPLICIT_DATE_BODY,
          }),
        },
      });

      const counts = await reparseDeadLetter(db, client);

      expect(counts).toEqual({
        resolvedAsTransitionCount: 1,
        resolvedAsReviewCount: 0,
        stillFailedCount: 0,
      });

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, applicationId))
        .all();
      expect(events).toHaveLength(1);
      expect(events[0]?.occurredAt).toEqual(WORKDAY_RAW_RECEIVED_AT);

      const dlEntry = db
        .select()
        .from(deadLetter)
        .where(eq(deadLetter.sourceMessageId, "msg-reparse-received-time"))
        .get();
      expect(dlEntry?.status).toBe("resolved");
    } finally {
      close();
    }
  });

  it("resolves a pending dead-letter row into an auto-created application when the unmatched company's confirmation is Applied (03-02 routing revision)", async () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      insertDeadLetterEntry(db, {
        type: "known_sender_failed",
        sourceMessageId: "msg-reparse-autocreate",
        rawPayload: WORKDAY_UNMATCHED_BODY,
        sender: '"Visa" <visa@myworkday.com>',
        subject: "Application Update: Data Analyst",
      });

      const client = buildClient({
        rawById: {
          "msg-reparse-autocreate": workdayRaw({ body: WORKDAY_UNMATCHED_BODY }),
        },
      });

      const counts = await reparseDeadLetter(db, client);

      expect(counts).toEqual({
        resolvedAsTransitionCount: 1,
        resolvedAsReviewCount: 0,
        stillFailedCount: 0,
      });

      expect(db.select().from(reviewQueue).all()).toHaveLength(0);

      const company = db
        .select()
        .from(companies)
        .where(eq(companies.canonicalName, "Never Seen Inc"))
        .get();
      expect(company).toBeDefined();

      const application = db
        .select()
        .from(applications)
        .where(eq(applications.companyId, company!.id))
        .get();
      expect(application).toBeDefined();

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, application!.id))
        .all();
      expect(events).toHaveLength(1);
      expect(events[0]?.sourceMessageId).toBe("msg-reparse-autocreate");

      const dlEntry = db
        .select()
        .from(deadLetter)
        .where(eq(deadLetter.sourceMessageId, "msg-reparse-autocreate"))
        .get();
      expect(dlEntry?.status).toBe("resolved");
    } finally {
      close();
    }
  });

  it("resolves a pending dead-letter row into a review-queue entry when the unmatched company's confirmation is a REJECTION, not Applied", async () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      insertDeadLetterEntry(db, {
        type: "known_sender_failed",
        sourceMessageId: "msg-reparse-review",
        rawPayload: WORKDAY_UNMATCHED_REJECTION_BODY,
        sender: '"Visa" <visa@myworkday.com>',
        subject: "Application Update: Data Analyst",
      });

      const client = buildClient({
        rawById: {
          "msg-reparse-review": workdayRaw({ body: WORKDAY_UNMATCHED_REJECTION_BODY }),
        },
      });

      const counts = await reparseDeadLetter(db, client);

      expect(counts).toEqual({
        resolvedAsTransitionCount: 0,
        resolvedAsReviewCount: 1,
        stillFailedCount: 0,
      });

      const reviewEntry = db
        .select()
        .from(reviewQueue)
        .where(eq(reviewQueue.sourceMessageId, "msg-reparse-review"))
        .get();
      expect(reviewEntry?.type).toBe("unmatched_confirm_create");
      expect(reviewEntry?.parsedCompany).toBe("Never Seen Inc");
      expect(reviewEntry?.parsedStageLabel).toBe("Rejected");

      expect(db.select().from(applications).all()).toHaveLength(0);

      const dlEntry = db
        .select()
        .from(deadLetter)
        .where(eq(deadLetter.sourceMessageId, "msg-reparse-review"))
        .get();
      expect(dlEntry?.status).toBe("resolved");
    } finally {
      close();
    }
  });

  it("leaves a dead-letter row pending when the (still-fixed) parser can't extract a status at all", async () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      insertDeadLetterEntry(db, {
        type: "known_sender_failed",
        sourceMessageId: "msg-reparse-still-failing",
        rawPayload: WORKDAY_BELOW_BAR_BODY,
        sender: '"Visa" <visa@myworkday.com>',
        subject: "Application Update: Senior PM",
      });

      const client = buildClient({
        rawById: {
          "msg-reparse-still-failing": workdayRaw({ body: WORKDAY_BELOW_BAR_BODY }),
        },
      });

      const counts = await reparseDeadLetter(db, client);

      expect(counts).toEqual({
        resolvedAsTransitionCount: 0,
        resolvedAsReviewCount: 0,
        stillFailedCount: 1,
      });

      const dlEntry = db
        .select()
        .from(deadLetter)
        .where(eq(deadLetter.sourceMessageId, "msg-reparse-still-failing"))
        .get();
      expect(dlEntry?.status).toBe("pending");
      expect(dlEntry?.resolvedAt).toBeNull();
    } finally {
      close();
    }
  });

  it("leaves an 'unparseable' dead-letter row pending when the sender's domain still has no registered parser (never even attempts a fetch)", async () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      insertDeadLetterEntry(db, {
        type: "unparseable",
        sourceMessageId: "msg-reparse-no-parser",
        rawPayload: "some recruiter's plain-text email",
        sender: '"Jordan" <jordan@personalmail.example>',
        subject: "Re: your application",
      });

      // No rawById fixture for this message id — proves dispatchParser is
      // checked BEFORE any fetch is attempted.
      const client = buildClient({});

      const counts = await reparseDeadLetter(db, client);

      expect(counts).toEqual({
        resolvedAsTransitionCount: 0,
        resolvedAsReviewCount: 0,
        stillFailedCount: 1,
      });

      expect(db.select().from(reviewQueue).all()).toHaveLength(0);
      expect(db.select().from(statusEvents).all()).toHaveLength(0);
      const dlEntry = db
        .select()
        .from(deadLetter)
        .where(eq(deadLetter.sourceMessageId, "msg-reparse-no-parser"))
        .get();
      expect(dlEntry?.status).toBe("pending");
    } finally {
      close();
    }
  });

  it("leaves a dead-letter row pending (fail-loud, not aborted) when the message can no longer be fetched from Gmail", async () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      insertDeadLetterEntry(db, {
        type: "known_sender_failed",
        sourceMessageId: "msg-reparse-deleted",
        rawPayload: WORKDAY_APPLIED_BODY,
        sender: '"Visa" <visa@myworkday.com>',
        subject: "Application Update: Senior PM",
      });

      // No rawById fixture for "msg-reparse-deleted" — makeFakeGmailClient's
      // getMessageRaw throws for any id it wasn't given, simulating a
      // message that's since been deleted/moved in Gmail.
      const client = buildClient({});

      const counts = await reparseDeadLetter(db, client);

      expect(counts).toEqual({
        resolvedAsTransitionCount: 0,
        resolvedAsReviewCount: 0,
        stillFailedCount: 1,
      });

      const dlEntry = db
        .select()
        .from(deadLetter)
        .where(eq(deadLetter.sourceMessageId, "msg-reparse-deleted"))
        .get();
      expect(dlEntry?.status).toBe("pending");
    } finally {
      close();
    }
  });

  it("never touches the ingested_messages dedup ledger — that ledger's job (preventing a re-fetch of the original sync pass) is a separate concern from resolving a dead-letter row", async () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId } = seedLookups(db);
      seedOpenApplication(db, "Visa", appliedStageId);

      insertDeadLetterEntry(db, {
        type: "known_sender_failed",
        sourceMessageId: "msg-reparse-ledger",
        rawPayload: WORKDAY_APPLIED_BODY,
        sender: '"Visa" <visa@myworkday.com>',
        subject: "Application Update: Senior PM",
      });
      db.insert(ingestedMessages)
        .values({ messageId: "msg-reparse-ledger", outcome: "dead_letter" })
        .run();

      const client = buildClient({
        rawById: { "msg-reparse-ledger": workdayRaw({ body: WORKDAY_APPLIED_BODY }) },
      });

      await reparseDeadLetter(db, client);

      const ledgerRow = db
        .select()
        .from(ingestedMessages)
        .where(eq(ingestedMessages.messageId, "msg-reparse-ledger"))
        .get();
      // Still "dead_letter" — reparseDeadLetter intentionally never rewrites
      // this row even though the underlying dead_letter row is now resolved.
      expect(ledgerRow?.outcome).toBe("dead_letter");
    } finally {
      close();
    }
  });

  it("is a no-op when there are no pending dead-letter rows", async () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      const client = buildClient({});
      const counts = await reparseDeadLetter(db, client);

      expect(counts).toEqual({
        resolvedAsTransitionCount: 0,
        resolvedAsReviewCount: 0,
        stillFailedCount: 0,
      });
    } finally {
      close();
    }
  });
});

describe("runGmailSync folds in dead-letter reparse (D3-02 follow-up)", () => {
  it("resolves a pre-existing pending dead-letter row into a transition as part of an ordinary sync run, using received-time since the real template has no explicit date", async () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId } = seedLookups(db);
      const applicationId = seedOpenApplication(db, "Visa", appliedStageId);

      insertDeadLetterEntry(db, {
        type: "known_sender_failed",
        sourceMessageId: "msg-backlog",
        rawPayload: WORKDAY_APPLIED_NO_EXPLICIT_DATE_BODY,
        sender: '"Visa" <visa@myworkday.com>',
        subject: "Application Update: Senior PM",
      });

      const client = buildClient({
        messagesByQuery: {
          [SENDER_QUERY]: [],
          [`label:${JOB_SEARCH_LABEL_ID}`]: [],
        },
        rawById: {
          "msg-backlog": workdayRaw({ body: WORKDAY_APPLIED_NO_EXPLICIT_DATE_BODY }),
        },
      });

      const counts = await runGmailSync(db, client, { lastSync: null, historyId: null });

      // The backlog resolution folds into the same newCount a fresh
      // transition would — "Sync now" reports it identically either way.
      expect(counts).toEqual({
        newCount: 1,
        reviewCount: 0,
        deadLetterCount: 0,
        usedFallback: false,
      });

      const events = db
        .select()
        .from(statusEvents)
        .where(eq(statusEvents.applicationId, applicationId))
        .all();
      expect(events).toHaveLength(1);
      expect(events[0]?.occurredAt).toEqual(WORKDAY_RAW_RECEIVED_AT);

      const dlEntry = db
        .select()
        .from(deadLetter)
        .where(eq(deadLetter.sourceMessageId, "msg-backlog"))
        .get();
      expect(dlEntry?.status).toBe("resolved");
    } finally {
      close();
    }
  });

  it("running the sync again is idempotent — the already-resolved dead-letter row isn't touched a second time", async () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId } = seedLookups(db);
      seedOpenApplication(db, "Visa", appliedStageId);

      insertDeadLetterEntry(db, {
        type: "known_sender_failed",
        sourceMessageId: "msg-backlog-idempotent",
        rawPayload: WORKDAY_APPLIED_NO_EXPLICIT_DATE_BODY,
        sender: '"Visa" <visa@myworkday.com>',
        subject: "Application Update: Senior PM",
      });

      const client = buildClient({
        messagesByQuery: {
          [SENDER_QUERY]: [],
          [`label:${JOB_SEARCH_LABEL_ID}`]: [],
        },
        rawById: {
          "msg-backlog-idempotent": workdayRaw({
            body: WORKDAY_APPLIED_NO_EXPLICIT_DATE_BODY,
          }),
        },
      });

      const first = await runGmailSync(db, client, { lastSync: null, historyId: null });
      expect(first).toEqual({
        newCount: 1,
        reviewCount: 0,
        deadLetterCount: 0,
        usedFallback: false,
      });

      const second = await runGmailSync(db, client, { lastSync: null, historyId: null });
      expect(second).toEqual({
        newCount: 0,
        reviewCount: 0,
        deadLetterCount: 0,
        usedFallback: false,
      });

      expect(db.select().from(statusEvents).all()).toHaveLength(1);
    } finally {
      close();
    }
  });
});

// ---------------------------------------------------------------------------
// 04-02: historyId-first incremental sync, 404 cursor-expiry fallback (D4-04),
// non-404 fail-loud (RESEARCH Pitfall 2 / anti-pattern guard), and catch-up
// (ING-05 data-shape half / ROADMAP criterion 3). All fixtures here inject a
// REAL `Common.GaxiosError` (never a duck-typed plain object) so the domain
// code's `instanceof Common.GaxiosError` guard is genuinely exercised.
// ---------------------------------------------------------------------------

/** Extracts the fields that matter for cross-DB event-set-equality
 *  comparisons (excludes `id` and `createdAt`-style columns, which are
 *  DB-internal and not part of the "same deduplicated event set" claim). */
function eventShape(row: {
  applicationId: number;
  stageId: number;
  occurredAt: Date;
  sourceMessageId: string | null;
  confidence: number | null;
}) {
  return {
    applicationId: row.applicationId,
    stageId: row.stageId,
    occurredAt: row.occurredAt,
    sourceMessageId: row.sourceMessageId,
    confidence: row.confidence,
  };
}

/** Builds a REAL `Common.GaxiosError` instance for injection via
 *  `rejectListHistory` — never a duck-typed plain object, so the domain
 *  code's `err instanceof Common.GaxiosError` guard is genuinely exercised
 *  (RESEARCH Pitfall 2). `config`/`response` are minimally-shaped test
 *  doubles (derived structurally via `ConstructorParameters` rather than
 *  naming gaxios's non-exported `GaxiosOptionsPrepared` type directly) —
 *  only `status` is read by the guard under test. */
type GaxiosErrorArgs = ConstructorParameters<typeof Common.GaxiosError>;

function makeGaxiosError(message: string, status: number): Common.GaxiosError {
  const config = {} as GaxiosErrorArgs[1];
  const response = { status } as unknown as NonNullable<GaxiosErrorArgs[2]>;
  return new Common.GaxiosError(message, config, response);
}

describe("runGmailSync — historyId incremental (04-02, ING-07 + ROADMAP criterion 3)", () => {
  it("incremental (historyId) and full-fetch (lastSync) produce the IDENTICAL deduplicated event set for the same messages (ROADMAP criterion 3)", async () => {
    const START_HISTORY_ID = "1000";

    function fixturesFor(): FakeGmailFixtures {
      return {
        messagesByQuery: {
          [SENDER_QUERY]: ["msg-parity-1", "msg-parity-2"],
          [`label:${JOB_SEARCH_LABEL_ID}`]: [],
        },
        rawById: {
          "msg-parity-1": workdayRaw({ body: WORKDAY_APPLIED_BODY }),
          "msg-parity-2": workdayRaw({
            from: '"Never Seen Inc" <careers@myworkday.com>',
            body: WORKDAY_UNMATCHED_BODY,
          }),
        },
        historyByStartId: {
          [START_HISTORY_ID]: [
            {
              history: [
                { messagesAdded: [{ message: { id: "msg-parity-1" } }] },
                { messagesAdded: [{ message: { id: "msg-parity-2" } }] },
              ],
              historyId: "1050",
            },
          ],
        },
        profileHistoryId: "1050",
      };
    }

    const incrementalDb = createTestDb();
    const fullFetchDb = createTestDb();
    try {
      const { appliedStageId: incrementalAppliedStageId } = seedLookups(incrementalDb.db);
      seedOpenApplication(incrementalDb.db, "Visa", incrementalAppliedStageId);
      const { appliedStageId: fullFetchAppliedStageId } = seedLookups(fullFetchDb.db);
      seedOpenApplication(fullFetchDb.db, "Visa", fullFetchAppliedStageId);

      const incrementalClient = buildClient(fixturesFor());
      const fullFetchClient = buildClient(fixturesFor());

      const incrementalResult = await runGmailSync(incrementalDb.db, incrementalClient, {
        lastSync: null,
        historyId: START_HISTORY_ID,
      });
      const fullFetchResult = await runGmailSync(fullFetchDb.db, fullFetchClient, {
        lastSync: null,
        historyId: null,
      });

      // Same counts, and the incremental path never falls back (the cursor
      // resolved successfully) — this is an ordinary incremental run, not an
      // expiry scenario.
      expect(incrementalResult.newCount).toBe(fullFetchResult.newCount);
      expect(incrementalResult.reviewCount).toBe(fullFetchResult.reviewCount);
      expect(incrementalResult.deadLetterCount).toBe(fullFetchResult.deadLetterCount);
      expect(incrementalResult.usedFallback).toBe(false);
      expect(fullFetchResult.usedFallback).toBe(false);
      expect(incrementalResult.newHistoryId).toBe("1050");

      // Same-shape rows (row equality, not just counts) — proves criterion 3
      // is met at the data level, not merely the aggregate-count level.
      const incrementalEvents = incrementalDb.db
        .select()
        .from(statusEvents)
        .all()
        .map(eventShape);
      const fullFetchEvents = fullFetchDb.db.select().from(statusEvents).all().map(eventShape);
      expect(incrementalEvents).toEqual(fullFetchEvents);

      const incrementalApplications = incrementalDb.db.select().from(applications).all();
      const fullFetchApplications = fullFetchDb.db.select().from(applications).all();
      expect(incrementalApplications.map((a) => a.companyId)).toEqual(
        fullFetchApplications.map((a) => a.companyId),
      );
    } finally {
      incrementalDb.close();
      fullFetchDb.close();
    }
  });

  it("a 404 GaxiosError from listHistory falls back to the bounded lastSync full-fetch and records usedFallback:true (ING-07, D4-04)", async () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      const client = buildClient({
        messagesByQuery: {
          [SENDER_QUERY]: ["msg-fallback"],
          [`label:${JOB_SEARCH_LABEL_ID}`]: [],
        },
        rawById: {
          "msg-fallback": workdayRaw({ body: WORKDAY_UNMATCHED_BODY }),
        },
        rejectListHistory: makeGaxiosError("Not Found", 404),
        profileHistoryId: "2000",
      });

      const result = await runGmailSync(db, client, {
        lastSync: null,
        historyId: "expired-cursor",
      });

      expect(result.usedFallback).toBe(true);
      expect(result.newCount).toBe(1);
      expect(result.newHistoryId).toBe("2000");

      const ledgerRow = db
        .select()
        .from(ingestedMessages)
        .where(eq(ingestedMessages.messageId, "msg-fallback"))
        .get();
      expect(ledgerRow?.outcome).toBe("transition");
    } finally {
      close();
    }
  });

  it("a non-404 GaxiosError (e.g. 500) from listHistory fails loud — throws, never falls back (ING-07 anti-pattern guard)", async () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      const client = buildClient({
        rejectListHistory: makeGaxiosError("Server Error", 500),
      });

      await expect(
        runGmailSync(db, client, { lastSync: null, historyId: "some-cursor" }),
      ).rejects.toThrow();
    } finally {
      close();
    }
  });

  it("a non-Gaxios plain Error from listHistory also fails loud — never mistaken for a 404", async () => {
    const { db, close } = createTestDb();
    try {
      seedLookups(db);

      const client = buildClient({
        rejectListHistory: new Error("network blip"),
      });

      await expect(
        runGmailSync(db, client, { lastSync: null, historyId: "some-cursor" }),
      ).rejects.toThrow("network blip");
    } finally {
      close();
    }
  });

  it("a wide historyId gap (many messagesAdded since the last cursor) is processed as a single catch-up run, same dedup result as an ordinary run (ING-05 data-shape half)", async () => {
    const { db, close } = createTestDb();
    try {
      const { appliedStageId } = seedLookups(db);
      seedOpenApplication(db, "Visa", appliedStageId);

      const client = buildClient({
        rawById: {
          "msg-catchup-1": workdayRaw({ body: WORKDAY_APPLIED_BODY }),
          "msg-catchup-2": workdayRaw({
            from: '"Never Seen Inc" <careers@myworkday.com>',
            body: WORKDAY_UNMATCHED_BODY,
          }),
          "msg-catchup-3": workdayRaw({ body: WORKDAY_BELOW_BAR_BODY }),
        },
        historyByStartId: {
          "old-cursor": [
            {
              history: [
                { messagesAdded: [{ message: { id: "msg-catchup-1" } }] },
                { messagesAdded: [{ message: { id: "msg-catchup-2" } }] },
                { messagesAdded: [{ message: { id: "msg-catchup-3" } }] },
              ],
              historyId: "9999",
            },
          ],
        },
        profileHistoryId: "9999",
      });

      const result = await runGmailSync(db, client, {
        lastSync: null,
        historyId: "old-cursor",
      });

      expect(result).toMatchObject({
        newCount: 2,
        reviewCount: 0,
        deadLetterCount: 1,
        usedFallback: false,
        newHistoryId: "9999",
      });

      // Same messages, reachable via a single catch-up historyId call, are
      // NEVER double-counted against the dedup ledger.
      for (const id of ["msg-catchup-1", "msg-catchup-2", "msg-catchup-3"]) {
        const ledgerRows = db
          .select()
          .from(ingestedMessages)
          .where(eq(ingestedMessages.messageId, id))
          .all();
        expect(ledgerRows).toHaveLength(1);
      }
    } finally {
      close();
    }
  });
});
