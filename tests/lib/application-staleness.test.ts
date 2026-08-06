import { describe, expect, it } from "vitest";
import {
  GONE_QUIET_THRESHOLDS_DAYS,
  SAVED_NUDGE_THRESHOLD_DAYS,
  getStalenessStatus,
} from "@/lib/application-staleness";

// Pure D5-08 staleness predicate — mirrors tests/lib/staleness.test.ts's
// fixed-`now` boundary style. Pins the per-stage threshold map (D5-02) and
// the inclusive `>=` boundary so a later accidental change is caught.
// src/lib/application-staleness.ts does not exist yet at this commit — RED.
describe("getStalenessStatus (D5-01, D5-02, D5-08)", () => {
  const now = new Date(1_800_000_000_000);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  it("pins the per-stage gone-quiet thresholds and the saved-nudge threshold (D5-02)", () => {
    expect(GONE_QUIET_THRESHOLDS_DAYS).toEqual({
      Applied: 14,
      Screen: 10,
      Interview: 10,
    });
    expect(SAVED_NUDGE_THRESHOLD_DAYS).toBe(7);
  });

  it("Applied is gone-quiet at exactly 14 days (inclusive boundary)", () => {
    const lastActivityAt = new Date(now.getTime() - 14 * MS_PER_DAY);
    const status = getStalenessStatus("Applied", false, lastActivityAt, now);
    expect(status).toEqual({ kind: "gone-quiet", daysSince: 14 });
  });

  it("Applied is NOT gone-quiet at 13 days", () => {
    const lastActivityAt = new Date(now.getTime() - 13 * MS_PER_DAY);
    const status = getStalenessStatus("Applied", false, lastActivityAt, now);
    expect(status).toEqual({ kind: "none" });
  });

  it("Screen is gone-quiet at exactly 10 days", () => {
    const lastActivityAt = new Date(now.getTime() - 10 * MS_PER_DAY);
    const status = getStalenessStatus("Screen", false, lastActivityAt, now);
    expect(status).toEqual({ kind: "gone-quiet", daysSince: 10 });
  });

  it("Interview is gone-quiet at exactly 10 days", () => {
    const lastActivityAt = new Date(now.getTime() - 10 * MS_PER_DAY);
    const status = getStalenessStatus("Interview", false, lastActivityAt, now);
    expect(status).toEqual({ kind: "gone-quiet", daysSince: 10 });
  });

  it.each(["Offer", "Rejected", "Ghosted", "Withdrawn"])(
    "terminal stage %s is never flagged regardless of activity age (isTerminal short-circuits, D5-06)",
    (stageLabel) => {
      const lastActivityAt = new Date(now.getTime() - 1000 * MS_PER_DAY);
      const status = getStalenessStatus(stageLabel, true, lastActivityAt, now);
      expect(status).toEqual({ kind: "none" });
    },
  );

  it("Saved is a saved-nudge at exactly 7 days", () => {
    const lastActivityAt = new Date(now.getTime() - 7 * MS_PER_DAY);
    const status = getStalenessStatus("Saved", false, lastActivityAt, now);
    expect(status).toEqual({ kind: "saved-nudge", daysSince: 7 });
  });

  it("Saved is NOT a saved-nudge at 6 days", () => {
    const lastActivityAt = new Date(now.getTime() - 6 * MS_PER_DAY);
    const status = getStalenessStatus("Saved", false, lastActivityAt, now);
    expect(status).toEqual({ kind: "none" });
  });

  it("null lastActivityAt is never flagged", () => {
    expect(getStalenessStatus("Applied", false, null, now)).toEqual({
      kind: "none",
    });
    expect(getStalenessStatus("Saved", false, null, now)).toEqual({
      kind: "none",
    });
  });

  it("null stageLabel is never flagged", () => {
    const lastActivityAt = new Date(now.getTime() - 1000 * MS_PER_DAY);
    expect(getStalenessStatus(null, false, lastActivityAt, now)).toEqual({
      kind: "none",
    });
  });

  it("floors days-since — 14 days and 23 hours ago for Applied still reads 14 (inclusive boundary, no early rollover)", () => {
    const lastActivityAt = new Date(
      now.getTime() - (14 * MS_PER_DAY + 23 * 60 * 60 * 1000),
    );
    const status = getStalenessStatus("Applied", false, lastActivityAt, now);
    expect(status).toEqual({ kind: "gone-quiet", daysSince: 14 });
  });
});
