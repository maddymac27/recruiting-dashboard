import { z } from "zod";

// ---------------------------------------------------------------------------
// Override field allow-list (DATA-07, D-11 — Security Domain V5/T-01-01)
//
// This is the single source of truth for which application fields a user
// correction can target. The override write path (a later plan) and any
// future UI must both validate against this same constant so an arbitrary
// field name can never be written into `overrides.field_name` — that would
// let unchecked input target unintended columns at read-merge time.
// ---------------------------------------------------------------------------

export const OVERRIDABLE_FIELDS = [
  "company",
  "role_title",
  "role_type",
  "source",
  "date_applied",
  "current_stage",
] as const;

export type OverridableField = (typeof OVERRIDABLE_FIELDS)[number];

// ---------------------------------------------------------------------------
// Write-path validation schemas
//
// Every write path validates its input against one of these schemas before
// it reaches Drizzle (RESEARCH Security Domain V5 Input Validation). None of
// these schemas ever accept a credential/token/secret field — Gmail token
// storage is an explicit Phase 3 design, out of scope here.
// ---------------------------------------------------------------------------

export const newApplicationInput = z.object({
  companyId: z.number().int().positive(),
  roleTitle: z.string().min(1).optional(),
  roleTypeId: z.number().int().positive().optional(),
  sourceId: z.number().int().positive().optional(),
  dateApplied: z.date().optional(),
});
export type NewApplicationInput = z.infer<typeof newApplicationInput>;

// A pasted job-posting URL must be an http/https URL — rejects `javascript:`
// and other non-http(s) schemes before persistence or later href render
// (RESEARCH Security Domain, threat T-02-03; ASVS V5).
const postingUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), {
    message: "postingUrl must use http or https",
  });

export const quickSaveApplicationInput = z.object({
  companyName: z.string().min(1),
  roleTitle: z.string().min(1),
  postingUrl: postingUrlSchema.optional(),
});
export type QuickSaveApplicationInput = z.infer<
  typeof quickSaveApplicationInput
>;

export const updateApplicationInput = z.object({
  companyId: z.number().int().positive().optional(),
  roleTitle: z.string().min(1).nullable().optional(),
  roleTypeId: z.number().int().positive().nullable().optional(),
  sourceId: z.number().int().positive().nullable().optional(),
  dateApplied: z.date().nullable().optional(),
  postingUrl: postingUrlSchema.nullable().optional(),
  // presence triggers an appended status event — never a direct column write
  stageId: z.number().int().positive().optional(),
});
export type UpdateApplicationInput = z.infer<typeof updateApplicationInput>;

export const newStatusEventInput = z.object({
  applicationId: z.number().int().positive(),
  stageId: z.number().int().positive(),
  occurredAt: z.date(),
  sourceMessageId: z.string().min(1).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});
export type NewStatusEventInput = z.infer<typeof newStatusEventInput>;

export const newContactInput = z.object({
  companyId: z.number().int().positive().optional(),
  name: z.string().min(1),
  roleTitle: z.string().min(1).optional(),
  channel: z.string().min(1).optional(),
  notes: z.string().optional(),
  email: z.string().email().optional(),
  linkedinUrl: z.string().url().optional(),
  relationshipType: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
});
export type NewContactInput = z.infer<typeof newContactInput>;

export const newConversationInput = z.object({
  contactId: z.number().int().positive(),
  applicationId: z.number().int().positive().optional(),
  occurredAt: z.date(),
  channel: z.string().min(1).optional(),
  notes: z.string().optional(),
});
export type NewConversationInput = z.infer<typeof newConversationInput>;

// ---------------------------------------------------------------------------
// Outreach — manual cold-outreach log write contract (Phase 6, D-01..D-08,
// Security Domain V5/T-06-01). This schema is DELIBERATELY missing `source`
// and `sourceMessageId` — those are Phase-7 Gmail auto-capture provenance
// fields, and a client on the manual write path must never be able to
// self-label a row as gmail-sourced. The Server Action (a later plan)
// hardcodes both (`source: "manual"`, `sourceMessageId: null`) itself.
// ---------------------------------------------------------------------------

export const OUTREACH_CHANNELS = ["LinkedIn", "Email"] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

const newOutreachRecipientInput = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  linkedinUrl: z.string().url().optional(),
});

export const newOutreachInput = z
  .object({
    contactId: z.number().int().positive().optional(),
    recipient: newOutreachRecipientInput.optional(),
    companyName: z.string().min(1),
    channel: z.enum(OUTREACH_CHANNELS),
    purpose: z.string().min(1),
    subject: z.string().optional(),
    body: z.string().min(1),
    sentDate: z.date(),
    responded: z.boolean().optional(),
    outcome: z.string().optional(),
    // Deliberately NO `source` / `sourceMessageId` — see comment block above.
  })
  .refine((v) => v.contactId !== undefined || v.recipient !== undefined, {
    message: "Either an existing contactId or new recipient fields are required",
  });
export type NewOutreachInput = z.infer<typeof newOutreachInput>;

export const overrideInput = z.object({
  applicationId: z.number().int().positive(),
  fieldName: z.enum(OVERRIDABLE_FIELDS),
  value: z.string().nullable(),
});
export type OverrideInput = z.infer<typeof overrideInput>;

// ---------------------------------------------------------------------------
// Phase 3 — Gmail ingestion, entity resolution, fail-loud surfacing
// (REL-01, REL-02, REL-03, DATA-06 / D3-06). None of these schemas ever
// accept a credential/token/secret field — the Gmail refresh token lives
// only in .secrets/, never in the SQLite file (DEMO-02).
// ---------------------------------------------------------------------------

// A parser's extraction result before it is routed to a status-event
// transition, the review queue, or dead letter. company/stageLabel/
// occurredAt are required per D3-05 — a parser that can't produce all three
// has not produced a usable transition and must route elsewhere instead.
export const parsedEmailResult = z.object({
  company: z.string().min(1),
  roleTitle: z.string().min(1).optional(),
  stageLabel: z.string().min(1),
  occurredAt: z.date(),
  sourceMessageId: z.string().min(1),
  sender: z.string().optional(),
  subject: z.string().optional(),
});
export type ParsedEmailResult = z.infer<typeof parsedEmailResult>;

export const REVIEW_QUEUE_TYPES = [
  "low_confidence_match",
  "unmatched_confirm_create",
  "label_mail",
] as const;
export type ReviewQueueType = (typeof REVIEW_QUEUE_TYPES)[number];

export const newReviewQueueEntryInput = z.object({
  type: z.enum(REVIEW_QUEUE_TYPES),
  sourceMessageId: z.string().min(1),
  candidateApplicationId: z.number().int().positive().optional(),
  confidence: z.number().min(0).max(1).optional(),
  sender: z.string().optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  parsedCompany: z.string().optional(),
  parsedRoleTitle: z.string().optional(),
  parsedStageLabel: z.string().optional(),
  parsedEventDate: z.date().optional(),
});
export type NewReviewQueueEntryInput = z.infer<
  typeof newReviewQueueEntryInput
>;

export const DEAD_LETTER_TYPES = ["known_sender_failed", "unparseable"] as const;
export type DeadLetterType = (typeof DEAD_LETTER_TYPES)[number];

export const newDeadLetterEntryInput = z.object({
  type: z.enum(DEAD_LETTER_TYPES),
  sourceMessageId: z.string().min(1),
  rawPayload: z.string().min(1),
  sender: z.string().optional(),
  subject: z.string().optional(),
  failedStage: z.string().optional(),
  errorMessage: z.string().optional(),
});
export type NewDeadLetterEntryInput = z.infer<typeof newDeadLetterEntryInput>;

export const SYNC_RUN_STATUSES = ["running", "success", "failed"] as const;
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number];

export const newSyncRunInput = z.object({
  status: z.enum(SYNC_RUN_STATUSES).optional(),
  newCount: z.number().int().nonnegative().optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  deadLetterCount: z.number().int().nonnegative().optional(),
  errorMessage: z.string().optional(),
  // Phase 4 (ING-05/ING-07) — historyId cursor + fallback flag, validated
  // here (V5) so finishSyncRun never bypasses zod for the new columns.
  historyId: z.string().min(1).optional(),
  usedFallback: z.boolean().optional(),
});
export type NewSyncRunInput = z.infer<typeof newSyncRunInput>;
