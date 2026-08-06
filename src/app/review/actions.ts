"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { listBoardApplications } from "@/domain/board";
import { createApplication } from "@/domain/applications";
import { createCompany, resolveCompany } from "@/domain/companies";
import {
  addConversation,
  createContact,
  linkContactToApplication,
} from "@/domain/contacts";
import { appendStatusEvent } from "@/domain/events";
import { listStages } from "@/domain/lookups";
import { getReviewItemById, resolveReviewItem } from "@/domain/review-queue";

// Review-queue Server Actions (REL-01, 03-08) — each action reads the review
// item's own server-stored parsed fields (via getReviewItemById) rather than
// trusting client-resubmitted copies, composes an existing domain write
// (appendStatusEvent / createApplication / addConversation — no new event-
// write path), then transitions the item Pending -> Resolved via
// resolveReviewItem and revalidates /review + / (same ActionResult +
// revalidatePath convention as src/app/actions.ts and
// src/app/job/[id]/actions.ts). No action here ever deletes a review row
// (T-03-14) — resolveReviewItem only ever flips status.

const VALIDATION_ERROR =
  "Couldn't save this change. Check the fields below and try again.";

export type ActionResult =
  | { ok: true; id?: number }
  | { ok: false; error: string };

const reviewApplicationIdInput = z.object({
  reviewId: z.number().int().positive(),
  applicationId: z.number().int().positive(),
});

/** Resolves a review item's stored `parsedStageLabel` to a stage id via the
 *  existing stage lookup table — never a hard-coded stage id. Returns null
 *  if the label is absent or no longer matches a seeded stage (fail loud —
 *  the caller turns this into a VALIDATION_ERROR rather than guessing). */
function resolveParsedStageId(parsedStageLabel: string | null): number | null {
  if (!parsedStageLabel) return null;
  const stage = listStages(db).find((s) => s.label === parsedStageLabel);
  return stage ? stage.id : null;
}

/**
 * "Confirm match" (low_confidence_match) — attaches the item's own
 * `candidateApplicationId` by appending a dated status event using the
 * item's stored `parsedStageLabel`/`parsedEventDate`/`sourceMessageId`, then
 * resolves the item "confirmed". No dialog/user-editable input: the
 * suggested application is exactly what the row already displays.
 */
export async function confirmReviewMatchAction(
  reviewId: number,
  applicationId: number,
): Promise<ActionResult> {
  const parsed = reviewApplicationIdInput.safeParse({ reviewId, applicationId });
  if (!parsed.success) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  const item = getReviewItemById(db, parsed.data.reviewId);
  if (!item || item.status !== "pending") {
    return { ok: false, error: VALIDATION_ERROR };
  }

  const stageId = resolveParsedStageId(item.parsedStageLabel);
  if (!stageId || !item.parsedEventDate) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  appendStatusEvent(db, {
    applicationId: parsed.data.applicationId,
    stageId,
    occurredAt: item.parsedEventDate,
    sourceMessageId: item.sourceMessageId ?? undefined,
  });

  resolveReviewItem(db, parsed.data.reviewId, "confirmed");

  revalidatePath("/review");
  revalidatePath("/");
  return { ok: true, id: parsed.data.applicationId };
}

/**
 * "Choose different application" (low_confidence_match) / "Attach to
 * existing" (unmatched_confirm_create) — identical write shape to
 * `confirmReviewMatchAction`, but for an explicitly user-chosen
 * `applicationId` rather than the item's suggested candidate, and resolves
 * the item "reassigned" (distinguishing a manual pick from an auto-suggested
 * confirm in the audit trail).
 */
export async function attachReviewToApplicationAction(
  reviewId: number,
  applicationId: number,
): Promise<ActionResult> {
  const parsed = reviewApplicationIdInput.safeParse({ reviewId, applicationId });
  if (!parsed.success) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  const item = getReviewItemById(db, parsed.data.reviewId);
  if (!item || item.status !== "pending") {
    return { ok: false, error: VALIDATION_ERROR };
  }

  const stageId = resolveParsedStageId(item.parsedStageLabel);
  if (!stageId || !item.parsedEventDate) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  appendStatusEvent(db, {
    applicationId: parsed.data.applicationId,
    stageId,
    occurredAt: item.parsedEventDate,
    sourceMessageId: item.sourceMessageId ?? undefined,
  });

  resolveReviewItem(db, parsed.data.reviewId, "reassigned");

  revalidatePath("/review");
  revalidatePath("/");
  return { ok: true, id: parsed.data.applicationId };
}

const createFromReviewInput = z.object({
  companyName: z.string().min(1),
  roleTitle: z.string().min(1),
  dateApplied: z.date().optional(),
});

/**
 * "Create application" (unmatched_confirm_create) — resolves/creates the
 * company and creates the application from the dialog's (parsed-prefilled,
 * user-editable) company/role/date, then appends the item's parsed-stage
 * event, then resolves the item "confirmed". Company + role are required at
 * save (UI-SPEC partial/create rule) even though role is optional on the
 * underlying quick-save path.
 */
export async function createFromReviewAction(
  reviewId: number,
  input: unknown,
): Promise<ActionResult> {
  const parsed = createFromReviewInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  const item = getReviewItemById(db, reviewId);
  if (!item || item.status !== "pending") {
    return { ok: false, error: VALIDATION_ERROR };
  }

  const stageId = resolveParsedStageId(item.parsedStageLabel);
  const occurredAt = parsed.data.dateApplied ?? item.parsedEventDate;
  if (!stageId || !occurredAt) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  const companyId =
    resolveCompany(db, parsed.data.companyName) ??
    createCompany(db, parsed.data.companyName);

  const applicationId = createApplication(db, {
    companyId,
    roleTitle: parsed.data.roleTitle,
    dateApplied: occurredAt,
  });

  appendStatusEvent(db, {
    applicationId,
    stageId,
    occurredAt,
    sourceMessageId: item.sourceMessageId ?? undefined,
  });

  resolveReviewItem(db, reviewId, "confirmed");

  revalidatePath("/review");
  revalidatePath("/");
  revalidatePath(`/job/${applicationId}`);
  return { ok: true, id: applicationId };
}

const logReviewAsConversationInput = z
  .object({
    contactId: z.number().int().positive().optional(),
    newContact: z
      .object({
        name: z.string().min(1),
        roleTitle: z.string().min(1).optional(),
        channel: z.string().min(1).optional(),
        relationshipType: z.string().min(1).optional(),
        source: z.string().min(1).optional(),
        email: z.string().email().optional(),
        linkedinUrl: z.string().url().optional(),
      })
      .optional(),
    occurredAt: z.date(),
    channel: z.string().min(1).optional(),
    notes: z.string().optional(),
  })
  .refine(
    (value) => value.contactId !== undefined || value.newContact !== undefined,
    { message: "contactId or newContact is required" },
  );

/**
 * "Log as conversation" (label_mail) — creates or reuses a contact on the
 * user-chosen `applicationId`, then records a dated conversation (defaults
 * to the item's own verbatim `bodyText` as the note if the dialog's edited
 * notes came back empty), then resolves the item "confirmed". Composes
 * `createContact`/`linkContactToApplication`/`addConversation` directly
 * (not `logContactAction`/`logConversationAction` from
 * `job/[id]/actions.ts`) so the review resolution happens in the same
 * action as the write, per the plan's one-action-per-row-decision shape.
 */
export async function logReviewAsConversationAction(
  reviewId: number,
  applicationId: number,
  input: unknown,
): Promise<ActionResult> {
  const ids = reviewApplicationIdInput.safeParse({ reviewId, applicationId });
  const parsed = logReviewAsConversationInput.safeParse(input);
  if (!ids.success || !parsed.success) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  const item = getReviewItemById(db, ids.data.reviewId);
  if (!item || item.status !== "pending") {
    return { ok: false, error: VALIDATION_ERROR };
  }

  let contactId: number;
  if (parsed.data.contactId !== undefined) {
    contactId = parsed.data.contactId;
  } else {
    // A new contact is attributed to the same company as the chosen
    // application (D-03) — resolved from the existing board read model
    // rather than trusting an unvalidated client-supplied companyId.
    const application = listBoardApplications(db).find(
      (app) => app.id === ids.data.applicationId,
    );
    if (!application || !parsed.data.newContact) {
      return { ok: false, error: VALIDATION_ERROR };
    }
    contactId = createContact(db, {
      companyId: application.companyId,
      ...parsed.data.newContact,
    });
    linkContactToApplication(db, contactId, ids.data.applicationId);
  }

  addConversation(db, {
    contactId,
    applicationId: ids.data.applicationId,
    occurredAt: parsed.data.occurredAt,
    channel: parsed.data.channel,
    // Persisted verbatim — the dialog pre-fills from item.bodyText but the
    // user may edit it; if it somehow comes back empty, fall back to the
    // item's own stored verbatim body rather than losing the note.
    notes: parsed.data.notes || item.bodyText || undefined,
  });

  resolveReviewItem(db, ids.data.reviewId, "confirmed");

  revalidatePath("/review");
  revalidatePath("/");
  revalidatePath(`/job/${ids.data.applicationId}`);
  return { ok: true, id: ids.data.applicationId };
}
