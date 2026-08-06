import { parsedEmailResult, type ParsedEmailResult } from "@/db/validation";

import type { ParsedMessage } from "../types";
import { resolveOccurredAt } from "./received-time-fallback";

// ---------------------------------------------------------------------------
// D3-02 FOLLOW-UP (post 03-06 live-sync smoke test): the original regexes
// here were authored against SYNTHETIC fixtures and matched ZERO of the 24
// real Workday dead-letter rows in this user's inbox. Rewritten against real
// templates pulled directly from `data/real.sqlite`'s dead_letter table
// (structural shapes only — real company names are redacted in the test
// fixtures). Workday is multi-tenant, and unlike the synthetic assumption,
// company name shows up in a different place per tenant template — the
// opening sentence, the subject line, or the sender display name — never
// consistently in one spot. Company extraction therefore tries several
// patterns in priority order instead of a single regex.
//
// DATE POLICY (D3-05, REVISED): none of the real Workday application-status
// templates in this inbox embed an explicit calendar date in the body — see
// received-time-fallback.ts for the full rationale. `parseWorkday` now
// prefers an explicit date when one is present (the regexes below) and
// falls back to the message's received time otherwise, via
// `resolveOccurredAt`.
// ---------------------------------------------------------------------------

/**
 * Real Workday mail is word-wrapped by the html-to-text conversion at a
 * fixed column width, so a literal multi-word phrase like "no longer hiring
 * for this role" can have a newline in the middle of it. Collapsing every
 * whitespace run to a single space before running any keyword/phrase regex
 * makes matching robust to that wrapping.
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ");
}

export interface ExtractedCompany {
  company: string;
  roleTitle?: string;
}

/**
 * Tried in priority order — first match wins. There is no single reliable
 * company location across Workday tenants, so this walks several real
 * observed shapes: the opening "interest in the X position at Y." sentence,
 * an "employment opportunities at Y" sentence, a "Thanks for your interest
 * in Y." opening line, several subject-line
 * shapes, and finally the sender's display name (e.g. "Y People Team").
 */
export function extractCompany(
  text: string,
  subject: string,
  sender: string,
): ExtractedCompany | null {
  const t = normalize(text);
  const s = normalize(subject);

  let m: RegExpMatchArray | null;

  // "Thank you for your interest in the <Role> position at <Company>."
  if ((m = t.match(/interest in the (.+?) position at ([^.]+)\./))) {
    return { company: m[2].trim(), roleTitle: m[1].trim() };
  }
  // "Thank you for your time and interest in employment opportunities at <Company>."
  if ((m = t.match(/interest in employment opportunities at ([^.]+)\./))) {
    return { company: m[1].trim() };
  }
  // "Thanks for your interest in <Company>. " (a real rejection opening line)
  if ((m = t.match(/Thanks? for your interest in ([^.]+)\. /))) {
    return { company: m[1].trim() };
  }
  // Subject: "... Thanks for your interest in career opportunities at <Company>"
  if ((m = s.match(/career opportunit(?:y|ies) at ([A-Za-z0-9&.,'\- ]+?)!?$/))) {
    return { company: m[1].trim() };
  }
  // Subject: "Regarding your <Company> Application"
  if ((m = s.match(/Regarding your ([A-Za-z0-9&.,'\- ]+?) Application/i))) {
    return { company: m[1].trim() };
  }
  // Subject: "<Company> - Application Update"
  if ((m = s.match(/^([A-Za-z0-9&][A-Za-z0-9&.,' ]*?) - Application Update$/))) {
    return { company: m[1].trim() };
  }
  // Sender display name: "<Company> People Team" / "<Company> Talent Acquisition" / etc.
  if (
    (m = sender.match(
      /"([A-Za-z0-9&.,'\- ]+?) (?:People Team|Talent Acquisition|Hiring Team|Recruiting)"/,
    ))
  ) {
    return { company: m[1].trim() };
  }

  return null;
}

const REJECTED_KEYWORDS =
  /decided not to move forward|decided to move forward with other candidates|not selected at this time|no longer hiring for this role/;
const INTERVIEW_KEYWORDS = /invite you to (?:an )?interview/;
const APPLIED_KEYWORDS =
  /received your application|thank you so much for applying|will be taken into careful consideration/i;

/** Status classification is independent of date presence — real Workday
 *  rejection/confirmation mail reliably signals status in the body even
 *  when (as observed) it has no explicit date at all. */
export function classifyStatus(text: string): string | null {
  const t = normalize(text);
  if (REJECTED_KEYWORDS.test(t)) return "Rejected";
  if (INTERVIEW_KEYWORDS.test(t)) return "Interview";
  if (APPLIED_KEYWORDS.test(t)) return "Applied";
  return null;
}

// Derived from REJECTED_KEYWORDS.source rather than a single literal phrase
// — real Workday rejection mail uses several different rejection phrasings
// ("decided not to move forward" vs. "decided to move forward with other
// candidates" vs. "not selected at this time"), so the date lookup must
// recognize the same set the status classifier does.
const REJECTED_DATE_PATTERN = new RegExp(
  `(?:${REJECTED_KEYWORDS.source}).*?(?:on|as of) ([A-Za-z]+ \\d{1,2}, \\d{4})`,
);
const INTERVIEW_DATE_PATTERN =
  /invite you to (?:an )?interview.*?scheduled for ([A-Za-z]+ \d{1,2}, \d{4})/;
const APPLIED_DATE_PATTERN = /received your application on ([A-Za-z]+ \d{1,2}, \d{4})/;

/** Decoupled from status classification (unlike the pre-fix version) so a
 *  status can be correctly identified even when — as every real Workday
 *  message sampled so far — no explicit date is present. */
function extractDateText(text: string, stageLabel: string): string | null {
  const t = normalize(text);
  let m: RegExpMatchArray | null;
  if (stageLabel === "Rejected" && (m = t.match(REJECTED_DATE_PATTERN))) return m[1];
  if (stageLabel === "Interview" && (m = t.match(INTERVIEW_DATE_PATTERN))) return m[1];
  if (stageLabel === "Applied" && (m = t.match(APPLIED_DATE_PATTERN))) return m[1];
  return null;
}

/**
 * Extracts company + status + an event date from a Workday candidate-status
 * notification (D3-05 minimum bar, revised). Returns `null` when company or
 * status is missing. The date always resolves: an explicit date in the body
 * wins when present, otherwise the message's received time is used (see
 * received-time-fallback.ts) — real Workday mail is never missing a usable
 * date under the revised policy.
 */
export function parseWorkday(msg: ParsedMessage): ParsedEmailResult | null {
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
