import { parsedEmailResult, type ParsedEmailResult } from "@/db/validation";

import type { ParsedMessage } from "../types";
import { resolveOccurredAt } from "./received-time-fallback";

// ---------------------------------------------------------------------------
// D3-02 FOLLOW-UP (post 03-06 live-sync smoke test): the original regex here
// was authored against a SYNTHETIC fixture and did not match the one real
// Ashby dead-letter row in this user's inbox — the real confirmation email
// uses "Thank you for applying for the <Role> role at <Company>!", not
// "Thanks for your interest in the <Role> role at <Company>!" as the
// synthetic fixture assumed. Only one real Ashby message (an application
// confirmation) has been observed so far, so real rejection/interview
// shapes are unconfirmed — the original synthetic-derived patterns for
// those are kept as a best-effort fallback below rather than discarded, but
// remain unvalidated against real mail.
//
// DATE POLICY (D3-05, REVISED): the real Ashby application-confirmation
// template observed does not embed an explicit calendar date in the body —
// see received-time-fallback.ts for the full rationale. `parseAshby` now
// prefers an explicit date when one is present (the regexes below) and
// falls back to the message's received time otherwise, via
// `resolveOccurredAt`.
// ---------------------------------------------------------------------------

/** See workday.ts's identical helper: real mail is word-wrapped by
 *  html-to-text, so a literal multi-word phrase can have a newline inside
 *  it. Collapse whitespace runs before running any keyword/phrase regex. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ");
}

export interface ExtractedCompany {
  company: string;
  roleTitle?: string;
}

/** Tried in priority order — first match wins. */
export function extractCompany(text: string): ExtractedCompany | null {
  const t = normalize(text);
  let m: RegExpMatchArray | null;

  // "Thank you for applying for the <Role> role at <Company>!" — the real
  // shape observed in this inbox.
  if ((m = t.match(/applying for the (.+?) role at ([^!]+)!/))) {
    return { company: m[2].trim(), roleTitle: m[1].trim() };
  }
  // "Thanks for your interest in the <Role> role at <Company>!" — the
  // synthetic-derived shape, kept as an unvalidated fallback.
  if ((m = t.match(/interest in the (.+?) role at ([^!]+)!/))) {
    return { company: m[2].trim(), roleTitle: m[1].trim() };
  }

  return null;
}

const REJECTED_KEYWORDS = /not (?:to )?move forward/i;
const INTERVIEW_KEYWORDS = /interview is set for/i;
const APPLIED_KEYWORDS = /We will review your application|application was submitted/i;

/** Status classification is independent of date presence — see the module
 *  header: the one real Ashby message sampled signals status in the body
 *  even though it has no explicit date at all. */
export function classifyStatus(text: string): string | null {
  const t = normalize(text);
  if (REJECTED_KEYWORDS.test(t)) return "Rejected";
  if (INTERVIEW_KEYWORDS.test(t)) return "Interview";
  if (APPLIED_KEYWORDS.test(t)) return "Applied";
  return null;
}

const REJECTED_DATE_PATTERN = /not (?:to )?move forward.*?decided on ([A-Za-z]+ \d{1,2}, \d{4})/;
const INTERVIEW_DATE_PATTERN = /interview is set for\s+([A-Za-z]+ \d{1,2}, \d{4})/;
const APPLIED_DATE_PATTERN = /application was submitted on ([A-Za-z]+ \d{1,2}, \d{4})/;

/** Decoupled from status classification so a status can be correctly
 *  identified even when — as the one real Ashby message sampled so far —
 *  no explicit date is present. */
function extractDateText(text: string, stageLabel: string): string | null {
  const t = normalize(text);
  let m: RegExpMatchArray | null;
  if (stageLabel === "Rejected" && (m = t.match(REJECTED_DATE_PATTERN))) return m[1];
  if (stageLabel === "Interview" && (m = t.match(INTERVIEW_DATE_PATTERN))) return m[1];
  if (stageLabel === "Applied" && (m = t.match(APPLIED_DATE_PATTERN))) return m[1];
  return null;
}

/**
 * Extracts company + status + an event date from an Ashby candidate-status
 * notification (D3-05 minimum bar, revised). Returns `null` when company or
 * status is missing. The date always resolves: an explicit date in the body
 * wins when present, otherwise the message's received time is used (see
 * received-time-fallback.ts) — real Ashby mail is never missing a usable
 * date under the revised policy.
 */
export function parseAshby(msg: ParsedMessage): ParsedEmailResult | null {
  const extracted = extractCompany(msg.text);
  if (!extracted) return null;

  const stageLabel = classifyStatus(msg.text);
  if (!stageLabel) return null;

  const dateText = extractDateText(msg.text, stageLabel);
  const occurredAt = resolveOccurredAt(dateText, msg.date);

  const candidate = {
    company: extracted.company,
    roleTitle:
      extracted.roleTitle && extracted.roleTitle.length > 0 ? extracted.roleTitle : undefined,
    stageLabel,
    occurredAt,
    sourceMessageId: msg.messageId,
    sender: msg.from,
    subject: msg.subject,
  };

  const result = parsedEmailResult.safeParse(candidate);
  return result.success ? result.data : null;
}
