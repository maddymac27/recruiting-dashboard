import { describe, expect, it } from "vitest";

import { buildSenderQuery, KNOWN_SENDER_DOMAINS } from "@/gmail/query";

describe("buildSenderQuery", () => {
  it("OR-joins a from: clause per domain, no after: suffix when no date given", () => {
    const q = buildSenderQuery(["myworkday.com", "smartrecruiters.com", "ashbyhq.com"]);
    expect(q).toBe("from:myworkday.com OR from:smartrecruiters.com OR from:ashbyhq.com");
  });

  it("appends a zero-padded after:YYYY/MM/DD suffix when afterDate is given", () => {
    const q = buildSenderQuery(["myworkday.com"], new Date(2026, 6, 1)); // July 1, 2026
    expect(q).toBe("from:myworkday.com after:2026/07/01");
  });

  it("zero-pads single-digit month/day", () => {
    const q = buildSenderQuery(["ashbyhq.com"], new Date(2026, 0, 5)); // Jan 5, 2026
    expect(q).toBe("from:ashbyhq.com after:2026/01/05");
  });

  it("KNOWN_SENDER_DOMAINS is exactly the 03-03 confirmed set — never Handshake", () => {
    expect(KNOWN_SENDER_DOMAINS).toEqual([
      "myworkday.com",
      "smartrecruiters.com",
      "ashbyhq.com",
    ]);
    expect(KNOWN_SENDER_DOMAINS).not.toContain("notifications.joinhandshake.com");
  });
});
