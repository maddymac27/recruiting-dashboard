---
phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
plan: 05
subsystem: database
tags: [drizzle, sqlite, zod, domain-layer, fail-loud, idempotency]

# Dependency graph
requires:
  - phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
    provides: "03-01 schema — extended review_queue/dead_letter columns, new sync_runs + ingested_messages tables, newReviewQueueEntryInput/newDeadLetterEntryInput/newSyncRunInput zod schemas"
provides:
  - "review-queue.ts: insertReviewQueueEntryTx/insertReviewQueueEntry, listPendingReviewItems, listResolvedReviewItems, resolveReviewItem"
  - "dead-letter.ts: insertDeadLetterEntryTx/insertDeadLetterEntry, listPendingDeadLetter, listResolvedDeadLetter, resolveDeadLetterByMessageIdTx"
  - "sync-state.ts: startSyncRun, finishSyncRun, getLatestSyncRun, getReviewCount, getDeadLetterCount, isAlreadyIngested, recordIngestedTx"
affects: [03-06, 03-08, 03-09, 03-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tx-vs-wrapper discipline: every *Tx function (insertReviewQueueEntryTx, insertDeadLetterEntryTx, resolveDeadLetterByMessageIdTx, recordIngestedTx) opens NO transaction of its own, mirroring appendStatusEventTx — lets the 03-06 orchestrator compose one transaction per message"
    - "Status-only resolution: review_queue/dead_letter rows only ever transition pending -> resolved; no delete/hard-remove function exists on either table, preserving the fail-loud audit trail"
    - "createdAt/startedAt desc + id desc tiebreak on all newest-first list/latest queries, since the schema's unixepoch() default has one-second resolution and multiple rows can share a timestamp within a test or a fast sync"
    - "Dedup via onConflictDoNothing on a unique natural key (message_id), reused from events.ts's sourceMessageId pattern, for idempotent re-ingestion"

key-files:
  created:
    - src/domain/review-queue.ts
    - src/domain/dead-letter.ts
    - src/domain/sync-state.ts
    - tests/domain/review-queue.test.ts
    - tests/domain/dead-letter.test.ts
    - tests/domain/sync-state.test.ts
  modified: []

key-decisions:
  - "Added a createdAt/startedAt desc, id desc secondary sort to every newest-first list/latest query (listPendingReviewItems, listResolvedReviewItems, listPendingDeadLetter, listResolvedDeadLetter, getLatestSyncRun) — not specified in the plan text, but required for deterministic ordering once same-second inserts were exercised in tests; mirrors recomputeCurrentStage's existing occurredAt+id tiebreak convention in the codebase"
  - "finishSyncRun's input type narrows newSyncRunInput's optional `status: SyncRunStatus` down to a required `status: 'success' | 'failed'` (Omit + intersection) while still validating the full object through the shared newSyncRunInput zod schema, so a caller cannot finish a run back into 'running' by omission"
  - "resolveReviewItem/resolveDeadLetterByMessageIdTx scope their UPDATE where-clause to status = 'pending' in addition to the id/message-id match, so calling resolve twice on an already-resolved row is a safe no-op rather than silently re-stamping resolvedAt"

patterns-established:
  - "Same-timestamp tiebreak: any newest-first ordering query on a table using the schema's unixepoch() default timestamp must add `desc(table.id)` as a secondary sort key"

requirements-completed: [REL-01, REL-02, REL-03]

coverage:
  - id: D1
    description: "review_queue CRUD: insert (any of the 3 types), list pending vs resolved newest-first, resolve transitions status without deleting the row"
    requirement: "REL-01"
    verification:
      - kind: unit
        ref: "tests/domain/review-queue.test.ts (4 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "dead_letter CRUD: insert (known_sender_failed | unparseable), list pending vs resolved, resolveDeadLetterByMessageIdTx flips a pending row for a re-parsed message id to resolved without deleting it"
    requirement: "REL-02"
    verification:
      - kind: unit
        ref: "tests/domain/dead-letter.test.ts (5 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Sync-run lifecycle (start running -> finish success|failed with counts) and getLatestSyncRun for the health indicator"
    requirement: "REL-03"
    verification:
      - kind: unit
        ref: "tests/domain/sync-state.test.ts > sync-run lifecycle / failed run / newest run (3 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "getReviewCount/getDeadLetterCount return pending-only counts for the sidebar badges"
    requirement: "REL-01"
    verification:
      - kind: unit
        ref: "tests/domain/sync-state.test.ts > getReviewCount / getDeadLetterCount reflect only pending rows"
        status: pass
    human_judgment: false
  - id: D5
    description: "ingested_messages dedup ledger: isAlreadyIngested + tx-scoped recordIngestedTx, idempotent on duplicate message id (DATA-06 / D3-06)"
    requirement: "REL-03"
    verification:
      - kind: unit
        ref: "tests/domain/sync-state.test.ts > recordIngestedTx then isAlreadyIngested returns true; a duplicate record is a no-op"
        status: pass
    human_judgment: false
  - id: D6
    description: "No delete/hard-remove function exists on review_queue or dead_letter (fail-loud audit trail, REL-02)"
    verification:
      - kind: other
        ref: "grep -Ec \"\\.delete\\(\" src/domain/review-queue.ts src/domain/dead-letter.ts -> 0 for both files"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-30
status: complete
---

# Phase 3 Plan 05: Fail-Loud Routing Domain Layer Summary

**review-queue.ts / dead-letter.ts / sync-state.ts domain CRUD over the 03-01 schema — tx-composable inserts, status-only resolution (no delete), sync-run lifecycle + pending counts, and an idempotent ingested_messages dedup ledger.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-30T15:14:00-05:00 (approx)
- **Completed:** 2026-07-30T15:17:25-05:00
- **Tasks:** 2/2
- **Files modified:** 6 (all new — 3 domain files, 3 test files)

## Accomplishments
- `src/domain/review-queue.ts`: `insertReviewQueueEntryTx`/`insertReviewQueueEntry` (validated via `newReviewQueueEntryInput`), `listPendingReviewItems`/`listResolvedReviewItems` (newest-first), `resolveReviewItem` (status-only transition, no delete)
- `src/domain/dead-letter.ts`: `insertDeadLetterEntryTx`/`insertDeadLetterEntry` (validated via `newDeadLetterEntryInput`), `listPendingDeadLetter`/`listResolvedDeadLetter`, `resolveDeadLetterByMessageIdTx` (flips a pending row for a message id to resolved on a successful re-parse)
- `src/domain/sync-state.ts`: `startSyncRun`/`finishSyncRun`/`getLatestSyncRun` (sync-run lifecycle for the health indicator), `getReviewCount`/`getDeadLetterCount` (pending-only counts for sidebar badges), `isAlreadyIngested`/`recordIngestedTx` (idempotent `ingested_messages` dedup ledger via `onConflictDoNothing`)
- 18 tests across `tests/domain/{review-queue,dead-letter,sync-state}.test.ts`, all proving the fail-loud contract: insert -> pending list -> resolve -> resolved list (no row ever disappears), and duplicate `recordIngestedTx` calls are no-ops
- Full test suite (18 files / 72 tests) and `npx tsc --noEmit` both pass clean after these additions

## Task Commits

Each task was committed atomically:

1. **Task 1: review-queue.ts + dead-letter.ts CRUD (+ Tx variants) + tests** - `c1f4e86` (feat)
2. **Task 2: sync-state.ts — sync-run lifecycle, counts, and dedup ledger** - `50f6ad2` (feat)

**Plan metadata:** (this commit, following SUMMARY write)

## Files Created/Modified
- `src/domain/review-queue.ts` - Review-queue CRUD: tx-composable insert, pending/resolved list, status-only resolve
- `src/domain/dead-letter.ts` - Dead-letter CRUD: tx-composable insert, pending/resolved list, message-id-scoped resolve
- `src/domain/sync-state.ts` - Sync-run lifecycle, pending counts, ingested-messages dedup ledger
- `tests/domain/review-queue.test.ts` - 4 tests: insert+list ordering, all 3 types, resolve transitions, Tx composability
- `tests/domain/dead-letter.test.ts` - 5 tests: insert+list ordering, both types, resolve-by-message-id, no-op on unknown id, Tx composability
- `tests/domain/sync-state.test.ts` - 5 tests: run lifecycle, failed run, newest-run selection, pending counts, dedup ledger idempotency

## Decisions Made
- Added a `desc(id)` secondary sort key to every newest-first list/latest query (`listPendingReviewItems`, `listResolvedReviewItems`, `listPendingDeadLetter`, `listResolvedDeadLetter`, `getLatestSyncRun`) — the schema's `unixepoch()` timestamp default has one-second resolution, so two inserts within the same test (or a fast real sync) can share a `createdAt`/`startedAt` value; ordering by timestamp alone was non-deterministic. This mirrors the existing `recomputeCurrentStage` (`src/domain/projections.ts`) occurredAt+id tiebreak convention already established in the codebase.
- `finishSyncRun`'s input type narrows `newSyncRunInput`'s optional `status` field to a required `'success' | 'failed'` union (via `Omit<NewSyncRunInput, "status"> & { status: ... }`), while still parsing the full object through the shared `newSyncRunInput` zod schema — prevents a caller from accidentally leaving a run in `'running'` state by omitting `status`.
- Scoped `resolveReviewItem`'s and `resolveDeadLetterByMessageIdTx`'s UPDATE where-clause to `status = 'pending'` in addition to the id/message-id match, so re-calling resolve on an already-resolved row is a safe no-op instead of silently re-stamping `resolvedAt`.

## Deviations from Plan

None beyond the same-timestamp tiebreak fix documented above (Rule 1 — bug: non-deterministic ordering under same-second inserts, fixed inline during Task 1/2 test-driven verification, before either task's commit).

### Auto-fixed Issues

**1. [Rule 1 - Bug] Non-deterministic newest-first ordering on same-second inserts**
- **Found during:** Task 1 (review-queue/dead-letter list tests) and Task 2 (sync-run latest test)
- **Issue:** `listPendingReviewItems`/`listResolvedReviewItems`/`listPendingDeadLetter`/`listResolvedDeadLetter`/`getLatestSyncRun` ordered by `createdAt`/`startedAt` desc alone. Since the schema's `defaultTimestampNow` (`unixepoch()`) has one-second resolution, two rows inserted within the same second (as happens reliably in fast in-memory tests, and could happen in a real fast sync) tied on the sort key, making "newest first" order-of-insertion-dependent rather than deterministic.
- **Fix:** Added `desc(table.id)` as a secondary sort key to all five queries — `id` is monotonically increasing on insert, so it's a correct newest-first tiebreak that requires no schema change.
- **Files modified:** `src/domain/review-queue.ts`, `src/domain/dead-letter.ts`, `src/domain/sync-state.ts`
- **Verification:** All 9 review-queue/dead-letter tests and all 5 sync-state tests pass; `npx tsc --noEmit` clean.
- **Committed in:** `c1f4e86` (Task 1), `50f6ad2` (Task 2) — fixed before either task's commit, so no separate fix commit was needed.

---

**Total deviations:** 1 auto-fixed (Rule 1 — ordering bug caught by the plan's own tests before commit)
**Impact on plan:** No scope creep. The fix is a query-level ordering correctness fix required for the plan's own "ordered newest-first" acceptance criterion to hold deterministically; no schema or public API surface changed from what the plan specified.

## Issues Encountered
None beyond the tiebreak fix documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The tx-composable primitives (`insertReviewQueueEntryTx`, `insertDeadLetterEntryTx`, `resolveDeadLetterByMessageIdTx`, `recordIngestedTx`) are ready for 03-06's orchestrator to compose into one transaction per message alongside `appendStatusEventTx`.
- `getReviewCount`/`getDeadLetterCount`/`getLatestSyncRun` are ready for 03-10's health/sidebar surfacing.
- `listPendingReviewItems`/`listResolvedReviewItems`/`listPendingDeadLetter`/`listResolvedDeadLetter`/`resolveReviewItem` are ready for the 03-08/03-09 queue UIs.
- No blockers. Every write path validates through its zod schema before Drizzle; no delete/hard-remove exists on either queue table (grep-verified: 0 matches in both files).

---
*Phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing*
*Completed: 2026-07-30*

## Self-Check: PASSED

All claimed files verified present on disk (src/domain/review-queue.ts, src/domain/dead-letter.ts, src/domain/sync-state.ts, tests/domain/review-queue.test.ts, tests/domain/dead-letter.test.ts, tests/domain/sync-state.test.ts, this SUMMARY.md). Both task commits (`c1f4e86`, `50f6ad2`) verified present in `git log`.
