import { parsedEmailResult, type ParsedEmailResult } from "@/db/validation";

import type { ParsedMessage } from "../types";
import { resolveOccurredAt } from "./received-time-fallback";

// ---------------------------------------------------------------------------
// D3-02 FOLLOW-UP (post 03-06 live-sync smoke test): the original regexes
// here were authored against SYNTHETIC fixtures and matched ZERO of the 8
// real SmartRecruiters dead-letter rows in this user's inbox. Rewritten
// against real templates pulled directly from `data/real.sqlite`'s
// dead_letter table (structural shapes only — real company names are
// redacted in the test fixtures). Real SmartRecruiters mail uses "job at
// <Company>" in the body (not "position at <Company>" as the synthetic
// fixtures assumed), and several real shapes omit the company from the body
// entirely — company extraction therefore tries several patterns in
// priority order, falling back to the subject line or sender display name.
//
// DATE POLICY (D3-05, REVISED): none of the real SmartRecruiters
// application-status templates in this inbox embed an explicit calendar
// date in the body — see received-time-fallback.ts for the full rationale.
// `parseSmartRecruiters` now prefers an explicit date when one is present
// (the regexes below) and falls back to the message's received time
// otherwise, via `resolveOccurredAt`.
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
export function extractCompany(
  text: string,
  subject: string,
  sender: string,
): ExtractedCompany | null {
  const t = normalize(text);
  const s = normalize(subject);

  let m: RegExpMatchArray | null;

  // "Thank you for your interest in the <Role> job at <Company>!" / "..., we
  // look forward to reviewing" shapes — real SmartRecruiters mail says "job
  // at", not "position at".
  if ((m = t.match(/interest in the (.+?) job at ([^.!]+)[.!]/))) {
    return { company: m[2].trim(), roleTitle: m[1].trim() };
  }
  // Subject: "<Company> - Thanks for Your Application!"
  if ((m = s.match(/^([A-Za-z0-9&.,'\- ]+?) - /))) {
    return { company: m[1].trim() };
  }
  // Subject: "Thank you for your interest in <Company>"
  if ((m = s.match(/interest in ([A-Za-z0-9&.,'\- ]+)$/))) {
    return { company: m[1].trim() };
  }
  // Subject: "<Company> has received your application"
  if ((m = s.match(/^([A-Za-z0-9&.,'\- ]+?) has received your application/))) {
    return { company: m[1].trim() };
  }
  // Sender display name: "<Person> from <Company>"
  if ((m = sender.match(/from ([A-Za-z0-9&.,'\- ]+)"/))) {
    return { company: m[1].trim() };
  }
  // Sender display name: "<Company>" <notification@smartrecruiters.com> —
  // excludes the generic "SmartRecruiters" sender used for OTP/system mail.
  if (
    (m = sender.match(/"([A-Za-z0-9&.,'\- ]+)" <notification/)) &&
    m[1] !== "SmartRecruiters"
  ) {
    return { company: m[1].trim() };
  }

  return null;
}

const REJECTED_KEYWORDS =
  /decided to move ahead with other candidates|will not be moving forward|not be moving forward/i;
const INTERVIEW_KEYWORDS = /invite you to interview/i;
const APPLIED_KEYWORDS =
  /We look forward to reviewing|received your application|We will review your application/i;

/** Status classification is independent of date presence — see the module
 *  header: real SmartRecruiters mail reliably signals status in the body
 *  even when it has no explicit date at all. */
export function classifyStatus(text: string): string | null {
  const t = normalize(text);
  if (REJECTED_KEYWORDS.test(t)) return "Rejected";
  if (INTERVIEW_KEYWORDS.test(t)) return "Interview";
  if (APPLIED_KEYWORDS.test(t)) return "Applied";
  return null;
}

const REJECTED_DATE_PATTERN =
  /(?:not be moving forward|move ahead with other candidates).*?(?:finalized|decided) on ([A-Za-z]+ \d{1,2}, \d{4})/i;
const INTERVIEW_DATE_PATTERN =
  /invite you to interview.*?confirmed for ([A-Za-z]+ \d{1,2}, \d{4})/i;
const APPLIED_DATE_PATTERN = /received your application on ([A-Za-z]+ \d{1,2}, \d{4})/;

/** Decoupled from status classification so a status can be correctly
 *  identified even when — as every real SmartRecruiters message sampled so
 *  far — no explicit date is present. */
function extractDateText(text: string, stageLabel: string): string | null {
  const t = normalize(text);
  let m: RegExpMatchArray | null;
  if (stageLabel === "Rejected" && (m = t.match(REJECTED_DATE_PATTERN))) return m[1];
  if (stageLabel === "Interview" && (m = t.match(INTERVIEW_DATE_PATTERN))) return m[1];
  if (stageLabel === "Applied" && (m = t.match(APPLIED_DATE_PATTERN))) return m[1];
  return null;
}

/**
 * Extracts company + status + an event date from a SmartRecruiters
 * candidate-status notification (D3-05 minimum bar, revised). Returns
 * `null` when company or status is missing. The date always resolves: an
 * explicit date in the body wins when present, otherwise the message's
 * received time is used (see received-time-fallback.ts) — real
 * SmartRecruiters mail is never missing a usable date under the revised
 * policy.
 */
export function parseSmartRecruiters(msg: ParsedMessage): ParsedEmailResult | null {
  const extracted = extractCompany(msg.text, msg.subject, msg.from);
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
