import { describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/db";
import { ingestedMessages } from "@/db/schema";
import { insertDeadLetterEntry } from "@/domain/dead-letter";
import { insertReviewQueueEntry } from "@/domain/review-queue";
import {
  finishSyncRun,
  getDeadLetterCount,
  getLatestSuccessfulSyncRun,
  getLatestSyncRun,
  getReviewCount,
  isAlreadyIngested,
  recordIngestedTx,
  startSyncRun,
} from "@/domain/sync-state";

describe("sync-state", () => {
  it("sync-run lifecycle: start (running) -> finish updates status + counts + finishedAt", () => {
    const { db, close } = createTestDb();
    try {
      const id = startSyncRun(db);

      const running = getLatestSyncRun(db);
      expect(running?.id).toBe(id);
      expect(running?.status).toBe("running");
      expect(running?.finishedAt).toBeNull();

      finishSyncRun(db, id, {
        status: "success",
        newCount: 3,
        reviewCount: 1,
        deadLetterCount: 0,
      });

      const finished = getLatestSyncRun(db);
      expect(finished?.id).toBe(id);
      expect(finished?.status).toBe("success");
      expect(finished?.newCount).toBe(3);
      expect(finished?.reviewCount).toBe(1);
      expect(finished?.deadLetterCount).toBe(0);
      expect(finished?.finishedAt).not.toBeNull();
    } finally {
      close();
    }
  });

  it("finishSyncRun records a failed run with an error message", () => {
    const { db, close } = createTestDb();
    try {
      const id = startSyncRun(db);

      finishSyncRun(db, id, {
        status: "failed",
        errorMessage: "Gmail API quota exceeded",
      });

      const finished = getLatestSyncRun(db);
      expect(finished?.status).toBe("failed");
      expect(finished?.errorMessage).toBe("Gmail API quota exceeded");
      expect(finished?.newCount).toBe(0);
    } finally {
      close();
    }
  });

  it("getLatestSyncRun returns the newest run", () => {
    const { db, close } = createTestDb();
    try {
      const firstId = startSyncRun(db);
      finishSyncRun(db, firstId, { status: "success" });

      const secondId = startSyncRun(db);

      const latest = getLatestSyncRun(db);
      expect(latest?.id).toBe(secondId);
      expect(latest?.status).toBe("running");
    } finally {
      close();
    }
  });

  it("getReviewCount / getDeadLetterCount reflect only pending rows", () => {
    const { db, close } = createTestDb();
    try {
      expect(getReviewCount(db)).toBe(0);
      expect(getDeadLetterCount(db)).toBe(0);

      insertReviewQueueEntry(db, {
        type: "low_confidence_match",
        sourceMessageId: "review-1",
        confidence: 0.5,
      });
      insertReviewQueueEntry(db, {
        type: "label_mail",
        sourceMessageId: "review-2",
      });
      insertDeadLetterEntry(db, {
        type: "unparseable",
        sourceMessageId: "dl-1",
        rawPayload: "raw",
      });

      expect(getReviewCount(db)).toBe(2);
      expect(getDeadLetterCount(db)).toBe(1);
    } finally {
      close();
    }
  });

  it("finishSyncRun persists historyId + usedFallback (04-02, D4-04/D4-05)", () => {
    const { db, close } = createTestDb();
    try {
      const id = startSyncRun(db);

      finishSyncRun(db, id, {
        status: "success",
        historyId: "cursor-abc",
        usedFallback: true,
      });

      const finished = getLatestSyncRun(db);
      expect(finished?.historyId).toBe("cursor-abc");
      expect(finished?.usedFallback).toBe(true);
    } finally {
      close();
    }
  });

  it("getLatestSuccessfulSyncRun returns the most recent status=success row, ignoring a LATER failed run (04-02)", () => {
    const { db, close } = createTestDb();
    try {
      const successId = startSyncRun(db);
      finishSyncRun(db, successId, {
        status: "success",
        historyId: "cursor-good",
        usedFallback: false,
      });

      const failedId = startSyncRun(db);
      finishSyncRun(db, failedId, {
        status: "failed",
        errorMessage: "transient network error",
      });

      // getLatestSyncRun would return the failed run (most recent overall) —
      // getLatestSuccessfulSyncRun must skip it and return the last SUCCESS.
      expect(getLatestSyncRun(db)?.id).toBe(failedId);

      const latestSuccess = getLatestSuccessfulSyncRun(db);
      expect(latestSuccess?.id).toBe(successId);
      expect(latestSuccess?.historyId).toBe("cursor-good");
      expect(latestSuccess?.status).toBe("success");
    } finally {
      close();
    }
  });

  it("getLatestSuccessfulSyncRun returns undefined when no run has ever succeeded", () => {
    const { db, close } = createTestDb();
    try {
      const id = startSyncRun(db);
      finishSyncRun(db, id, { status: "failed", errorMessage: "cold start failure" });

      expect(getLatestSuccessfulSyncRun(db)).toBeUndefined();
    } finally {
      close();
    }
  });

  it("recordIngestedTx then isAlreadyIngested returns true; a duplicate record is a no-op", () => {
    const { db, close } = createTestDb();
    try {
      expect(isAlreadyIngested(db, "msg-1")).toBe(false);

      db.transaction((tx) => recordIngestedTx(tx, "msg-1", "transition"));

      expect(isAlreadyIngested(db, "msg-1")).toBe(true);

      // Duplicate record for the same message id must not throw and must
      // not create a second row (DATA-06 / D3-06, T-03-15).
      expect(() =>
        db.transaction((tx) => recordIngestedTx(tx, "msg-1", "review")),
      ).not.toThrow();

      const rows = db.select().from(ingestedMessages).all();

      expect(rows.filter((r) => r.messageId === "msg-1")).toHaveLength(1);
    } finally {
      close();
    }
  });
});
