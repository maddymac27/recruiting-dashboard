---
phase: 04-incremental-sync-automatic-scheduling
plan: 01
subsystem: database, api
tags: [gmail, googleapis, history-api, drizzle, node-sqlite, cursor, incremental-sync]

# Dependency graph
requires:
  - phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
    provides: runGmailSync orchestrator, GmailClient interface, syncRuns table/lifecycle, dedup ledger
provides:
  - sync_runs.history_id + sync_runs.used_fallback columns (applied to real + demo stores)
  - PRAGMA busy_timeout = 5000 on every SQLite connection
  - GmailClient.listHistory + GmailClient.getProfileHistoryId (real implementation)
  - fetchHistoryMessageIds(client, startHistoryId) — cursor -> deduped message-id list + latest historyId
  - Extended FakeGmailFixtures (historyByStartId/profileHistoryId/rejectListHistory) for future 404-fallback tests
affects: [04-02 (runGmailSync cursor-expiry fallback wiring), 04-03/04-04 (scheduling + ingestion-health staleness)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GmailClient interface extension mirrors existing listMessages/getMessageRaw/listLabels shape (params destructured at top level, results mapped to narrow interface types, no try/catch inside client.ts)"
    - "Cursor-fixture pagination in tests/helpers/gmail.ts mirrors messagesByQuery's offset-pageToken slicing convention"

key-files:
  created:
    - drizzle/20260803163120_dusty_pyro/migration.sql
    - drizzle/20260803163120_dusty_pyro/snapshot.json
  modified:
    - src/db/schema.ts
    - src/db/validation.ts
    - src/db/open-sqlite.ts
    - src/gmail/types.ts
    - src/gmail/client.ts
    - src/gmail/fetch.ts
    - tests/helpers/gmail.ts
    - tests/gmail/fetch.test.ts

key-decisions:
  - "historyId cursor carried on sync_runs row (not a dedicated table) per D4-05 default"
  - "used_fallback as a dedicated boolean column (not folded into errorMessage) per RESEARCH open question 2"
  - "busy_timeout centralized in openSqliteFile so every production connection (client.ts, migrate.ts, seed scripts, future scripts/sync.ts) inherits it automatically"

patterns-established:
  - "404-only error-type narrowing lives in the orchestrator (src/domain/ingestion.ts, 04-02), never inside client.ts — client.ts methods never catch their own googleapis errors"

requirements-completed: [ING-07]

coverage:
  - id: D1
    description: "sync_runs physically carries history_id (nullable) + used_fallback (bool, default false) in both real and demo SQLite stores via one additive drizzle-kit generated migration"
    requirement: "ING-07"
    verification:
      - kind: unit
        ref: "tests/db/schema-parity.test.ts"
        status: pass
      - kind: other
        ref: "node -e \"PRAGMA table_info(sync_runs)\" on data/real.sqlite confirms history_id + used_fallback columns present"
        status: pass
    human_judgment: false
  - id: D2
    description: "openSqliteFile sets PRAGMA busy_timeout = 5000 on every connection"
    verification:
      - kind: unit
        ref: "tests/db/open-sqlite.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "newSyncRunInput accepts optional historyId + usedFallback fields, validated via zod (V5) before any write"
    verification:
      - kind: unit
        ref: "tests/db/validation.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "fetchHistoryMessageIds turns a stored historyId cursor into a deduplicated set of newly-added Gmail message ids plus the latest historyId, reading ONLY messagesAdded (never top-level messages, never subject/body/content)"
    requirement: "ING-07"
    verification:
      - kind: unit
        ref: "tests/gmail/fetch.test.ts#fetchHistoryMessageIds"
        status: pass
    human_judgment: false
  - id: D5
    description: "GmailClient.listHistory (real implementation) sends historyTypes: [\"messageAdded\"], maps to the narrow GmailHistoryListResult shape, and contains no try/catch so a 404 GaxiosError propagates unchanged to the caller"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit -p tsconfig.json (real client satisfies extended GmailClient interface)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-08-03
status: complete
---

# Phase 4 Plan 1: Sync Cursor Substrate + Gmail History Transport Summary

**Additive `sync_runs.history_id`/`used_fallback` migration applied to both SQLite stores, centralized `busy_timeout` pragma, and a paginating `fetchHistoryMessageIds` transport that turns a Gmail historyId cursor into a deduplicated, content-free message-id set against `history.list`'s `messagesAdded` field only.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-03T16:30Z (approx.)
- **Completed:** 2026-08-03T16:33Z (approx.)
- **Tasks:** 3
- **Files modified:** 8 (+ 2 new migration files)

## Accomplishments
- `GmailClient` interface extended with `listHistory`/`getProfileHistoryId`; fake client in `tests/helpers/gmail.ts` implements both, including an injectable rejection path for future 404-fallback tests (04-02)
- Wrote and confirmed a genuinely RED `fetchHistoryMessageIds` test suite (4 behavior cases) before any implementation existed
- `sync_runs` gained `history_id` (nullable text) and `used_fallback` (boolean, default false) via one additive `drizzle-kit generate`-produced migration, applied to both `data/real.sqlite` and `data/demo.sqlite`
- `PRAGMA busy_timeout = 5000` added to the single centralized `openSqliteFile` function, covering every production connection (client.ts, migrate.ts, seed scripts, and the future `scripts/sync.ts`) with one change
- Implemented the real `listHistory`/`getProfileHistoryId` transport methods and `fetchHistoryMessageIds`, turning the RED suite GREEN — all four behaviors (dedup across records, messagesAdded-only read, multi-page union, empty-gap echo) pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Define the Gmail history/profile contract and write the failing fetchHistoryMessageIds test (RED)** - `b36c35a` (test)
2. **Task 2: [BLOCKING] Add sync_runs cursor columns + busy_timeout pragma, generate and apply the additive migration** - `1f5cba2` (feat)
3. **Task 3: Implement the Gmail history transport (GREEN)** - `07bde98` (feat)

**Plan metadata:** (pending — recorded after this summary commits)

_TDD gate compliance: `test(04-01)` commit (b36c35a) precedes the `feat(04-01)` GREEN commit (07bde98), with the schema/migration `feat(04-01)` task (1f5cba2) landing in between as a separate non-TDD blocking task, per the plan's task ordering._

## Files Created/Modified
- `src/gmail/types.ts` - Added `GmailHistoryRecord`, `GmailHistoryListParams`, `GmailHistoryListResult`; extended `GmailClient` with `listHistory`/`getProfileHistoryId`
- `tests/helpers/gmail.ts` - Extended `FakeGmailFixtures` with `historyByStartId`/`profileHistoryId`/`rejectListHistory`; fake `listHistory`/`getProfileHistoryId` implementations
- `tests/gmail/fetch.test.ts` - Added `fetchHistoryMessageIds` describe block (4 behavior cases)
- `src/db/schema.ts` - `syncRuns` gains `historyId`/`usedFallback` columns
- `src/db/validation.ts` - `newSyncRunInput` gains optional `historyId`/`usedFallback`
- `src/db/open-sqlite.ts` - Added `PRAGMA busy_timeout = 5000`
- `drizzle/20260803163120_dusty_pyro/migration.sql` - Additive `ALTER TABLE sync_runs ADD` (history_id, used_fallback); applied to both stores
- `drizzle/20260803163120_dusty_pyro/snapshot.json` - drizzle-kit generated schema snapshot
- `src/gmail/client.ts` - Real `listHistory`/`getProfileHistoryId` implementations on `wrapGmailClient`
- `src/gmail/fetch.ts` - `fetchHistoryMessageIds(client, startHistoryId)`

## Decisions Made
- Cursor carried on `sync_runs.history_id` rather than a dedicated single-row settings table (D4-05 default accepted as-is)
- `used_fallback` implemented as its own boolean column rather than string-parsed from `errorMessage` (RESEARCH open question 2 recommendation accepted as-is)
- `busy_timeout` fix landed once, centrally, in `openSqliteFile` rather than per call site

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The RED test failed for the expected reason (`fetchHistoryMessageIds is not a function`), the migration generated was additive-only (`ALTER TABLE ... ADD COLUMN`, confirmed by direct inspection of the generated SQL), and applying it to both `real.sqlite` and `demo.sqlite` succeeded without error. `npx tsc --noEmit` reported zero errors after the real `client.ts` implementation was added, confirming it satisfies the extended `GmailClient` interface.

## User Setup Required

None - no external service configuration required. No new packages installed (googleapis/drizzle-kit/tsx already present).

## Next Phase Readiness
- The cursor-storage substrate (`sync_runs.history_id`/`used_fallback`) and the `fetchHistoryMessageIds` transport are both in place and unit-tested against a fake `GmailClient` — 04-02 can now wire `runGmailSync`'s historyId branch + 404 `GaxiosError` fallback decision directly on top of this plan's output without touching schema or transport code again.
- `tests/helpers/gmail.ts`'s `rejectListHistory` fixture field is present but unused by this plan's tests — 04-02 is expected to inject a real `Common.GaxiosError` instance through it to exercise the `instanceof` guard.
- No blockers identified for 04-02.

---
*Phase: 04-incremental-sync-automatic-scheduling*
*Completed: 2026-08-03*

## Self-Check: PASSED

All 11 created/modified files confirmed present on disk; all 4 commit hashes (b36c35a, 1f5cba2, 07bde98, 7ac9af6) confirmed in git log.
