import { eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { companies, contacts, outreachMessages } from "@/db/schema";

/**
 * Already-resolved insert shape for the outreach write path (D-02..D-08).
 * This is DELIBERATELY NOT `newOutreachInput` (src/db/validation.ts) — that
 * is the client-facing shape with an optional `contactId`/`recipient` and no
 * `source`/`sourceMessageId`. This type is what a caller (the Server Action
 * in 06-03, the demo seed, and Phase 7's Gmail auto-capture) passes in AFTER
 * resolving/creating the contact and company and deciding provenance.
 */
export interface CreateOutreachInput {
  contactId: number;
  companyId: number;
  channel: string;
  purpose: string;
  subject?: string | null;
  body: string;
  sentDate: Date;
  responded?: boolean;
  outcome?: string | null;
  source?: string;
  sourceMessageId?: string | null;
}

/**
 * Persists a new outreach_messages row (OUT-01) — mirrors createContact's
 * insert-then-return-id shape (src/domain/contacts.ts). Defaults `responded`
 * to false and `outcome`/`subject`/`sourceMessageId` to null when omitted,
 * and `source` to "manual" when omitted, so a caller that forgets provenance
 * cannot silently create an unlabeled or mislabeled row (T-06-04 mitigation
 * — the client-facing spoof surface is closed upstream in
 * `newOutreachInput`/the Server Action). Returns the new row's id.
 */
export function createOutreach(
  db: NodeSQLiteDatabase,
  input: CreateOutreachInput,
): number {
  const result = db
    .insert(outreachMessages)
    .values({
      contactId: input.contactId,
      companyId: input.companyId,
      channel: input.channel,
      purpose: input.purpose,
      subject: input.subject ?? null,
      body: input.body,
      sentDate: input.sentDate,
      responded: input.responded ?? false,
      outcome: input.outcome ?? null,
      source: input.source ?? "manual",
      sourceMessageId: input.sourceMessageId ?? null,
    })
    .run();

  return Number(result.lastInsertRowid);
}

/**
 * One row per outreach message, joined to display names (D-02 dual-FK
 * join) — powers `/outreach` (06-04) and the contact cross-link deep-link
 * (06-05) without a second fetch.
 */
export interface OutreachRow {
  id: number;
  contactId: number;
  contactName: string;
  companyId: number;
  companyName: string;
  channel: string;
  purpose: string;
  subject: string | null;
  body: string;
  sentDate: Date;
  responded: boolean;
  outcome: string | null;
}

const outreachRowColumns = {
  id: outreachMessages.id,
  contactId: outreachMessages.contactId,
  contactName: contacts.name,
  companyId: outreachMessages.companyId,
  companyName: companies.canonicalName,
  channel: outreachMessages.channel,
  purpose: outreachMessages.purpose,
  subject: outreachMessages.subject,
  body: outreachMessages.body,
  sentDate: outreachMessages.sentDate,
  responded: outreachMessages.responded,
  outcome: outreachMessages.outcome,
} as const;

/**
 * Returns every outreach row (or only those for a given contact when
 * `opts.contactId` is supplied), joined to `contacts.name` and
 * `companies.canonicalName` for display (OUT-03) — mirrors
 * `getConversationsForApplication`'s two-table innerJoin shape
 * (src/domain/contacts.ts). Receives the resolved db handle as a parameter;
 * never reads DASHBOARD_MODE or imports the db client itself (single-reader
 * convention). The two branches below are written out separately (rather
 * than building one query builder and conditionally chaining `.where()`
 * onto it) to avoid relying on drizzle-orm's dynamic-query-builder type
 * surface, which this codebase avoids given the pinned `1.0.0-rc.4` release.
 */
export function listOutreach(
  db: NodeSQLiteDatabase,
  opts?: { contactId?: number },
): OutreachRow[] {
  if (opts?.contactId !== undefined) {
    return db
      .select(outreachRowColumns)
      .from(outreachMessages)
      .innerJoin(contacts, eq(outreachMessages.contactId, contacts.id))
      .innerJoin(companies, eq(outreachMessages.companyId, companies.id))
      .where(eq(outreachMessages.contactId, opts.contactId))
      .all();
  }

  return db
    .select(outreachRowColumns)
    .from(outreachMessages)
    .innerJoin(contacts, eq(outreachMessages.contactId, contacts.id))
    .innerJoin(companies, eq(outreachMessages.companyId, companies.id))
    .all();
}

/**
 * Returns a per-contact outreach count as a `Map<contactId, count>` (D-11,
 * OUT-06 — the 06-05 cross-link's badge count), built via a TypeScript
 * reduce over a flat `{ contactId }` select — never a SQL aggregate/grouped
 * query (drizzle-orm pinned `1.0.0-rc.4`, mirrors `listContactsWithOutreach`'s
 * reduce convention in src/domain/contacts.ts). A contact with zero outreach
 * is absent from the Map; callers default to 0.
 */
export function getOutreachCountsByContact(
  db: NodeSQLiteDatabase,
): Map<number, number> {
  const rows = db
    .select({ contactId: outreachMessages.contactId })
    .from(outreachMessages)
    .all();

  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(row.contactId, (counts.get(row.contactId) ?? 0) + 1);
  }
  return counts;
}
