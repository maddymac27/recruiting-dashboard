import { describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/db";
import {
  insertDeadLetterEntry,
  insertDeadLetterEntryTx,
  listPendingDeadLetter,
  listResolvedDeadLetter,
  resolveDeadLetterByMessageIdTx,
} from "@/domain/dead-letter";

describe("dead-letter", () => {
  it("inserts a dead-letter item and lists it as pending, newest first", () => {
    const { db, close } = createTestDb();
    try {
      insertDeadLetterEntry(db, {
        type: "known_sender_failed",
        sourceMessageId: "msg-1",
        rawPayload: "raw mime 1",
        failedStage: "extract",
      });
      insertDeadLetterEntry(db, {
        type: "unparseable",
        sourceMessageId: "msg-2",
        rawPayload: "raw mime 2",
      });

      const pending = listPendingDeadLetter(db);

      expect(pending).toHaveLength(2);
      expect(pending[0].sourceMessageId).toBe("msg-2");
      expect(pending[1].sourceMessageId).toBe("msg-1");
      expect(pending.every((item) => item.status === "pending")).toBe(true);
    } finally {
      close();
    }
  });

  it("inserts both dead-letter types", () => {
    const { db, close } = createTestDb();
    try {
      insertDeadLetterEntry(db, {
        type: "known_sender_failed",
        sourceMessageId: "msg-known",
        rawPayload: "raw",
      });
      insertDeadLetterEntry(db, {
        type: "unparseable",
        sourceMessageId: "msg-unparseable",
        rawPayload: "raw",
      });

      const pending = listPendingDeadLetter(db);
      const types = pending.map((item) => item.type).sort();

      expect(types).toEqual(["known_sender_failed", "unparseable"].sort());
    } finally {
      close();
    }
  });

  it("resolveDeadLetterByMessageIdTx flips a pending row to resolved — never deletes it", () => {
    const { db, close } = createTestDb();
    try {
      const id = insertDeadLetterEntry(db, {
        type: "known_sender_failed",
        sourceMessageId: "msg-3",
        rawPayload: "raw mime 3",
        failedStage: "classify",
      });

      db.transaction((tx) => resolveDeadLetterByMessageIdTx(tx, "msg-3"));

      const pending = listPendingDeadLetter(db);
      const resolved = listResolvedDeadLetter(db);

      expect(pending).toHaveLength(0);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].id).toBe(id);
      expect(resolved[0].status).toBe("resolved");
      expect(resolved[0].resolvedAt).not.toBeNull();
    } finally {
      close();
    }
  });

  it("resolveDeadLetterByMessageIdTx is a no-op for a message id with no pending row", () => {
    const { db, close } = createTestDb();
    try {
      db.transaction((tx) =>
        resolveDeadLetterByMessageIdTx(tx, "no-such-message"),
      );

      expect(listPendingDeadLetter(db)).toHaveLength(0);
      expect(listResolvedDeadLetter(db)).toHaveLength(0);
    } finally {
      close();
    }
  });

  it("insertDeadLetterEntryTx is composable inside a caller-owned transaction", () => {
    const { db, close } = createTestDb();
    try {
      const id = db.transaction((tx) =>
        insertDeadLetterEntryTx(tx, {
          type: "unparseable",
          sourceMessageId: "msg-tx",
          rawPayload: "raw",
        }),
      );

      const pending = listPendingDeadLetter(db);
      expect(pending.map((item) => item.id)).toContain(id);
    } finally {
      close();
    }
  });
});
