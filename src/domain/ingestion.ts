import { eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { Common } from "googleapis";
import { applications, sources, stages } from "@/db/schema";
import type {
  NewDeadLetterEntryInput,
  NewReviewQueueEntryInput,
  ParsedEmailResult,
} from "@/db/validation";
import {
  fetchHistoryMessageIds,
  fetchParsedMessage,
  listAllMessageIds,
} from "@/gmail/fetch";
import { dispatchParser } from "@/gmail/parsers";
import {
  buildSenderQuery,
  KNOWN_SENDER_DOMAINS,
  resolveJobSearchLabelId,
} from "@/gmail/query";
import type { GmailClient, ParsedMessage } from "@/gmail/types";
import { createCompany, resolveCompany } from "./companies";
import {
  insertDeadLetterEntryTx,
  listPendingDeadLetter,
  resolveDeadLetterByMessageIdTx,
} from "./dead-letter";
import { appendStatusEventTx } from "./events";
import { listStages } from "./lookups";
import type { DbOrTx } from "./projections";
import { insertReviewQueueEntryTx } from "./review-queue";
import { isAlreadyIngested, recordIngestedTx } from "./sync-state";

// Composes the 03-04 fetch/parse pipeline with the 03-05 routing/dedup
// domain into ONE end-to-end manual sync (ING-06). Every fetched message
// lands in exactly one of {transition, review, dead_letter} — nothing is
// ever silently dropped (RESEARCH "Key insight" / D3-04/D3-05/D3-06).

export interface SyncCounts {
  newCount: number;
  reviewCount: number;
  deadLetterCount: number;
}

// A decision is computed entirely from already-fetched/parsed data (pure,
// synchronous) — the per-message `db.transaction` callback below only ever
// consumes an already-built RouteDecision, never awaits anything itself
// (RESEARCH Pitfall 3).
type RouteDecision =
  | {
      kind: "transition";
      applicationId: number;
      stageId: number;
      occurredAt: Date;
      confidence: number;
    }
  | {
      kind: "auto_create";
      companyName: string;
      roleTitle?: string;
      stageId: number;
      occurredAt: Date;
      sourceId?: number;
    }
  | { kind: "review"; entry: NewReviewQueueEntryInput }
  | { kind: "dead_letter"; entry: NewDeadLetterEntryInput };

interface MatchResult {
  matchType: "high" | "low" | "none";
  applicationId?: number;
  confidence: number;
}

/**
 * Resolves a parsed company name to a candidate application (conservative
 * match-confidence default, 03-CONTEXT "Claude's Discretion"): exactly one
 * OPEN (non-terminal-stage) application for the resolved company is a
 * high-confidence auto-attach; more than one open application is ambiguous
 * (`low_confidence_match`, best-guess candidate still routed to review); no
 * resolvable company or no open application at all is `unmatched`
 * (`unmatched_confirm_create`). No fuzzy company matching here — delegates
 * entirely to the existing `resolveCompany` (canonical name + alias table).
 */
function matchApplication(db: NodeSQLiteDatabase, companyName: string): MatchResult {
  const companyId = resolveCompany(db, companyName);
  if (companyId === null) {
    return { matchType: "none", confidence: 0 };
  }

  const candidates = db
    .select({
      id: applications.id,
      currentStageIsTerminal: stages.isTerminal,
    })
    .from(applications)
    .leftJoin(stages, eq(applications.currentStageId, stages.id))
    .where(eq(applications.companyId, companyId))
    .all()
    .filter((row) => row.currentStageIsTerminal !== true);

  if (candidates.length === 1) {
    return { matchType: "high", confidence: 1, applicationId: candidates[0].id };
  }
  if (candidates.length > 1) {
    return { matchType: "low", confidence: 0.5, applicationId: candidates[0].id };
  }
  return { matchType: "none", confidence: 0 };
}

/** The RouteDecision variants that only make sense once a parser has
 *  already produced a full ParsedEmailResult — shared between the live sync
 *  pipeline (classifyQueryMessage, below) and the dead-letter reparse
 *  pipeline (reparseDeadLetter, below). */
type MatchedDecision =
  | {
      kind: "transition";
      applicationId: number;
      stageId: number;
      occurredAt: Date;
      confidence: number;
    }
  | {
      kind: "auto_create";
      companyName: string;
      roleTitle?: string;
      stageId: number;
      occurredAt: Date;
      sourceId?: number;
    }
  | { kind: "review"; entry: NewReviewQueueEntryInput };

// The stage label an auto-create decision requires — an application
// confirmation, not a rejection/interview for a company we've never heard
// of (those still need a human to confirm the company is real before a row
// is created for it).
const APPLIED_STAGE_LABEL = "Applied";

/**
 * Maps an auto-created ATS-confirmation application to the existing D-06
 * "Company site / ATS" source lookup value. D-06 locks the `sources`
 * vocabulary as a small, curated "how did you find this job" list
 * (Handshake / Company site / ATS / Referral / LinkedIn / Job board) — it is
 * NOT a per-ATS-vendor list, so this never creates a new source row named
 * "Workday"/"SmartRecruiters"/"Ashby". Every sender this pipeline currently
 * dispatches a parser for IS a company's own hiring ATS, which is exactly
 * what "Company site / ATS" represents. Returns `undefined` (leaves
 * `sourceId` unset) if that lookup row is somehow missing rather than
 * failing the whole auto-create — a missing optional dimension is not a
 * reason to drop a real application confirmation.
 */
function resolveAtsConfirmationSourceId(db: NodeSQLiteDatabase): number | undefined {
  const row = db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.label, "Company site / ATS"))
    .get();
  return row?.id;
}

/**
 * Resolves an already-successfully-parsed result to a stage lookup + a
 * matched application (D3-04/CONTEXT discretion, REVISED): a high-confidence
 * single open-application match becomes a `transition`; an ambiguous
 * (`low_confidence_match`) company still routes to `review`; an unmatched
 * company (`matchType: "none"`) AUTO-CREATES the application when the parsed
 * status is an application confirmation ("Applied") — a high-confidence ATS
 * confirmation for a company we don't have yet is exactly the "the record
 * stays accurate without me remembering to update it" case this project
 * exists for, so it no longer waits on a review click. Any other unmatched
 * status (Rejected/Interview for a company we've never seen — implies we
 * missed the original Applied confirmation, or the company genuinely needs
 * human confirmation) still routes to `review` as `unmatched_confirm_create`.
 * Returns `null` when the parsed stageLabel has no matching lookup row — the
 * caller decides how to record that (a fresh dead_letter row for a live
 * sync message that's never been recorded before, vs. leaving an existing
 * dead_letter row pending for a reparse attempt). Extracted so
 * reparseDeadLetter never has to re-implement entity resolution — the exact
 * same matching rules govern first-pass sync and later reparse.
 */
function classifyParsedResult(
  db: NodeSQLiteDatabase,
  result: ParsedEmailResult,
  stageIdByLabel: Map<string, number>,
): MatchedDecision | null {
  const stageId = stageIdByLabel.get(result.stageLabel);
  if (stageId === undefined) return null;

  const match = matchApplication(db, result.company);

  if (match.matchType === "high" && match.applicationId !== undefined) {
    return {
      kind: "transition",
      applicationId: match.applicationId,
      stageId,
      occurredAt: result.occurredAt,
      confidence: match.confidence,
    };
  }

  if (match.matchType === "low") {
    return {
      kind: "review",
      entry: {
        type: "low_confidence_match",
        sourceMessageId: result.sourceMessageId,
        candidateApplicationId: match.applicationId,
        confidence: match.confidence,
        sender: result.sender,
        subject: result.subject,
        parsedCompany: result.company,
        parsedRoleTitle: result.roleTitle,
        parsedStageLabel: result.stageLabel,
        parsedEventDate: result.occurredAt,
      },
    };
  }

  // match.matchType === "none" — genuinely no existing company/application.
  if (result.stageLabel === APPLIED_STAGE_LABEL) {
    return {
      kind: "auto_create",
      companyName: result.company,
      roleTitle: result.roleTitle,
      stageId,
      occurredAt: result.occurredAt,
      sourceId: resolveAtsConfirmationSourceId(db),
    };
  }

  return {
    kind: "review",
    entry: {
      type: "unmatched_confirm_create",
      sourceMessageId: result.sourceMessageId,
      sender: result.sender,
      subject: result.subject,
      parsedCompany: result.company,
      parsedRoleTitle: result.roleTitle,
      parsedStageLabel: result.stageLabel,
      parsedEventDate: result.occurredAt,
    },
  };
}

/**
 * Executes an `auto_create` decision: resolve-or-create the company (the
 * same `resolveCompany`/`createCompany` primitives `quickSaveApplication`
 * uses), insert the application row (source = "Company site / ATS",
 * dateApplied = the parsed event date), and append the Applied status
 * event via `appendStatusEventTx` — the same create-then-append shape
 * `quickSaveApplication` uses for a manual Saved capture. Opens NO
 * transaction of its own (RESEARCH Pitfall 2) — the caller (`writeDecision`
 * or `reparseDeadLetter`) always runs this inside its own per-message
 * `db.transaction`.
 *
 * De-dup note: every write in this pipeline runs strictly sequentially, one
 * fully-committed `db.transaction` per message/row (never concurrently) —
 * see `runGmailSync`'s per-message loop and `reparseDeadLetter`'s per-row
 * loop. So a SECOND same-run confirmation for a company this function just
 * created will see that company via `resolveCompany` (a fresh read) on its
 * own `classifyParsedResult` call, find the ONE open (non-terminal-stage)
 * application just created for it, and resolve as a high-confidence
 * `transition` onto that same application — not another `auto_create`. No
 * extra same-run dedup bookkeeping is needed here; it falls out of the
 * existing sequential-transaction architecture.
 */
function autoCreateApplicationTx(
  tx: DbOrTx,
  decision: Extract<RouteDecision, { kind: "auto_create" }>,
  sourceMessageId: string,
): number {
  const companyId =
    resolveCompany(tx, decision.companyName) ?? createCompany(tx, decision.companyName);

  const inserted = tx
    .insert(applications)
    .values({
      companyId,
      roleTitle: decision.roleTitle,
      sourceId: decision.sourceId,
      dateApplied: decision.occurredAt,
    })
    .run();
  const applicationId = Number(inserted.lastInsertRowid);

  appendStatusEventTx(tx, {
    applicationId,
    stageId: decision.stageId,
    occurredAt: decision.occurredAt,
    sourceMessageId,
    // High confidence — the same 1.0 a single-open-application `transition`
    // match carries. An auto-create only ever fires for a parsed
    // "Applied" confirmation, D3-05's minimum bar (company + status + date)
    // already met.
    confidence: 1,
  });

  return applicationId;
}

/**
 * Classifies one sender-query-pass message into a RouteDecision. Never
 * silently drops a message: no parser registered / a known sender whose
 * template didn't match (D3-05 bar) / a parsed stage label with no lookup
 * row all route to `dead_letter`; a resolved parse routes to a `transition`
 * (high-confidence single open application) or `review`
 * (`low_confidence_match` / `unmatched_confirm_create`) per D3-04/CONTEXT
 * discretion defaults.
 */
function classifyQueryMessage(
  db: NodeSQLiteDatabase,
  msg: ParsedMessage,
  stageIdByLabel: Map<string, number>,
): RouteDecision {
  const rawPayload = msg.text.length > 0 ? msg.text : "(empty message body)";
  const parser = dispatchParser(msg.from);

  if (!parser) {
    return {
      kind: "dead_letter",
      entry: {
        type: "unparseable",
        sourceMessageId: msg.messageId,
        rawPayload,
        sender: msg.from,
        subject: msg.subject,
        failedStage: "classify",
        errorMessage: "No parser registered for this sender's domain.",
      },
    };
  }

  const result = parser(msg);

  if (!result) {
    return {
      kind: "dead_letter",
      entry: {
        type: "known_sender_failed",
        sourceMessageId: msg.messageId,
        rawPayload,
        sender: msg.from,
        subject: msg.subject,
        failedStage: "extract",
        errorMessage:
          "Known sender's email did not meet the D3-05 minimum bar (company + status + a real event date).",
      },
    };
  }

  const matched = classifyParsedResult(db, result, stageIdByLabel);

  if (!matched) {
    return {
      kind: "dead_letter",
      entry: {
        type: "known_sender_failed",
        sourceMessageId: msg.messageId,
        rawPayload,
        sender: msg.from,
        subject: msg.subject,
        failedStage: "resolve",
        errorMessage: `Parsed stage label "${result.stageLabel}" has no matching lookup stage.`,
      },
    };
  }

  // MatchedDecision's transition/auto_create/review variants are each an
  // exact structural subset of RouteDecision — no remapping needed.
  return matched;
}

/** Writes an already-computed RouteDecision inside a caller-owned tx — opens
 *  NO transaction of its own, mirroring every other `*Tx` primitive in this
 *  phase (RESEARCH Pitfall 2). Always pairs the routing-decision insert with
 *  the dedup-ledger insert so both land atomically per message. */
function writeDecision(
  tx: DbOrTx,
  messageId: string,
  decision: RouteDecision,
  counts: SyncCounts,
): void {
  switch (decision.kind) {
    case "transition": {
      appendStatusEventTx(tx, {
        applicationId: decision.applicationId,
        stageId: decision.stageId,
        occurredAt: decision.occurredAt,
        sourceMessageId: messageId,
        confidence: decision.confidence,
      });
      recordIngestedTx(tx, messageId, "transition", decision.applicationId);
      counts.newCount += 1;
      break;
    }
    case "auto_create": {
      const applicationId = autoCreateApplicationTx(tx, decision, messageId);
      // Recorded as "transition" in the dedup ledger — an auto-create IS a
      // real status-event append, just onto a company we didn't have a row
      // for yet, matching the "transition/new-application outcome" framing.
      recordIngestedTx(tx, messageId, "transition", applicationId);
      counts.newCount += 1;
      break;
    }
    case "review": {
      insertReviewQueueEntryTx(tx, decision.entry);
      recordIngestedTx(tx, messageId, "review");
      counts.reviewCount += 1;
      break;
    }
    case "dead_letter": {
      insertDeadLetterEntryTx(tx, decision.entry);
      recordIngestedTx(tx, messageId, "dead_letter");
      counts.deadLetterCount += 1;
      break;
    }
  }
}

function formatAfterQuery(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `after:${year}/${month}/${day}`;
}

/**
 * Orchestrates one manual Gmail sync end-to-end (ING-06): message-id
 * resolution FIRST (historyId-incremental with a bounded 404 fallback,
 * ING-07/ROADMAP criterion 3, D4-04 — see below), then the "Job Search"
 * label-backfill pass SECOND (ING-03) — the query pass always wins a
 * query↔label overlap (D3-06) because the label pass skips any message id
 * the query pass already recorded in the `ingested_messages` ledger. FINALLY,
 * re-parses any PENDING dead_letter backlog (D3-02 follow-up) through the
 * current parsers — this is what makes "Sync now" the single user-triggered
 * action that resolves previously-dead-lettered mail once its sender's
 * parser is fixed, with no separate UI/action required.
 *
 * ALL async work (Gmail fetch, MIME parse, regex extraction, entity/stage
 * resolution) happens per-message BEFORE that message's `db.transaction` is
 * opened (RESEARCH Pitfall 3) — the transaction callback below is always a
 * synchronous function consuming an already-computed RouteDecision. One
 * transaction PER MESSAGE, never one for the whole run (RESEARCH Pitfall 2)
 * — a mid-backfill failure on a large D3-06 first-run label import preserves
 * every message processed before it.
 *
 * Message-id resolution (ING-07 / D4-04, Phase 4): when `historyId` is
 * present, try `fetchHistoryMessageIds` first. On success, use its ids
 * (usedFallback=false). On a `Common.GaxiosError` with `status === 404` (the
 * cursor has expired/is invalid), fall back to the SAME `lastSync`-windowed
 * full-fetch this function already runs on a cold start — bounded by the
 * last successful sync, never the entire label (D4-04) — and record
 * `usedFallback: true` so the fallback is observable, not silent. Any other
 * error (401/5xx/network) re-throws unchanged (RESEARCH Pitfall 2) so it
 * still hits the caller's fail-loud `finishSyncRun({ status: "failed" })`
 * path — a misread signal must never silently trigger an unwanted full
 * re-sync or mask a real auth/quota failure (T-04-03). The cursor itself is
 * re-seeded via `getProfileHistoryId()` only AFTER all work completes, at
 * the very end of this function (RESEARCH Pitfall 3) — never before Pass 1
 * — so a message arriving mid-run is covered by the NEXT incremental call,
 * never skipped.
 */
export async function runGmailSync(
  db: NodeSQLiteDatabase,
  client: GmailClient,
  { lastSync, historyId }: { lastSync: Date | null; historyId: string | null },
): Promise<SyncCounts & { newHistoryId?: string; usedFallback: boolean }> {
  const counts: SyncCounts = { newCount: 0, reviewCount: 0, deadLetterCount: 0 };
  const stageIdByLabel = new Map(
    listStages(db).map((stage) => [stage.label, stage.id]),
  );

  // Pass 1: message-id source — historyId-first with a bounded 404 fallback
  // (see doc comment above). Always processed first so it wins the D3-06
  // query↔label dedup race, exactly like the pre-Phase-4 sender-query pass.
  let usedFallback = historyId !== null;
  let queryMessageIds: string[];
  if (historyId) {
    try {
      const result = await fetchHistoryMessageIds(client, historyId);
      queryMessageIds = result.messageIds;
      usedFallback = false;
    } catch (err) {
      if (err instanceof Common.GaxiosError && err.status === 404) {
        const senderQuery = buildSenderQuery(KNOWN_SENDER_DOMAINS, lastSync ?? undefined);
        queryMessageIds = await listAllMessageIds(client, { q: senderQuery });
      } else {
        throw err; // never silently swallow a non-404 error (T-04-03)
      }
    }
  } else {
    const senderQuery = buildSenderQuery(KNOWN_SENDER_DOMAINS, lastSync ?? undefined);
    queryMessageIds = await listAllMessageIds(client, { q: senderQuery });
  }

  for (const messageId of queryMessageIds) {
    if (isAlreadyIngested(db, messageId)) continue;

    const msg = await fetchParsedMessage(client, messageId);
    const decision = classifyQueryMessage(db, msg, stageIdByLabel);

    db.transaction((tx) => {
      writeDecision(tx, messageId, decision, counts);
    });
  }

  // Pass 2: "Job Search" label-backfill pass (ING-03, D3-06). First sync
  // (lastSync === null) intentionally backfills the label's ENTIRE existing
  // contents — no `after:` filter. Fails loud (throws) if the label can't be
  // resolved, rather than silently skipping the whole pass.
  const labelId = await resolveJobSearchLabelId(client);
  const labelListParams = lastSync
    ? { labelIds: [labelId], q: formatAfterQuery(lastSync) }
    : { labelIds: [labelId] };
  const labelMessageIds = await listAllMessageIds(client, labelListParams);

  for (const messageId of labelMessageIds) {
    // Query-pass wins (D3-06): a known-sender ATS email already parsed into
    // a transition/review/dead-letter in Pass 1 is never also recorded as
    // label_mail.
    if (isAlreadyIngested(db, messageId)) continue;

    const msg = await fetchParsedMessage(client, messageId);
    const decision: RouteDecision = {
      kind: "review",
      entry: {
        type: "label_mail",
        sourceMessageId: messageId,
        sender: msg.from,
        subject: msg.subject,
        bodyText: msg.text,
        parsedEventDate: msg.date,
      },
    };

    db.transaction((tx) => {
      writeDecision(tx, messageId, decision, counts);
    });
  }

  // Pass 3: reparse the pending dead-letter backlog (D3-02 follow-up) using
  // the same GmailClient — folds directly into the counts a "Sync now" click
  // reports, so a resolved backlog item reads the same as any other
  // newly-produced transition/review item this run.
  const reparseCounts = await reparseDeadLetter(db, client);
  counts.newCount += reparseCounts.resolvedAsTransitionCount;
  counts.reviewCount += reparseCounts.resolvedAsReviewCount;

  // Re-seed/refresh the cursor AFTER all fetch/parse/write work completes,
  // never before (RESEARCH Pitfall 3 / T-04-11) — a message arriving mid-run
  // is covered by the next incremental call, not skipped.
  const newHistoryId = await client.getProfileHistoryId();
  return { ...counts, newHistoryId, usedFallback };
}

// ---------------------------------------------------------------------------
// Dead-letter reparse (03-02 follow-up, post 03-06 live-sync smoke test /
// D3-05 date-policy revision) — resolves a PENDING dead_letter row after a
// sender parser has been fixed. Re-FETCHES each row's message from Gmail
// (via the same `fetchParsedMessage` the live sync pipeline uses) rather
// than reusing the stored `dead_letter.raw_payload`: `raw_payload` only ever
// held the post-MIME-parse plain-text body (never the RFC822 `Date:`
// header), and the revised D3-05 policy needs a real received-time to fall
// back to when no explicit date is extracted (see
// received-time-fallback.ts). A fresh fetch is the only way to recover an
// accurate date for the pre-fix backlog, whose dead_letter rows predate this
// policy and never had a date stored anywhere.
// ---------------------------------------------------------------------------

export interface ReparseCounts {
  resolvedAsTransitionCount: number;
  resolvedAsReviewCount: number;
  stillFailedCount: number;
}

/**
 * Re-runs `dispatchParser` + the sender parser against every PENDING
 * dead_letter row, re-fetched fresh from Gmail by `sourceMessageId`. For
 * each row:
 *  - `dispatchParser` still returns null (sender's domain still has no
 *    parser) -> left pending, counted as still-failed.
 *  - the message can no longer be fetched (e.g. deleted in Gmail since
 *    ingestion) -> left pending, still-failed. One bad row never aborts the
 *    rest of the backlog.
 *  - the sender's parser itself still returns null (company/status still
 *    unextractable) -> left pending, still-failed.
 *  - the parser succeeds but the parsed stageLabel has no matching lookup
 *    row -> left pending, still-failed (mirrors classifyQueryMessage's
 *    identical "resolve" failure case).
 *  - the parser succeeds and resolves -> routed through the exact same
 *    `classifyParsedResult` entity-resolution rules the live sync pipeline
 *    uses (a high-confidence single open-application match becomes a
 *    transition; an ambiguous/unmatched company becomes a review-queue
 *    entry) and the dead_letter row is flipped to resolved (REL-02) via
 *    `resolveDeadLetterByMessageIdTx` — the original failure record is
 *    preserved, never deleted. Fail-loud throughout: nothing is ever
 *    force-resolved or silently dropped.
 *
 * One transaction per row (RESEARCH Pitfall 2) — a mid-backlog failure
 * preserves every row resolved before it. Idempotent by construction: once
 * a row's `dead_letter.status` flips to "resolved", `listPendingDeadLetter`
 * never returns it again, so calling this repeatedly (e.g. once per "Sync
 * now" click) only ever touches rows still genuinely pending. Never touches
 * the `ingested_messages` dedup ledger — that ledger's only job is
 * preventing the ORIGINAL sync pass from re-fetching a message, a separate
 * concern from resolving a dead-letter row after the fact.
 */
export async function reparseDeadLetter(
  db: NodeSQLiteDatabase,
  client: GmailClient,
): Promise<ReparseCounts> {
  const counts: ReparseCounts = {
    resolvedAsTransitionCount: 0,
    resolvedAsReviewCount: 0,
    stillFailedCount: 0,
  };
  const stageIdByLabel = new Map(
    listStages(db).map((stage) => [stage.label, stage.id]),
  );

  for (const entry of listPendingDeadLetter(db)) {
    if (!entry.sender || !entry.sourceMessageId) {
      counts.stillFailedCount += 1;
      continue;
    }

    const parser = dispatchParser(entry.sender);
    if (!parser) {
      counts.stillFailedCount += 1;
      continue;
    }

    let msg: ParsedMessage;
    try {
      msg = await fetchParsedMessage(client, entry.sourceMessageId);
    } catch {
      counts.stillFailedCount += 1;
      continue;
    }

    const result = parser(msg);
    if (!result) {
      counts.stillFailedCount += 1;
      continue;
    }

    const matched = classifyParsedResult(db, result, stageIdByLabel);
    if (!matched) {
      counts.stillFailedCount += 1;
      continue;
    }

    const sourceMessageId = entry.sourceMessageId;
    db.transaction((tx) => {
      if (matched.kind === "transition") {
        appendStatusEventTx(tx, {
          applicationId: matched.applicationId,
          stageId: matched.stageId,
          occurredAt: matched.occurredAt,
          sourceMessageId,
          confidence: matched.confidence,
        });
      } else if (matched.kind === "auto_create") {
        autoCreateApplicationTx(tx, matched, sourceMessageId);
      } else {
        insertReviewQueueEntryTx(tx, matched.entry);
      }
      resolveDeadLetterByMessageIdTx(tx, sourceMessageId);
    });

    if (matched.kind === "transition" || matched.kind === "auto_create") {
      counts.resolvedAsTransitionCount += 1;
    } else {
      counts.resolvedAsReviewCount += 1;
    }
  }

  return counts;
}
