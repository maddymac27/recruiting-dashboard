import { describe, expect, it } from "vitest";

import {
  fetchHistoryMessageIds,
  fetchParsedMessage,
  listAllMessageIds,
} from "@/gmail/fetch";
import { makeFakeGmailClient } from "../helpers/gmail";

function encodeRawMessage(raw: string): string {
  return Buffer.from(raw, "utf-8").toString("base64url");
}

const SYNTHETIC_RAW_EMAIL = [
  'From: "Visa" <visa@myworkday.com>',
  "Subject: Application Update: Senior PM",
  "Date: Wed, 15 Jul 2026 10:00:00 -0700",
  'Content-Type: text/plain; charset="utf-8"',
  "",
  "Thank you for your interest in the Senior PM position at Visa.",
  "We have received your application on July 15, 2026.",
  "",
].join("\r\n");

describe("listAllMessageIds", () => {
  it("paginates via nextPageToken until exhausted, collecting every id", async () => {
    const client = makeFakeGmailClient({
      messagesByQuery: {
        "from:myworkday.com": ["msg1", "msg2", "msg3", "msg4", "msg5"],
      },
      pageSize: 2,
    });

    const ids = await listAllMessageIds(client, { q: "from:myworkday.com" });

    expect(ids).toEqual(["msg1", "msg2", "msg3", "msg4", "msg5"]);
  });

  it("returns an empty array when no messages match", async () => {
    const client = makeFakeGmailClient();
    const ids = await listAllMessageIds(client, { q: "from:nobody.com" });
    expect(ids).toEqual([]);
  });
});

describe("fetchHistoryMessageIds", () => {
  it("returns every id in history[].messagesAdded[].message.id across all pages, deduplicated, plus the latest historyId (ING-07 / criterion 3)", async () => {
    const client = makeFakeGmailClient({
      historyByStartId: {
        "1000": [
          {
            history: [
              { messagesAdded: [{ message: { id: "msgA" } }, { message: { id: "msgB" } }] },
              { messagesAdded: [{ message: { id: "msgA" } }] }, // duplicate across records
            ],
            historyId: "1001",
          },
        ],
      },
    });

    const result = await fetchHistoryMessageIds(client, "1000");

    expect(new Set(result.messageIds)).toEqual(new Set(["msgA", "msgB"]));
    expect(result.messageIds).toHaveLength(2);
    expect(result.newHistoryId).toBe("1001");
  });

  it("does NOT return ids that appear only in a history record's top-level messages array, never messagesAdded (RESEARCH Pitfall 1)", async () => {
    // Deliberately simulates the top-level `messages` field Gmail returns
    // (which "may duplicate messages... use the specific change-type fields
    // instead" per Google's own docs) — cast past GmailHistoryRecord's
    // narrow shape since the fixture intentionally includes a field the
    // real transport/fetch code must never read.
    const historyWithTopLevelMessages = [
      {
        history: [
          {
            messages: [{ id: "msgOnlyInMessages" }],
            messagesAdded: [{ message: { id: "msgAdded" } }],
          },
        ],
        historyId: "2001",
      },
    ] as unknown as import("@/gmail/types").GmailHistoryListResult[];

    const client = makeFakeGmailClient({
      historyByStartId: { "2000": historyWithTopLevelMessages },
    });

    const result = await fetchHistoryMessageIds(client, "2000");

    expect(result.messageIds).toEqual(["msgAdded"]);
    expect(result.messageIds).not.toContain("msgOnlyInMessages");
  });

  it("returns the union of messagesAdded ids across a multi-page (nextPageToken) response", async () => {
    const client = makeFakeGmailClient({
      historyByStartId: {
        "3000": [
          {
            history: [{ messagesAdded: [{ message: { id: "msgPage1" } }] }],
            historyId: "3001",
          },
          {
            history: [{ messagesAdded: [{ message: { id: "msgPage2" } }] }],
            historyId: "3002",
          },
        ],
      },
    });

    const result = await fetchHistoryMessageIds(client, "3000");

    expect(new Set(result.messageIds)).toEqual(new Set(["msgPage1", "msgPage2"]));
    expect(result.newHistoryId).toBe("3002");
  });

  it("returns [] and echoes back startHistoryId as newHistoryId when there is no history (empty gap)", async () => {
    const client = makeFakeGmailClient({
      historyByStartId: {
        "4000": [{ history: [] }],
      },
    });

    const result = await fetchHistoryMessageIds(client, "4000");

    expect(result.messageIds).toEqual([]);
    expect(result.newHistoryId).toBe("4000");
  });
});

describe("fetchParsedMessage", () => {
  it("decodes base64url raw -> MIME parse -> ParsedMessage with expected from/subject/date/text", async () => {
    const client = makeFakeGmailClient({
      rawById: { msg1: encodeRawMessage(SYNTHETIC_RAW_EMAIL) },
    });

    const parsed = await fetchParsedMessage(client, "msg1");

    expect(parsed.messageId).toBe("msg1");
    expect(parsed.from).toContain("visa@myworkday.com");
    expect(parsed.subject).toBe("Application Update: Senior PM");
    expect(parsed.date).toBeInstanceOf(Date);
    expect(parsed.text).toContain("received your application on July 15, 2026");
  });
});
