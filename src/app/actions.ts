"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, dashboardMode } from "@/db/client";
import {
  createApplication,
  quickSaveApplication,
  updateApplication,
} from "@/domain/applications";
import { createCompany, resolveCompany } from "@/domain/companies";
import { createContact } from "@/domain/contacts";
import { listStages } from "@/domain/lookups";
import { runGmailSync } from "@/domain/ingestion";
import { createOutreach } from "@/domain/outreach";
import {
  finishSyncRun,
  getLatestSuccessfulSyncRun,
  startSyncRun,
} from "@/domain/sync-state";
import {
  newOutreachInput,
  quickSaveApplicationInput,
  updateApplicationInput,
} from "@/db/validation";
import { getGmailClient } from "@/gmail/client";
import { getConsentUrl, hasStoredToken } from "@/gmail/oauth";

// Companies are not a fixed lookup (D-04) — the edit dialog re-uses the same
// free-text "type the company name" UX as quick-save/add rather than
// requiring a numeric companyId the client can't reasonably supply. This
// schema is intentionally separate from `updateApplicationInput` (which only
// accepts a numeric `companyId`) — see `updateApplicationAction` below.
const editCompanyNameInput = z.object({
  companyName: z.string().min(1).optional(),
});

// Server Actions ARE this app's mutation tier (CLAUDE.md "What NOT to Use" —
// no second Express/API-route backend). Every action here safeParses its
// input, calls an event-sourcing-safe @/domain/* write, then revalidates the
// affected paths so the board + KPI row + detail view refresh without a
// manual reload (RESEARCH Pattern 5). The domain functions still `.parse()`
// internally — defense in depth (T-02-12).

const VALIDATION_ERROR =
  "Couldn't save this change. Check the fields below and try again.";

export type ActionResult =
  | { ok: true; id?: number }
  | { ok: false; error: string };

const OAUTH_CONNECT_FAILURE =
  "Couldn't connect your Gmail account. Check your credentials and try again.";

export type ConnectGmailResult =
  | { ok: true; url?: string }
  | { ok: false; error: string };

/** Resolves the `Saved` stage id once per call. Throws loudly (rather than
 *  silently skipping the stage event) if seed-lookups.ts hasn't run yet —
 *  matches the project's fail-loudly constraint. */
function requireSavedStage() {
  const savedStage = listStages(db).find((stage) => stage.label === "Saved");
  if (!savedStage) {
    throw new Error(
      "Saved stage missing from lookups — seed-lookups.ts must run first",
    );
  }
  return savedStage;
}

/** Quick-Save Job (CAP-01) — company + role required, URL optional. Creates
 *  the application directly in the Saved stage via the atomic
 *  `quickSaveApplication` transaction (Task 1). */
export async function quickSaveAction(input: unknown): Promise<ActionResult> {
  const parsed = quickSaveApplicationInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  const savedStage = requireSavedStage();
  const id = quickSaveApplication(db, savedStage.id, parsed.data);

  revalidatePath("/"); // board + KPI row both read from "/"
  return { ok: true, id };
}

/** Add Application (CAP-02, add mode) — every editable field, company
 *  resolved/created the same way quick-save does (companies are not a fixed
 *  lookup). Creates via `createApplication`'s existing validate-then-insert
 *  path, then — only if the form supplied a posting URL or an initial
 *  stage — reuses `updateApplication`'s event-sourcing-safe write path
 *  rather than a third ad hoc write. */
export async function addApplicationAction(
  input: unknown,
): Promise<ActionResult> {
  const basics = quickSaveApplicationInput.safeParse(input);
  const extras = updateApplicationInput
    .pick({ roleTypeId: true, sourceId: true, dateApplied: true, stageId: true })
    .safeParse(input);

  if (!basics.success || !extras.success) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  const { companyName, roleTitle, postingUrl } = basics.data;
  const { roleTypeId, sourceId, dateApplied, stageId } = extras.data;

  const companyId =
    resolveCompany(db, companyName) ?? createCompany(db, companyName);

  const id = createApplication(db, {
    companyId,
    roleTitle,
    roleTypeId: roleTypeId ?? undefined,
    sourceId: sourceId ?? undefined,
    dateApplied: dateApplied ?? undefined,
  });

  if (postingUrl !== undefined || stageId !== undefined) {
    updateApplication(db, id, { postingUrl, stageId });
  }

  revalidatePath("/");
  revalidatePath(`/job/${id}`);
  return { ok: true, id };
}

/** Full add/edit dialog in edit mode (CAP-02) — any subset of fields,
 *  including `stageId` which appends a dated status event instead of ever
 *  writing `currentStageId` directly (D-09). Accepts an optional
 *  `companyName` (resolved/created the same way quick-save/add do) alongside
 *  every `updateApplicationInput` field except the numeric `companyId`,
 *  which the client never supplies directly. */
export async function updateApplicationAction(
  id: number,
  input: unknown,
): Promise<ActionResult> {
  const companyNameParsed = editCompanyNameInput.safeParse(input);
  const restParsed = updateApplicationInput.omit({ companyId: true }).safeParse(input);

  if (!companyNameParsed.success || !restParsed.success) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  const { companyName } = companyNameParsed.data;
  const companyId = companyName
    ? (resolveCompany(db, companyName) ?? createCompany(db, companyName))
    : undefined;

  updateApplication(db, id, {
    ...restParsed.data,
    ...(companyId !== undefined ? { companyId } : {}),
  });

  revalidatePath("/");
  revalidatePath(`/job/${id}`);
  return { ok: true, id };
}

/** Explicit change-stage control (D2-06) — never drag-and-drop, never an
 *  in-place overwrite. Appends a dated status event via `updateApplication`
 *  and revalidates both the board (KPI counts) and the detail view. */
export async function changeStageAction(
  id: number,
  stageId: number,
): Promise<ActionResult> {
  const parsed = updateApplicationInput
    .pick({ stageId: true })
    .safeParse({ stageId });
  if (!parsed.success) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  updateApplication(db, id, parsed.data);

  revalidatePath("/");
  revalidatePath(`/job/${id}`);
  return { ok: true, id };
}

/** Log outreach (OUT-01, D-12) — the manual cold-outreach write path. Company
 *  is resolved/created the same way quick-save/add do; the recipient is
 *  either an existing contact (`contactId`) or a brand-new one created here
 *  (`recipient`) — `newOutreachInput`'s refine already guarantees exactly
 *  one of the two is present. `source`/`sourceMessageId` are hardcoded here
 *  ("manual"/null) and NEVER read from client input — `newOutreachInput`
 *  doesn't even declare those fields, so a manual row can never masquerade
 *  as gmail-ingested (T-06-06). Revalidates `/outreach` (new row appears
 *  immediately) and `/contacts` (the Outreach count badge, 06-05). */
export async function logOutreachAction(input: unknown): Promise<ActionResult> {
  const parsed = newOutreachInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: VALIDATION_ERROR };
  }
  const { companyName, contactId, recipient, ...rest } = parsed.data;

  const companyId =
    resolveCompany(db, companyName) ?? createCompany(db, companyName);

  const resolvedContactId =
    contactId ?? createContact(db, { companyId, ...recipient! });

  const id = createOutreach(db, {
    ...rest,
    companyId,
    contactId: resolvedContactId,
    source: "manual", // never accepted from client input
    sourceMessageId: null,
  });

  revalidatePath("/outreach");
  revalidatePath("/contacts"); // Outreach count badge changes too
  return { ok: true, id };
}

/** One-time "Connect Gmail" trigger (ING-01, Surface 5). Gated on
 *  dashboardMode === "real" (T-03-05, Pitfall 6) before touching `.secrets/`
 *  or generating a consent URL. If a token already exists, returns `{ ok:
 *  true }` with no `url` — the client treats this as already-connected and
 *  does nothing. Otherwise returns the Google consent URL for the client to
 *  redirect to via `window.location`. */
export async function connectGmailAction(): Promise<ConnectGmailResult> {
  if (dashboardMode !== "real") {
    return { ok: false, error: "Gmail sync is unavailable in demo mode." };
  }

  if (hasStoredToken()) {
    return { ok: true };
  }

  try {
    return { ok: true, url: getConsentUrl() };
  } catch (error) {
    console.error("Failed to generate Gmail consent URL:", error);
    return { ok: false, error: OAUTH_CONNECT_FAILURE };
  }
}

const SYNC_FAILURE =
  "Sync failed — nothing was imported. Try again, or check the dead-letter queue for details.";

export type SyncGmailResult =
  | { ok: true; newCount: number; reviewCount: number }
  | { ok: false; error: string };

/** Manual "Sync now" trigger (ING-06, Surface 1). Gated on
 *  dashboardMode === "real" (T-03-05) before any Gmail/token access — never
 *  even reads .secrets/ in demo mode. Records a sync_runs row for every
 *  attempt (running -> success|failed) so the health indicator (03-10)
 *  always has a real "last synced" state to read, including a failed run.
 *  Both `lastSync` AND the `historyId` cursor (Phase 4, ING-07/D4-05) are
 *  derived from the last SUCCESSFUL run (`getLatestSuccessfulSyncRun`), not
 *  merely the latest run — a failed intervening run neither narrows the
 *  fallback window nor loses the last-good cursor. This is the SAME
 *  runGmailSync orchestrator the scheduled path (scripts/sync.ts, 04-03)
 *  calls — one code path, per D4-05. */
export async function syncGmailAction(): Promise<SyncGmailResult> {
  if (dashboardMode !== "real") {
    return { ok: false, error: "Gmail sync is unavailable in demo mode." };
  }

  if (!hasStoredToken()) {
    return { ok: false, error: "Gmail not connected yet." };
  }

  const lastSuccess = getLatestSuccessfulSyncRun(db);
  const lastSync = lastSuccess?.finishedAt ?? null;
  const historyId = lastSuccess?.historyId ?? null;

  const runId = startSyncRun(db);

  try {
    const counts = await runGmailSync(db, getGmailClient(), { lastSync, historyId });

    finishSyncRun(db, runId, {
      status: "success",
      newCount: counts.newCount,
      reviewCount: counts.reviewCount,
      deadLetterCount: counts.deadLetterCount,
      historyId: counts.newHistoryId,
      usedFallback: counts.usedFallback,
    });

    revalidatePath("/");
    revalidatePath("/review");
    revalidatePath("/dead-letter");

    return { ok: true, newCount: counts.newCount, reviewCount: counts.reviewCount };
  } catch (error) {
    console.error("Gmail sync failed:", error);
    finishSyncRun(db, runId, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: SYNC_FAILURE };
  }
}
