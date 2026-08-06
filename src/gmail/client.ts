import "server-only";

import type { gmail_v1 } from "googleapis";

import { getAuthedGmailClient } from "./oauth";
import type { GmailClient, GmailLabel } from "./types";

/**
 * Wraps a real, authenticated `googleapis` gmail('v1') instance behind the
 * narrow `GmailClient` interface — the orchestrator and every unit test
 * depend on the interface, never on `googleapis` directly (only this file
 * does). `q` is passed at the TOP LEVEL of the request object
 * (RESEARCH Pitfall 4) — nesting it differently is a known cause of a
 * `q` parameter silently being ignored by the Node client.
 */
function wrapGmailClient(gmail: gmail_v1.Gmail): GmailClient {
  return {
    async listMessages({ q, labelIds, pageToken }) {
      const res = await gmail.users.messages.list({
        userId: "me",
        q,
        labelIds,
        pageToken,
        maxResults: 500, // documented Gmail API max
      });

      const ids: string[] = [];
      for (const message of res.data.messages ?? []) {
        if (message.id) ids.push(message.id);
      }

      return { ids, nextPageToken: res.data.nextPageToken ?? undefined };
    },

    async getMessageRaw(id) {
      const res = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "raw",
      });

      if (!res.data.raw) {
        throw new Error(`Gmail message ${id} returned no raw content (format=raw).`);
      }

      return res.data.raw;
    },

    async listLabels() {
      const res = await gmail.users.labels.list({ userId: "me" });

      const labels: GmailLabel[] = [];
      for (const label of res.data.labels ?? []) {
        if (label.id && label.name) labels.push({ id: label.id, name: label.name });
      }

      return labels;
    },

    // ING-07 / criterion 3 — enumerates changes since startHistoryId. Only
    // messagesAdded is ever mapped through (RESEARCH Pitfall 1): the
    // top-level `history[].messages` field is never read here or downstream.
    // No try/catch: a GaxiosError (e.g. 404 on an expired cursor) must
    // propagate unchanged to the caller (src/domain/ingestion.ts), which owns
    // the D4-04 fallback decision.
    async listHistory({ startHistoryId, pageToken }) {
      const res = await gmail.users.history.list({
        userId: "me",
        startHistoryId,
        historyTypes: ["messageAdded"],
        pageToken,
        maxResults: 500, // documented Gmail API max
      });

      return {
        history: (res.data.history ?? []).map((h) => ({
          messagesAdded: h.messagesAdded ?? [],
        })),
        historyId: res.data.historyId ?? undefined,
        nextPageToken: res.data.nextPageToken ?? undefined,
      };
    },

    // RESEARCH Pattern 2 — seeds/refreshes the historyId cursor. Callers
    // MUST invoke this AFTER a sync's fetch/parse/write work completes, never
    // before (RESEARCH Pitfall 3), or a message arriving mid-run would be
    // missed by both the completing full-fetch and the next incremental call.
    async getProfileHistoryId() {
      const res = await gmail.users.getProfile({ userId: "me" });
      return res.data.historyId ?? undefined;
    },
  };
}

/** Server-only entry point — the ONLY caller of `getAuthedGmailClient()`
 *  outside of `oauth.ts` itself. Never import this module from client code. */
export function getGmailClient(): GmailClient {
  return wrapGmailClient(getAuthedGmailClient());
}
