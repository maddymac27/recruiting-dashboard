// Narrow interface between the Gmail read/parse pipeline (query.ts, fetch.ts,
// parsers/*) and the actual transport. Tests inject `makeFakeGmailClient`
// (tests/helpers/gmail.ts) against this interface instead of calling
// googleapis directly — src/gmail/client.ts is the only real implementation,
// and it is server-only (imports the authed googleapis gmail('v1') client).

export interface GmailLabel {
  id: string;
  name: string;
}

export interface GmailListMessagesParams {
  q?: string;
  labelIds?: string[];
  pageToken?: string;
}

export interface GmailListMessagesResult {
  ids: string[];
  nextPageToken?: string;
}

/**
 * One `users.history.list` history record. Gmail's response also carries a
 * top-level `messages` field, but Google's own docs note it "may duplicate
 * messages in this field" across change types (label-only touches included)
 * — we read ONLY `messagesAdded` (RESEARCH Pitfall 1), never the top-level
 * `messages` array, so a historyId-derived id list reflects newly-received
 * mail, not every label mutation. This is the substrate ING-07's fallback
 * and ROADMAP criterion 3 (incremental-parity) sit on.
 */
export interface GmailHistoryRecord {
  messagesAdded?: { message?: { id?: string | null } }[];
}

export interface GmailHistoryListParams {
  startHistoryId: string;
  pageToken?: string;
}

export interface GmailHistoryListResult {
  history: GmailHistoryRecord[];
  historyId?: string;
  nextPageToken?: string;
}

/**
 * Minimal Gmail surface the ingestion pipeline needs. `listMessages` returns
 * ids only (Gmail's `messages.list` never returns content — RESEARCH
 * anti-pattern) — subject/sender/body are read solely via `getMessageRaw`.
 */
export interface GmailClient {
  listMessages(params: GmailListMessagesParams): Promise<GmailListMessagesResult>;
  /** Returns the base64url-encoded raw RFC 822 message (format=raw). */
  getMessageRaw(id: string): Promise<string>;
  listLabels(): Promise<GmailLabel[]>;
  /**
   * ING-07 / criterion 3: enumerates changes since `startHistoryId`. Only
   * `messagesAdded` ids are ever read downstream (RESEARCH Pitfall 1) — no
   * message content crosses this call, only ids and the numeric historyId.
   */
  listHistory(params: GmailHistoryListParams): Promise<GmailHistoryListResult>;
  /** Seeds/refreshes the historyId cursor (RESEARCH Pattern 2) — captured
   *  AFTER a sync's work completes, never before (RESEARCH Pitfall 3). */
  getProfileHistoryId(): Promise<string | undefined>;
}

/** A message after raw MIME decode + HTML→text conversion — the shape every
 *  per-sender parser (src/gmail/parsers/*) consumes. */
export interface ParsedMessage {
  messageId: string;
  from: string;
  subject: string;
  date: Date;
  text: string;
}
