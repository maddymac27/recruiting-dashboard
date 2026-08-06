import { describe, expect, it } from "vitest";
import { isSyncStale, STALE_THRESHOLD_MS } from "@/lib/staleness";

// Pure staleness predicate (D4-03, D4-A2) — no DB, no server-only imports.
// Pins the exact 2-day threshold so a later accidental change is caught.
// src/lib/staleness.ts does not exist yet at this commit — this test is RED.
describe("isSyncStale (D4-03, D4-A2)", () => {
  const now = new Date(1_800_000_000_000);

  it("pins the staleness threshold to 2 days (D4-A2)", () => {
    expect(STALE_THRESHOLD_MS).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it("is never stale when there is no prior successful sync (null — 'never synced' is its own state)", () => {
    expect(isSyncStale(null, now)).toBe(false);
  });

  it("is not stale at exactly the threshold", () => {
    const lastSuccessAt = new Date(now.getTime() - STALE_THRESHOLD_MS);
    expect(isSyncStale(lastSuccessAt, now)).toBe(false);
  });

  it("is stale just past the threshold", () => {
    const lastSuccessAt = new Date(now.getTime() - STALE_THRESHOLD_MS - 1);
    expect(isSyncStale(lastSuccessAt, now)).toBe(true);
  });

  it("is not stale for a recent success", () => {
    const lastSuccessAt = new Date(now.getTime() - 60 * 60 * 1000); // 1h ago
    expect(isSyncStale(lastSuccessAt, now)).toBe(false);
  });
});
