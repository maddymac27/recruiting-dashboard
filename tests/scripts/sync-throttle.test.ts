import { describe, expect, it } from "vitest";
import { AT_LOGON_THROTTLE_MS, shouldThrottle } from "../../scripts/sync";

// Pure throttle predicate (D4-02, D4-A1) — no DB, no I/O. Pins the exact
// 4-hour window so a later accidental change to the constant is caught.
// scripts/sync.ts does not exist yet at this commit — this test is RED.
describe("scripts/sync — shouldThrottle (D4-02, D4-A1)", () => {
  const now = new Date(1_800_000_000_000);

  it("pins the at-logon throttle window to 4 hours (D4-A1)", () => {
    expect(AT_LOGON_THROTTLE_MS).toBe(4 * 60 * 60 * 1000);
  });

  it("throttles when the last success finished within the window", () => {
    const lastSuccess = {
      finishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2h ago
    };
    expect(shouldThrottle(lastSuccess, now)).toBe(true);
  });

  it("does not throttle when the last success finished just outside the window", () => {
    const lastSuccess = {
      finishedAt: new Date(now.getTime() - (AT_LOGON_THROTTLE_MS + 1)), // just over 4h ago
    };
    expect(shouldThrottle(lastSuccess, now)).toBe(false);
  });

  it("does not throttle when there is no prior successful sync", () => {
    expect(shouldThrottle(undefined, now)).toBe(false);
  });

  it("does not throttle when the prior success row has a null finishedAt", () => {
    expect(shouldThrottle({ finishedAt: null }, now)).toBe(false);
  });
});
