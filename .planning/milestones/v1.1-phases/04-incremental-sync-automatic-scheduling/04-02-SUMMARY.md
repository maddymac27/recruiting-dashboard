---
phase: 04-incremental-sync-automatic-scheduling
plan: 02
subsystem: api
tags: [gmail, googleapis, history-api, gaxios, incremental-sync, fail-loud]

# Dependency graph
requires:
  - phase: 04-incremental-sync-automatic-scheduling (04-01)
    provides: sync_runs.history_id/used_fallback columns, fetchHistoryMessageIds transport, GmailClient.listHistory/getProfileHistoryId, extended FakeGmailFixtures (historyByStartId/profileHistoryId/rejectListHistory)
provides:
  - "runGmailSync incremental-first message-id resolution: historyId cursor tried first, 404 GaxiosError falls back to the existing lastSync-windowed full-fetch, any other error re-throws"
  - "runGmailSync return shape extended to { ...counts, newHistoryId, usedFallback }; cursor re-seeded via getProfileHistoryId() only AFTER all per-message/Pass-2/Pass-3 work completes"
  - "getLatestSuccessfulSyncRun(db) — the newest status=success sync_runs row, independent of any later failed run"
  - "finishSyncRun persists historyId/usedFallback (already zod-validated by 04-01's newSyncRunInput extension)"
  - "syncGmailAction derives both lastSync and historyId from getLatestSuccessfulSyncRun and records the refreshed cursor on success — the manual path is now structurally identical to the scheduled path 04-03 will add"
affects: [04-03 (scripts/sync.ts reuses the same runGmailSync + getLatestSuccessfulSyncRun), 04-04 (ingestion-health staleness reads sync_runs.history_id/used_fallback)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "404-only error-type narrowing via `err instanceof Common.GaxiosError && err.status === 404` — the ONLY place that decides cursor-expired-vs-real-failure; every other error re-throws unchanged"
    - "Cursor re-seed happens strictly AFTER all fetch/parse/write work in a sync run, never before (RESEARCH Pitfall 3) — prevents a mid-run message from being skipped by the next incremental call"
    - "getLatestSuccessfulSyncRun as the single read point for BOTH a fallback window and a cursor, so a failed intervening run never narrows the window nor loses the last-good cursor"

key-files:
  created:
    - .planning/phases/04-incremental-sync-automatic-scheduling/deferred-items.md
  modified:
    - src/domain/ingestion.ts
    - src/domain/sync-state.ts
    - src/app/actions.ts
    - tests/domain/ingestion.test.ts
    - tests/domain/sync-state.test.ts

key-decisions:
  - "runGmailSync's { lastSync, historyId } param is a required intersection (both non-optional), per plan/RESEARCH Code Examples — call sites always pass historyId explicitly (null on cold start), never omit it"
  - "GaxiosError test fixtures construct config/response shapes via `ConstructorParameters<typeof Common.GaxiosError>` rather than naming gaxios's non-exported GaxiosOptionsPrepared type directly, keeping the fixture typed without an internal-type import"
  - "usedFallback initialized to `historyId !== null` and flipped false on a successful fetchHistoryMessageIds call — so a cold-start call (historyId: null) is never mistakenly flagged as a fallback"

patterns-established:
  - "Every runGmailSync caller (syncGmailAction now, scripts/sync.ts in 04-03) reads historyId + lastSync from the SAME getLatestSuccessfulSyncRun call, never re-deriving the window from getLatestSyncRun (which would risk a failed run momentarily blanking the cursor)"

requirements-completed: [ING-07]

coverage:
  - id: D1
    description: "Incremental (historyId) and full-fetch (lastSync) paths produce the identical deduplicated event set for the same messages (ROADMAP criterion 3) — proven at the row level, not just aggregate counts"
    requirement: "ING-07"
    verification:
      - kind: unit
        ref: "tests/domain/ingestion.test.ts#incremental (historyId) and full-fetch (lastSync) produce the IDENTICAL deduplicated event set for the same messages (ROADMAP criterion 3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A 404 GaxiosError from listHistory falls back to the bounded lastSync full-fetch and records usedFallback:true, still ingesting the affected messages"
    requirement: "ING-07"
    verification:
      - kind: unit
        ref: "tests/domain/ingestion.test.ts#a 404 GaxiosError from listHistory falls back to the bounded lastSync full-fetch and records usedFallback:true (ING-07, D4-04)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A non-404 error (GaxiosError 500, and a plain non-Gaxios Error) from listHistory fails loud — throws, never silently falls back"
    requirement: "ING-07"
    verification:
      - kind: unit
        ref: "tests/domain/ingestion.test.ts#a non-404 GaxiosError (e.g. 500) from listHistory fails loud"
        status: pass
      - kind: unit
        ref: "tests/domain/ingestion.test.ts#a non-Gaxios plain Error from listHistory also fails loud"
        status: pass
    human_judgment: false
  - id: D4
    description: "A wide historyId gap (many messagesAdded since the last cursor) is processed as a single catch-up run producing the correct deduped event set (ING-05 data-shape half)"
    verification:
      - kind: unit
        ref: "tests/domain/ingestion.test.ts#a wide historyId gap (many messagesAdded since the last cursor) is processed as a single catch-up run"
        status: pass
    human_judgment: false
  - id: D5
    description: "finishSyncRun persists historyId + usedFallback; getLatestSuccessfulSyncRun returns the newest status=success row, ignoring a later failed run"
    verification:
      - kind: unit
        ref: "tests/domain/sync-state.test.ts#finishSyncRun persists historyId + usedFallback (04-02, D4-04/D4-05)"
        status: pass
      - kind: unit
        ref: "tests/domain/sync-state.test.ts#getLatestSuccessfulSyncRun returns the most recent status=success row, ignoring a LATER failed run (04-02)"
        status: pass
    human_judgment: false
  - id: D6
    description: "syncGmailAction reads getLatestSuccessfulSyncRun and passes historyId into runGmailSync, recording history_id/used_fallback on success — one code path shared with the future scheduled script (D4-05)"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit -p tsconfig.json (syncGmailAction compiles against the extended runGmailSync/finishSyncRun signatures)"
        status: pass
      - kind: other
        ref: "Manual code inspection of src/app/actions.ts syncGmailAction"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-08-03
status: complete
---

# Phase 4 Plan 2: Incremental Sync Engine + Cursor-Expiry Fallback Summary

**`runGmailSync` gains a historyId-first message-id source with a fail-loud-guarded 404 fallback to the existing bounded full-fetch, a post-work cursor re-seed, and a `getLatestSuccessfulSyncRun`-driven manual sync path — closing ING-07 and proving ROADMAP criterion 3 (incremental/full-fetch event-set parity) with 5 new unit tests.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-03T16:40Z (approx.)
- **Completed:** 2026-08-03T16:45Z (approx.)
- **Tasks:** 3
- **Files modified:** 5 (+ 1 new deferred-items.md)

## Accomplishments
- Wrote 5 new RED tests (incremental/full-fetch parity at the row level, 404-fallback, non-404 GaxiosError fail-loud, non-Gaxios plain-Error fail-loud, wide-gap catch-up) plus 2 new sync-state persistence tests, confirmed genuinely RED before any implementation
- `runGmailSync` now resolves message ids via `fetchHistoryMessageIds` when a `historyId` cursor is supplied; on a real `Common.GaxiosError` with `status === 404` it falls back to the existing `lastSync`-windowed sender-query full-fetch (D4-04); any other error re-throws unchanged (T-04-03)
- The cursor is re-seeded via `client.getProfileHistoryId()` strictly AFTER Pass 1/2/3 complete (RESEARCH Pitfall 3) — `runGmailSync` now returns `{ ...counts, newHistoryId, usedFallback }`
- `finishSyncRun` persists `historyId`/`usedFallback` (already zod-validated by 04-01's `newSyncRunInput` extension); added `getLatestSuccessfulSyncRun(db)` — the newest `status="success"` row, immune to a later failed run
- `syncGmailAction` now derives both `lastSync` and `historyId` from `getLatestSuccessfulSyncRun` and records `result.newHistoryId`/`result.usedFallback` on success — the manual sync path is now structurally identical to the scheduled path 04-03 will add (D4-05)
- Updated all 12 pre-existing `runGmailSync` call sites/assertions in `tests/domain/ingestion.test.ts` for the extended `{ lastSync, historyId }` signature and new `usedFallback` field — full domain suite (32 tests across the two files) green, `npx tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing incremental-parity, cursor-expiry, non-404, catch-up, and cursor-persistence tests (RED)** - `18b615b` (test)
2. **Task 2: Incremental-first runGmailSync with 404 fallback + cursor seed, and cursor persistence in sync-state (GREEN)** - `f2e88ba` (feat)
3. **Task 3: Route the manual syncGmailAction through the cursor (GREEN, one code path)** - `e7e243b` (feat)

**Plan metadata:** (pending — recorded after this summary commits)

_TDD gate compliance: `test(04-02)` commit (18b615b) precedes both `feat(04-02)` GREEN commits (f2e88ba, e7e243b), per the plan's task ordering._

## Files Created/Modified
- `src/domain/ingestion.ts` - `runGmailSync` extended signature `{ lastSync, historyId }`, historyId-first resolution with 404-only fallback, post-work `getProfileHistoryId()` cursor seed, return shape `SyncCounts & { newHistoryId?, usedFallback }`
- `src/domain/sync-state.ts` - `finishSyncRun` now sets `historyId`/`usedFallback` on the update; new `getLatestSuccessfulSyncRun(db)`
- `src/app/actions.ts` - `syncGmailAction` reads `getLatestSuccessfulSyncRun` for both `lastSync` and `historyId`, records `historyId`/`usedFallback` into `finishSyncRun` on success
- `tests/domain/ingestion.test.ts` - New `runGmailSync — historyId incremental (04-02, ING-07 + ROADMAP criterion 3)` describe block (5 tests); updated 12 pre-existing call sites/assertions for the new signature/return shape
- `tests/domain/sync-state.test.ts` - New tests for `finishSyncRun` cursor persistence and `getLatestSuccessfulSyncRun` semantics
- `.planning/phases/04-incremental-sync-automatic-scheduling/deferred-items.md` - New: logs 3 pre-existing, out-of-scope full-suite failures from a stray worktree test copy

## Decisions Made
- `{ lastSync, historyId }` kept as a required (non-optional) intersection type exactly as RESEARCH's Code Examples specified — every call site, including all pre-existing tests, now passes `historyId` explicitly (`null` on cold start) rather than relying on an implicit `undefined`
- GaxiosError test fixtures build `config`/`response` via `ConstructorParameters<typeof Common.GaxiosError>` instead of importing gaxios's non-exported `GaxiosOptionsPrepared` type by name — keeps the fixture fully typed without reaching into an internal, non-exported type
- `usedFallback` initialized to `historyId !== null` and flipped to `false` only on a successful `fetchHistoryMessageIds` call, so a cold-start call (`historyId: null`) is never mistakenly flagged as having used the fallback path

## Deviations from Plan

None — plan executed exactly as written. The 12 pre-existing `runGmailSync` call-site/assertion updates in `tests/domain/ingestion.test.ts` were an anticipated consequence of extending the signature (the plan's Task 1 already listed this file in scope) and are documented here for completeness rather than as a deviation.

## Issues Encountered

`npm run test` (full suite) reports 3 pre-existing failures originating from `.claude/worktrees/hopeful-mestorf-9a8ba0/tests/...` — a stray leftover worktree directory unrelated to this project's actual `tests/` tree. Confirmed via `git stash` + `npm test` before any 04-02 edit that the identical 3 failures were already present. Logged to `deferred-items.md` per the executor's scope-boundary rule; not fixed (out of scope for ING-07/criterion 3).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `runGmailSync`, `getLatestSuccessfulSyncRun`, and `syncGmailAction` are all in place and unit-tested — 04-03's `scripts/sync.ts` can call the exact same `runGmailSync({ lastSync, historyId })` + `getLatestSuccessfulSyncRun`/`finishSyncRun` lifecycle with zero fork risk (D4-05).
- 04-04's ingestion-health staleness alarm can read `sync_runs.history_id`/`used_fallback` directly off `getLatestSyncRun`/`getLatestSuccessfulSyncRun` — no further schema work needed.
- No blockers identified for 04-03.

---
*Phase: 04-incremental-sync-automatic-scheduling*
*Completed: 2026-08-03*

## Self-Check: PASSED

All 5 created/modified source/test files confirmed present on disk; all 4 commit hashes (18b615b, f2e88ba, e7e243b, 7840b97) confirmed in git log.
