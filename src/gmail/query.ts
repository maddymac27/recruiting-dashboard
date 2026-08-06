import type { GmailClient } from "./types";

// Confirmed by 03-03's real-inbox sampling (51 messages) — see
// 03-03-SUMMARY.md "Confirmed Ingestion Constants". This supersedes
// 03-RESEARCH.md's Handshake-first assumption: Handshake had ZERO messages
// in the sample and is deliberately excluded. Workday is multi-tenant (its
// sender local-part varies per employer — acmecorp@, globex@, initech@,
// umbrellacorp@…@myworkday.com) so it is matched on the bare domain, never a
// fixed full address (RESEARCH Pitfall 5).
export const KNOWN_SENDER_DOMAINS = [
  "myworkday.com", // Workday — dominant sender, 11/51 sampled messages
  "smartrecruiters.com", // SmartRecruiters — 5/51 sampled messages
  "ashbyhq.com", // Ashby — 1/51 sampled messages
] as const;

// Confirmed 03-03: top-level label, id "Label_11". A sibling
// "Job Search/Email Templates" sublabel exists and must NOT be treated as a
// match — the suffix check below only matches a label literally named
// "Job Search" or nested as "<Parent>/Job Search", never a child of it.
const JOB_SEARCH_LABEL_NAME = "Job Search";

function formatYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

/**
 * Builds the targeted sender-query `q` string (ING-02): OR-joins a
 * `from:<domain>` clause per domain, optionally scoped to mail received
 * after `afterDate` (incremental sync).
 */
export function buildSenderQuery(domains: readonly string[], afterDate?: Date): string {
  const clause = domains.map((domain) => `from:${domain}`).join(" OR ");
  return afterDate ? `${clause} after:${formatYYYYMMDD(afterDate)}` : clause;
}

/**
 * Resolves the "Job Search" label id (ING-03). Fails LOUD — throws rather
 * than returning null/undefined — so a mislabeled/renamed label never lets
 * the label-backfill pass silently no-op.
 */
export async function resolveJobSearchLabelId(client: GmailClient): Promise<string> {
  const labels = await client.listLabels();
  const label = labels.find(
    (candidate) =>
      candidate.name === JOB_SEARCH_LABEL_NAME ||
      candidate.name.endsWith(`/${JOB_SEARCH_LABEL_NAME}`),
  );

  if (!label) {
    throw new Error(
      `Gmail label "${JOB_SEARCH_LABEL_NAME}" not found — check the exact label name/nesting ` +
        "in the connected Gmail account. Refusing to silently skip the label-backfill pass.",
    );
  }

  return label.id;
}
