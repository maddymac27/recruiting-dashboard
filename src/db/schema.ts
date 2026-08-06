import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// `.defaultNow()` (deprecated) emits a SQL default in epoch MILLISECONDS,
// but `mode: "timestamp"` columns decode stored integers as epoch SECONDS
// (`new Date(value * 1000)`) — using `.defaultNow()` here silently corrupts
// any row inserted without an explicit app-supplied value (CR-01). This
// default uses SQLite's `unixepoch()`, which returns seconds, so it agrees
// with the column's own read-path.
const defaultTimestampNow = sql`(unixepoch())`;

// ---------------------------------------------------------------------------
// Lookup tables (D-05, D-06, D-07) — reference vocabularies seeded as data,
// NOT SQLite enums. New values (e.g. a new role type) are one INSERT, zero
// migrations — this is what makes them "extensible without a migration."
// ---------------------------------------------------------------------------

export const roleTypes = sqliteTable("role_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull().unique(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const stages = sqliteTable("stages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull().unique(),
  isTerminal: integer("is_terminal", { mode: "boolean" }).notNull().default(false),
  // e.g. Rejected stage -> outcome 'Rejected'; Interview stage -> outcome null (still Active)
  outcomeLabel: text("outcome_label"),
});

export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull().unique(),
});

// ---------------------------------------------------------------------------
// Companies + aliases (DATA-04, D-04)
// ---------------------------------------------------------------------------

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  canonicalName: text("canonical_name").notNull().unique(),
  // lowercased/trimmed/punctuation-stripped, app-computed defensive lookup helper
  normalizedKey: text("normalized_key").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(defaultTimestampNow),
});

export const companyAliases = sqliteTable("company_aliases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  alias: text("alias").notNull().unique(),
  normalizedAlias: text("normalized_alias").notNull().unique(),
});

// ---------------------------------------------------------------------------
// Applications (DATA-01, DATA-02, DATA-03)
// ---------------------------------------------------------------------------

export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id),
  roleTitle: text("role_title"),
  // nullable — pasted job-posting URL for a quick-saved application (CAP-01).
  // Validated as an http/https URL at the write boundary (src/db/validation.ts).
  postingUrl: text("posting_url"),
  roleTypeId: integer("role_type_id").references(() => roleTypes.id),
  sourceId: integer("source_id").references(() => sources.id),
  // nullable — "saved, not applied yet"
  dateApplied: integer("date_applied", { mode: "timestamp" }),

  // Materialized projection columns — written ONLY by the recompute function
  // (a later plan), never directly by ingestion or any other write path.
  currentStageId: integer("current_stage_id").references(() => stages.id),
  currentStageSince: integer("current_stage_since", { mode: "timestamp" }),
  // feeds Phase 5 staleness/"ghosted" computation (D-08)
  lastInboundEventAt: integer("last_inbound_event_at", { mode: "timestamp" }),

  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(defaultTimestampNow),
});

// ---------------------------------------------------------------------------
// Status events — append-only event log (DATA-02, DATA-03, DATA-06, D-09, D-10)
// ---------------------------------------------------------------------------

export const statusEvents = sqliteTable(
  "status_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id),
    stageId: integer("stage_id")
      .notNull()
      .references(() => stages.id),
    // real-world event time — this, not insertion order, determines "current"
    occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
    // nullable — null for manually-created events. SQLite treats NULLs as
    // distinct from each other, so many NULL rows never collide with the
    // UNIQUE index below.
    sourceMessageId: text("source_message_id"),
    confidence: real("confidence"),
    // audit only — NEVER used for ordering/derivation
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(defaultTimestampNow),
  },
  (t) => [
    uniqueIndex("status_events_source_message_id_unique").on(t.sourceMessageId),
  ],
);

// ---------------------------------------------------------------------------
// Overrides — user corrections, precedence over parser-derived values (DATA-07, D-11)
// ---------------------------------------------------------------------------

export const overrides = sqliteTable(
  "overrides",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id),
    // validated at the app layer against a fixed allow-list — see src/db/validation.ts
    fieldName: text("field_name").notNull(),
    valueText: text("value_text"),
    setByUserAt: integer("set_by_user_at", { mode: "timestamp" })
      .notNull()
      .default(defaultTimestampNow),
  },
  (t) => [
    uniqueIndex("overrides_application_field_unique").on(
      t.applicationId,
      t.fieldName,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Contacts, dated conversations, and the many-to-many job linkage (DATA-05, D-01..D-04)
// ---------------------------------------------------------------------------

export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // nullable — a contact may predate any specific job (e.g. a coffee chat)
  companyId: integer("company_id").references(() => companies.id),
  name: text("name").notNull(),
  roleTitle: text("role_title"),
  channel: text("channel"), // email/call/LinkedIn/etc (D-02)
  notes: text("notes"),
  email: text("email"), // de-dup signal (D-04)
  linkedinUrl: text("linkedin_url"), // de-dup signal (D-04)
  // recruiter/hiring manager/referral/peer — substitutes for agency modeling (D-02, D-03)
  relationshipType: text("relationship_type"),
  // how-you-met: coffee chat/alumni/cold/mutual connection (D-02)
  source: text("source"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(defaultTimestampNow),
});

export const contactApplications = sqliteTable(
  "contact_applications",
  {
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id),
    applicationId: integer("application_id")
      .notNull()
      .references(() => applications.id),
    linkedAt: integer("linked_at", { mode: "timestamp" })
      .notNull()
      .default(defaultTimestampNow),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.applicationId] }),
    index("contact_applications_contact_idx").on(t.contactId),
    index("contact_applications_application_idx").on(t.applicationId),
  ],
);

export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id),
  // nullable — a conversation may not be tied to a specific job yet
  applicationId: integer("application_id").references(() => applications.id),
  occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
  channel: text("channel"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(defaultTimestampNow),
});

// ---------------------------------------------------------------------------
// Outreach — manual cold-outreach log (Phase 6, D-01..D-08). contactId and
// companyId are BOTH notNull (D-02), mirroring conversations.contactId, not
// contacts.companyId's nullable pattern — every outreach row is tied to a
// specific contact and company at write time. sourceMessageId/source are
// forward-compat columns for Phase 7 Gmail auto-capture: the manual write
// path (src/db/validation.ts newOutreachInput) never accepts either field
// from a client — they are hardcoded null/"manual" by the Server Action.
// ---------------------------------------------------------------------------

export const outreachMessages = sqliteTable(
  "outreach_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    channel: text("channel").notNull(), // LinkedIn/Email (D-04, plain text, no lookup table)
    purpose: text("purpose").notNull(), // free text, includes "Other" (D-05, no lookup table)
    subject: text("subject"), // nullable (D-06)
    body: text("body").notNull(),
    // notNull, NO default — always user-supplied, mirrors conversations.occurredAt (D-07)
    sentDate: integer("sent_date", { mode: "timestamp" }).notNull(),
    responded: integer("responded", { mode: "boolean" }).notNull().default(false), // D-08
    outcome: text("outcome"), // nullable free text (D-08)
    // Populated by Phase 7 Gmail auto-capture; hardcoded null by the manual
    // write path. NULL-distinct so many manual rows never collide (D-03).
    sourceMessageId: text("source_message_id"),
    // Discriminator between manual and Phase-7 ingested rows (D-03).
    source: text("source").notNull().default("manual"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(defaultTimestampNow),
  },
  (t) => [
    uniqueIndex("outreach_messages_source_message_id_unique").on(
      t.sourceMessageId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Fail-loud review/dead-letter queues (D-15). Structural stubs from Phase 1
// (sourceMessageId/candidateApplicationId/confidence/status,
// sourceMessageId/rawPayload/failedStage/errorMessage), extended in Phase 3
// (03-01) with the discriminator/display columns their write path needs.
// ---------------------------------------------------------------------------

export const reviewQueue = sqliteTable("review_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceMessageId: text("source_message_id"),
  candidateApplicationId: integer("candidate_application_id").references(
    () => applications.id,
  ),
  confidence: real("confidence"),
  status: text("status").notNull().default("pending"), // pending/confirmed/reassigned/rejected
  // Discriminator: low_confidence_match | unmatched_confirm_create | label_mail
  // (ING-04-REL-01/02). Nullable at DB level — required-ness enforced in zod
  // (src/db/validation.ts) so this additive migration applies cleanly to a
  // possibly-non-empty real.sqlite without a NOT NULL/default conflict.
  type: text("type"),
  sender: text("sender"),
  subject: text("subject"),
  bodyText: text("body_text"),
  parsedCompany: text("parsed_company"),
  parsedRoleTitle: text("parsed_role_title"),
  parsedStageLabel: text("parsed_stage_label"),
  parsedEventDate: integer("parsed_event_date", { mode: "timestamp" }),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(defaultTimestampNow),
});

export const deadLetter = sqliteTable("dead_letter", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceMessageId: text("source_message_id"),
  rawPayload: text("raw_payload"),
  failedStage: text("failed_stage"), // classify/extract/resolve
  errorMessage: text("error_message"),
  // Discriminator: known_sender_failed | unparseable — nullable at DB level,
  // required-ness enforced in zod (same rationale as reviewQueue.type above).
  type: text("type"),
  status: text("status").notNull().default("pending"), // pending/resolved
  sender: text("sender"),
  subject: text("subject"),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(defaultTimestampNow),
});

// ---------------------------------------------------------------------------
// Ingestion ledger + sync run history (DATA-06 / D3-06, REL-03)
// ---------------------------------------------------------------------------

export const ingestedMessages = sqliteTable(
  "ingested_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    messageId: text("message_id").notNull(),
    outcome: text("outcome").notNull(), // transition | review | dead_letter
    applicationId: integer("application_id").references(
      () => applications.id,
    ),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(defaultTimestampNow),
  },
  (t) => [
    uniqueIndex("ingested_messages_message_id_unique").on(t.messageId),
  ],
);

export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .default(defaultTimestampNow),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  status: text("status").notNull().default("running"), // running | success | failed
  newCount: integer("new_count").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  deadLetterCount: integer("dead_letter_count").notNull().default(0),
  errorMessage: text("error_message"),
  // Phase 4 (ING-05/ING-07/D4-05) — the historyId cursor carried on the
  // successful sync_runs row, read via getLatestSyncRun as the incremental
  // sync's authoritative starting point. Nullable so this additive migration
  // applies cleanly to a possibly-non-empty real.sqlite (no prior run has one).
  historyId: text("history_id"),
  // D4-04 — set true when a run fell back to the bounded full-fetch path
  // because the stored historyId cursor had expired (404). Additive-defaulted
  // (not nullable) since "no fallback occurred" is the correct default for
  // every prior row and every future ordinary success.
  usedFallback: integer("used_fallback", { mode: "boolean" })
    .notNull()
    .default(false),
});

// ---------------------------------------------------------------------------
// Inferred types for downstream use
// ---------------------------------------------------------------------------

export type RoleType = typeof roleTypes.$inferSelect;
export type NewRoleType = typeof roleTypes.$inferInsert;

export type Stage = typeof stages.$inferSelect;
export type NewStage = typeof stages.$inferInsert;

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export type CompanyAlias = typeof companyAliases.$inferSelect;
export type NewCompanyAlias = typeof companyAliases.$inferInsert;

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;

export type StatusEvent = typeof statusEvents.$inferSelect;
export type NewStatusEvent = typeof statusEvents.$inferInsert;

export type Override = typeof overrides.$inferSelect;
export type NewOverride = typeof overrides.$inferInsert;

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

export type ContactApplication = typeof contactApplications.$inferSelect;
export type NewContactApplication = typeof contactApplications.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type Outreach = typeof outreachMessages.$inferSelect;
export type NewOutreach = typeof outreachMessages.$inferInsert;

export type ReviewQueueEntry = typeof reviewQueue.$inferSelect;
export type NewReviewQueueEntry = typeof reviewQueue.$inferInsert;

export type DeadLetterEntry = typeof deadLetter.$inferSelect;
export type NewDeadLetterEntry = typeof deadLetter.$inferInsert;

export type IngestedMessage = typeof ingestedMessages.$inferSelect;
export type NewIngestedMessage = typeof ingestedMessages.$inferInsert;

export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;
