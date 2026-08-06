import { simpleParser } from "mailparser";
import { convert } from "html-to-text";

import type { GmailClient, ParsedMessage } from "./types";

/**
 * Paginates `listMessages` via `nextPageToken` until exhausted, collecting
 * every message id. Pure over the `GmailClient` interface — no direct
 * googleapis import here, so this is fully testable against an injected
 * fake client (RESEARCH Pitfall 4: `messages.list` results are ids only).
 */
export async function listAllMessageIds(
  client: GmailClient,
  opts: { q?: string; labelIds?: string[] } = {},
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await client.listMessages({ ...opts, pageToken });
    ids.push(...res.ids);
    pageToken = res.nextPageToken;
  } while (pageToken);

  return ids;
}

/**
 * Paginates `listHistory` via `nextPageToken` until exhausted, collecting
 * every `messagesAdded[].message.id` into a deduplicated set and tracking the
 * latest non-empty historyId seen. Reads ONLY `messagesAdded` — never the
 * top-level `history[].messages` field, which Google's own docs note "may
 * duplicate messages" across change types not relevant to "new mail arrived"
 * (RESEARCH Pitfall 1). This is the substrate ING-07's cursor-expiry fallback
 * and ROADMAP criterion 3 (incremental-parity with a full sync) sit on. Pure
 * over the `GmailClient` interface — fully testable against an injected fake.
 */
export async function fetchHistoryMessageIds(
  client: GmailClient,
  startHistoryId: string,
): Promise<{ messageIds: string[]; newHistoryId: string }> {
  const messageIds = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = startHistoryId;

  do {
    const res = await client.listHistory({ startHistoryId, pageToken });
    for (const record of res.history) {
      for (const added of record.messagesAdded ?? []) {
        if (added.message?.id) messageIds.add(added.message.id);
      }
    }
    if (res.historyId) latestHistoryId = res.historyId;
    pageToken = res.nextPageToken;
  } while (pageToken);

  return { messageIds: [...messageIds], newHistoryId: latestHistoryId };
}

/**
 * Fetches one message's raw `format=raw` content and turns it into clean
 * text: base64url decode -> mailparser MIME parse -> html-to-text (when the
 * message is HTML-only, the common ATS case) or the plain-text part.
 * Message content never leaves the machine (D3-01) — this is pure local
 * computation over bytes already fetched via the injected `GmailClient`.
 */
export async function fetchParsedMessage(
  client: GmailClient,
  id: string,
): Promise<ParsedMessage> {
  const raw = await client.getMessageRaw(id);
  const decoded = Buffer.from(raw, "base64url").toString("utf-8");
  const parsed = await simpleParser(decoded);

  const text = parsed.html ? convert(parsed.html) : (parsed.text ?? "");

  return {
    messageId: id,
    from: parsed.from?.text ?? "",
    subject: parsed.subject ?? "",
    date: parsed.date ?? new Date(0),
    text,
  };
}
