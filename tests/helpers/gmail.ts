import type {
  GmailClient,
  GmailHistoryListResult,
  GmailLabel,
} from "@/gmail/types";

export interface FakeGmailFixtures {
  labels?: GmailLabel[];
  /**
   * Full (unpaginated) id list per query, keyed by the exact `q` string when
   * present, otherwise by `label:<comma-joined labelIds>`. `listMessages`
   * slices this list into pages of `pageSize`, encoding the offset as
   * `pageToken` — mirrors the real client's opaque-token contract closely
   * enough for pagination tests without depending on a specific encoding.
   */
  messagesByQuery?: Record<string, string[]>;
  /** message id -> base64url-encoded raw RFC 822 message. */
  rawById?: Record<string, string>;
  /** Page size used to slice `messagesByQuery` results. Defaults to 2 so a
   *  3+ id fixture list exercises multi-page pagination without extra setup. */
  pageSize?: number;
  /**
   * Full ordered list of `listHistory` pages for a given `startHistoryId`.
   * The fake slices this array by an offset `pageToken` exactly like
   * `messagesByQuery` does — each entry IS one page's full response (not a
   * further-sliceable id list), so fixtures control `nextPageToken`
   * indirectly via array length/offset.
   */
  historyByStartId?: Record<string, GmailHistoryListResult[]>;
  /** Value returned by `getProfileHistoryId`. */
  profileHistoryId?: string;
  /**
   * When set, the fake's `listHistory` rejects with this value instead of
   * paging through `historyByStartId` — checked FIRST. 04-02 supplies a real
   * `Common.GaxiosError` instance here (not a duck-typed plain object) so
   * the domain code's `instanceof` guard is genuinely exercised.
   */
  rejectListHistory?: unknown;
}

function keyFor(params: { q?: string; labelIds?: string[] }): string {
  if (params.q) return params.q;
  if (params.labelIds && params.labelIds.length > 0) {
    return `label:${params.labelIds.join(",")}`;
  }
  return "";
}

/**
 * Injectable fake `GmailClient` (RESEARCH Validation Architecture) — every
 * Gmail-pipeline unit test substitutes this instead of calling `googleapis`.
 * No live network call ever happens in a unit test.
 */
export function makeFakeGmailClient(fixtures: FakeGmailFixtures = {}): GmailClient {
  const {
    labels = [],
    messagesByQuery = {},
    rawById = {},
    pageSize = 2,
    historyByStartId = {},
    profileHistoryId,
    rejectListHistory,
  } = fixtures;

  return {
    async listMessages(params) {
      const allIds = messagesByQuery[keyFor(params)] ?? [];
      const offset = params.pageToken ? Number(params.pageToken) : 0;
      const pageIds = allIds.slice(offset, offset + pageSize);
      const nextOffset = offset + pageSize;
      const nextPageToken = nextOffset < allIds.length ? String(nextOffset) : undefined;
      return { ids: pageIds, nextPageToken };
    },
    async getMessageRaw(id) {
      const raw = rawById[id];
      if (raw === undefined) {
        throw new Error(`makeFakeGmailClient: no raw fixture for message id "${id}"`);
      }
      return raw;
    },
    async listLabels() {
      return labels;
    },
    async listHistory({ startHistoryId, pageToken }) {
      if (rejectListHistory !== undefined) {
        throw rejectListHistory;
      }
      const pages = historyByStartId[startHistoryId] ?? [];
      const offset = pageToken ? Number(pageToken) : 0;
      const page = pages[offset];
      if (!page) {
        return { history: [] };
      }
      const nextOffset = offset + 1;
      const nextPageToken = nextOffset < pages.length ? String(nextOffset) : undefined;
      return { ...page, nextPageToken };
    },
    async getProfileHistoryId() {
      return profileHistoryId;
    },
  };
}
