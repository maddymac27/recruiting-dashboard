import { describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/db";
import {
  insertReviewQueueEntry,
  insertReviewQueueEntryTx,
  listPendingReviewItems,
  listResolvedReviewItems,
  resolveReviewItem,
} from "@/domain/review-queue";

describe("review-queue", () => {
  it("inserts a review item and lists it as pending, newest first", () => {
    const { db, close } = createTestDb();
    try {
      insertReviewQueueEntry(db, {
        type: "low_confidence_match",
        sourceMessageId: "msg-1",
        confidence: 0.4,
      });
      insertReviewQueueEntry(db, {
        type: "unmatched_confirm_create",
        sourceMessageId: "msg-2",
      });

      const pending = listPendingReviewItems(db);

      expect(pending).toHaveLength(2);
      // newest-first: msg-2 inserted after msg-1
      expect(pending[0].sourceMessageId).toBe("msg-2");
      expect(pending[1].sourceMessageId).toBe("msg-1");
      expect(pending.every((item) => item.status === "pending")).toBe(true);
    } finally {
      close();
    }
  });

  it("inserts each of the three review types", () => {
    const { db, close } = createTestDb();
    try {
      insertReviewQueueEntry(db, {
        type: "low_confidence_match",
        sourceMessageId: "msg-low-conf",
        confidence: 0.5,
      });
      insertReviewQueueEntry(db, {
        type: "unmatched_confirm_create",
        sourceMessageId: "msg-unmatched",
      });
      insertReviewQueueEntry(db, {
        type: "label_mail",
        sourceMessageId: "msg-label",
      });

      const pending = listPendingReviewItems(db);
      const types = pending.map((item) => item.type).sort();

      expect(types).toEqual(
        ["label_mail", "low_confidence_match", "unmatched_confirm_create"].sort(),
      );
    } finally {
      close();
    }
  });

  it("resolving a review item transitions status and moves it out of pending — never deletes the row", () => {
    const { db, close } = createTestDb();
    try {
      const id = insertReviewQueueEntry(db, {
        type: "low_confidence_match",
        sourceMessageId: "msg-3",
        confidence: 0.6,
      });

      resolveReviewItem(db, id, "confirmed");

      const pending = listPendingReviewItems(db);
      const resolved = listResolvedReviewItems(db);

      expect(pending).toHaveLength(0);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].id).toBe(id);
      expect(resolved[0].status).toBe("confirmed");
      expect(resolved[0].resolvedAt).not.toBeNull();
    } finally {
      close();
    }
  });

  it("insertReviewQueueEntryTx is composable inside a caller-owned transaction", () => {
    const { db, close } = createTestDb();
    try {
      const id = db.transaction((tx) =>
        insertReviewQueueEntryTx(tx, {
          type: "label_mail",
          sourceMessageId: "msg-tx",
        }),
      );

      const pending = listPendingReviewItems(db);
      expect(pending.map((item) => item.id)).toContain(id);
    } finally {
      close();
    }
  });
});
