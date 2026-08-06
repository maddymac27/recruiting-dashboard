"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  addConversation,
  createContact,
  linkContactToApplication,
} from "@/domain/contacts";
import { newContactInput, newConversationInput } from "@/db/validation";

// Server Actions for the CAP-04 inline contact/conversation logging slice
// (02-06, D2-10). Both actions `safeParse` against the Phase 1 Zod schemas
// before any domain write (T-02-17), then `revalidatePath` the detail route
// so a newly-logged entry appears in the unified timeline (02-04) without a
// manual reload — same mutation-tier convention as src/app/actions.ts
// (RESEARCH Pattern 5). The underlying domain functions still `.parse()`
// internally — defense in depth, matches the existing convention.

const VALIDATION_ERROR =
  "Couldn't save this change. Check the fields below and try again.";

export type ActionResult =
  | { ok: true; contactId?: number }
  | { ok: false; error: string };

/**
 * Logs a new contact (D-02 fields) and links it to the job's application.
 * `companyId` is supplied by the caller (the job detail Server Component,
 * reading the application's own `companyId`) rather than trusted from
 * client input — a contact always belongs to the same company as the
 * application it's logged against (D-03).
 */
export async function logContactAction(
  applicationId: number,
  companyId: number,
  input: unknown,
): Promise<ActionResult> {
  const parsed = newContactInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  const contactId = createContact(db, { ...parsed.data, companyId });
  linkContactToApplication(db, contactId, applicationId);

  revalidatePath(`/job/${applicationId}`);
  return { ok: true, contactId };
}

/**
 * Logs a dated conversation (D-01) against the job's application. `notes`
 * is persisted verbatim by `addConversation` — no length cap, no
 * transformation — so a pasted self-forwarded LinkedIn note is captured in
 * full (CAP-04 free-text path). `applicationId` is supplied by the caller,
 * overriding anything the client input might carry.
 */
export async function logConversationAction(
  applicationId: number,
  input: unknown,
): Promise<ActionResult> {
  const parsed = newConversationInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  addConversation(db, { ...parsed.data, applicationId });

  revalidatePath(`/job/${applicationId}`);
  return { ok: true };
}
