import { asc, eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import {
  companies,
  contactApplications,
  contacts,
  conversations,
} from "@/db/schema";
import {
  newContactInput,
  newConversationInput,
  type NewContactInput,
  type NewConversationInput,
} from "@/db/validation";
import { getOutreachCountsByContact } from "@/domain/outreach";

/**
 * Persists a new contact row (D-02 fields; company_id optional per D-03).
 * Validates input against `newContactInput` before it reaches Drizzle.
 * Returns the new contact's id.
 */
export function createContact(
  db: NodeSQLiteDatabase,
  input: NewContactInput,
): number {
  const validated = newContactInput.parse(input);

  const result = db.insert(contacts).values(validated).run();

  return Number(result.lastInsertRowid);
}

/**
 * Links a contact to an application, preserving the link date
 * (`linked_at`) so a later "who has gone quiet" analysis can use it
 * (DATA-05). One contact can link to many applications and one
 * application to many contacts — the many-to-many relationship lives
 * entirely in the `contact_applications` join table.
 */
export function linkContactToApplication(
  db: NodeSQLiteDatabase,
  contactId: number,
  applicationId: number,
  linkedAt?: Date,
): void {
  db.insert(contactApplications)
    .values({
      contactId,
      applicationId,
      ...(linkedAt ? { linkedAt } : {}),
    })
    .run();
}

/**
 * Records a dated conversation entry against a contact (D-01) — each
 * touchpoint is its own timestamped record, not a running-notes field.
 * Validates input against `newConversationInput` before it reaches
 * Drizzle. Returns the new conversation's id.
 */
export function addConversation(
  db: NodeSQLiteDatabase,
  input: NewConversationInput,
): number {
  const validated = newConversationInput.parse(input);

  const result = db.insert(conversations).values(validated).run();

  return Number(result.lastInsertRowid);
}

/**
 * Returns every application a contact is linked to, with the preserved
 * `linked_at` date for each link (DATA-05).
 */
export function getApplicationsForContact(
  db: NodeSQLiteDatabase,
  contactId: number,
) {
  return db
    .select()
    .from(contactApplications)
    .where(eq(contactApplications.contactId, contactId))
    .all();
}

/**
 * Returns every contact linked to an application, with the preserved
 * `linked_at` date for each link (DATA-05).
 */
export function getContactsForApplication(
  db: NodeSQLiteDatabase,
  applicationId: number,
) {
  return db
    .select()
    .from(contactApplications)
    .where(eq(contactApplications.applicationId, applicationId))
    .all();
}

/**
 * Returns every conversation attached to a contact, ordered by
 * `occurred_at` ascending (D-01) — one-to-many dated entries per contact.
 */
export function getConversationsForContact(
  db: NodeSQLiteDatabase,
  contactId: number,
) {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.contactId, contactId))
    .orderBy(asc(conversations.occurredAt))
    .all();
}

/**
 * Returns every conversation attached to an application, joined to the
 * contact's name for display, ordered by `occurred_at` ascending — the
 * conversation half of the DASH-05 job-detail timeline (see
 * `@/domain/timeline`). Filters directly on `conversations.applicationId`
 * (a nullable FK on the conversations table itself) rather than joining
 * through a contact, so conversations for a different application are
 * excluded even if they share a contact.
 */
export function getConversationsForApplication(
  db: NodeSQLiteDatabase,
  applicationId: number,
) {
  return db
    .select({
      occurredAt: conversations.occurredAt,
      channel: conversations.channel,
      notes: conversations.notes,
      contactName: contacts.name,
    })
    .from(conversations)
    .innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(eq(conversations.applicationId, applicationId))
    .orderBy(asc(conversations.occurredAt))
    .all();
}

/**
 * Returns the most recent `occurredAt` conversation date per application,
 * across ALL applications at once (Phase 5, D5-01/RESEARCH Pitfall 3) — the
 * conversation half of the D5-01 activity clock. A single flat query (no
 * `WHERE applicationId = ?`), reduced to a `Map` of max date per application
 * in TypeScript, same convention as `getPipelineSummary`'s reduce-not-
 * groupBy pattern (drizzle-orm is pinned at `1.0.0-rc.4`, a release
 * candidate whose `GROUP BY`/`MAX()` surface this codebase deliberately
 * avoids). Deliberately separate from `getConversationsForApplication`
 * (single-application, ordered list) rather than changing that function's
 * shape.
 */
export function getLatestConversationDateByApplication(
  db: NodeSQLiteDatabase,
): Map<number, Date> {
  const rows = db
    .select({
      applicationId: conversations.applicationId,
      occurredAt: conversations.occurredAt,
    })
    .from(conversations)
    .all();

  const latestByApplication = new Map<number, Date>();
  for (const row of rows) {
    if (row.applicationId === null) continue; // nullable FK (D-01) — a
    // conversation not yet tied to a specific job doesn't feed any
    // application's activity clock.
    const current = latestByApplication.get(row.applicationId);
    if (!current || row.occurredAt.getTime() > current.getTime()) {
      latestByApplication.set(row.applicationId, row.occurredAt);
    }
  }
  return latestByApplication;
}

/**
 * Returns a lightweight {contactId, name} summary for every contact linked
 * to an application, ordered by `linked_at` ascending — powers the
 * job-detail contacts sub-list and the "select an existing contact" option
 * on the inline logging form (CAP-04, D2-10). Deliberately separate from
 * `getContactsForApplication` (which returns the raw join-table rows with
 * no contact name) rather than changing that existing function's shape.
 */
export function getContactSummariesForApplication(
  db: NodeSQLiteDatabase,
  applicationId: number,
) {
  return db
    .select({
      contactId: contacts.id,
      name: contacts.name,
      roleTitle: contacts.roleTitle,
      relationshipType: contacts.relationshipType,
    })
    .from(contactApplications)
    .innerJoin(contacts, eq(contactApplications.contactId, contacts.id))
    .where(eq(contactApplications.applicationId, applicationId))
    .orderBy(asc(contactApplications.linkedAt))
    .all();
}

/** One row per contact for the Contact Database view (şişe redesign): the
 *  contact's details plus their networking activity — most-recent outreach date
 *  and total touchpoint count. Aggregated in TypeScript over a flat conversation
 *  query (reduce-not-groupBy convention; drizzle-orm pinned at 1.0.0-rc.4). */
export interface ContactOutreachRow {
  id: number;
  name: string;
  company: string | null;
  roleTitle: string | null;
  relationshipType: string | null;
  channel: string | null;
  latestOutreachAt: Date | null;
  touchpoints: number;
  outreachCount: number;
}

export function listContactsWithOutreach(
  db: NodeSQLiteDatabase,
): ContactOutreachRow[] {
  const contactRows = db
    .select({
      id: contacts.id,
      name: contacts.name,
      company: companies.canonicalName,
      roleTitle: contacts.roleTitle,
      relationshipType: contacts.relationshipType,
      channel: contacts.channel,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .all();

  const convRows = db
    .select({
      contactId: conversations.contactId,
      occurredAt: conversations.occurredAt,
    })
    .from(conversations)
    .all();

  const agg = new Map<number, { latest: Date; count: number }>();
  for (const row of convRows) {
    const cur = agg.get(row.contactId);
    if (!cur) {
      agg.set(row.contactId, { latest: row.occurredAt, count: 1 });
    } else {
      cur.count += 1;
      if (row.occurredAt.getTime() > cur.latest.getTime()) {
        cur.latest = row.occurredAt;
      }
    }
  }

  const outreachCounts = getOutreachCountsByContact(db);

  return contactRows.map((c) => {
    const a = agg.get(c.id);
    return {
      ...c,
      latestOutreachAt: a?.latest ?? null,
      touchpoints: a?.count ?? 0,
      outreachCount: outreachCounts.get(c.id) ?? 0,
    };
  });
}
