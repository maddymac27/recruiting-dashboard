---
phase: 02-manual-capture-core-pipeline-ui
plan: 02
subsystem: database
tags: [drizzle, node-sqlite, zod, event-sourcing, migration]

# Dependency graph
requires:
  - phase: 01-schema-demo-mode-foundation
    provides: applications/statusEvents schema, appendStatusEvent, recomputeCurrentStage, DbOrTx type, Zod validation convention
provides:
  - applications.postingUrl (posting_url) nullable text column, applied to demo + real stores
  - quickSaveApplicationInput / QuickSaveApplicationInput Zod schema
  - updateApplicationInput / UpdateApplicationInput Zod schema
  - appendStatusEventTx(tx, validated) — non-transaction-owning helper callable from inside another db.transaction
affects: [02-05 (quickSaveApplication write slice), 02-06 (updateApplication write slice)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "postingUrlSchema shared refinement (z.string().url() + http/https protocol check) reused by both new Zod schemas"
    - "appendStatusEventTx mirrors recomputeCurrentStage's DbOrTx, non-transaction-owning shape so write paths can compose multiple event appends/field edits inside one outer db.transaction"

key-files:
  created: []
  modified:
    - src/db/schema.ts
    - drizzle/20260729174433_nifty_alice/ (generated migration)
    - src/db/validation.ts
    - src/domain/events.ts
    - tests/db/migrate.test.ts
    - tests/domain/events.test.ts
    - .planning/phases/02-manual-capture-core-pipeline-ui/deferred-items.md

key-decisions:
  - "Repaired a pre-existing stale __drizzle_migrations journal entry in data/real.sqlite (name/hash pointed at a since-renamed/regenerated Phase 1 migration folder, causing db:migrate to attempt re-creating existing tables) so the real store could accept this plan's new migration — schema content was already structurally identical to the current migration, only the tracking row was stale."
  - "postingUrl validation is a shared internal postingUrlSchema (z.string().url() + http/https-only refine) used by both quickSaveApplicationInput and updateApplicationInput, rather than duplicating the refinement."

patterns-established:
  - "appendStatusEventTx(tx, validated) / appendStatusEvent(db, input) split: the *Tx variant never opens a transaction and is the one Wave 3 write paths must call internally; appendStatusEvent stays the public validate-then-transaction entry point for standalone callers."

requirements-completed: [CAP-01, CAP-02]

coverage:
  - id: D1
    description: "applications.postingUrl nullable column exists and is applied via an additive-only migration to both demo and real SQLite stores"
    requirement: "CAP-01"
    verification:
      - kind: unit
        ref: "tests/db/migrate.test.ts#applications table includes a nullable posting_url column (CAP-01)"
        status: pass
      - kind: manual_procedural
        ref: "PRAGMA table_info(applications) checked directly against data/demo.sqlite and data/real.sqlite after npm run db:migrate (DASHBOARD_MODE=demo, then =real)"
        status: pass
    human_judgment: false
  - id: D2
    description: "quickSaveApplicationInput and updateApplicationInput Zod schemas validate required/optional fields and reject non-http(s) postingUrl values"
    requirement: "CAP-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (schemas + inferred types type-check)"
        status: pass
      - kind: manual_procedural
        ref: "ad hoc safeParse checks: valid https URL accepted, javascript: scheme rejected, malformed URL rejected, missing companyName/roleTitle rejected, updateApplicationInput all-optional accepted, non-http(s) postingUrl rejected"
        status: pass
    human_judgment: false
  - id: D3
    description: "appendStatusEventTx is callable twice inside one outer db.transaction without a nested-transaction error, and appendStatusEvent remains a thin wrapper preserving prior idempotency behavior"
    requirement: "CAP-02"
    verification:
      - kind: unit
        ref: "tests/domain/events.test.ts#appendStatusEventTx is callable twice inside one outer transaction without a nested-transaction error (Pitfall 2 regression)"
        status: pass
      - kind: unit
        ref: "tests/domain/events.test.ts (3 pre-existing appendStatusEvent cases: append-only, idempotent insert, NULL source_message_id distinctness) — all still pass unmodified"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-07-29
status: complete
---

# Phase 2 Plan 2: Data-Layer Foundations for CAP-01/CAP-02 Write Slices Summary

**Additive `postingUrl` schema migration (applied to demo + real), `quickSaveApplicationInput`/`updateApplicationInput` Zod schemas with http/https-only URL validation, and an extracted `appendStatusEventTx` helper that lets write paths append a status event inside their own transaction without SQLite's nested-transaction limit.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-29T17:42:00Z
- **Completed:** 2026-07-29T17:50:29Z
- **Tasks:** 3
- **Files modified:** 6 (+ 1 deferred-items.md note)

## Accomplishments
- `applications.postingUrl` (`posting_url`) nullable text column added and applied to both `data/demo.sqlite` and `data/real.sqlite` via a generated, additive-only drizzle migration (no existing column altered/dropped; existing 17 demo rows and 0 real rows read back unaffected).
- `quickSaveApplicationInput` (companyName + roleTitle required, postingUrl optional) and `updateApplicationInput` (all fields optional/nullable, stageId optional) Zod schemas added, sharing an http/https-only URL refinement that rejects `javascript:`/malformed URIs before persistence (T-02-03).
- `appendStatusEventTx(tx, validated)` extracted from `appendStatusEvent` — inserts the status event and recomputes the projection using a passed-in `DbOrTx` handle with no transaction of its own, mirroring `recomputeCurrentStage`'s shape. `appendStatusEvent(db, input)` is now a thin `validate -> db.transaction(tx => appendStatusEventTx(tx, validated))` wrapper; all 3 prior `appendStatusEvent` tests still pass unmodified, plus a new regression test proving two `appendStatusEventTx` calls inside one outer `db.transaction` do not throw and leave the correct final projection.

## Task Commits

Each task followed a RED -> GREEN cycle (tdd="true"):

1. **Task 1: [BLOCKING] postingUrl column + migration**
   - `96e9ab3` test(02-02): add failing test for posting_url column presence (RED)
   - `12756f0` feat(02-02): add nullable postingUrl column + migration (GREEN)
2. **Task 2: quickSaveApplicationInput + updateApplicationInput schemas**
   - `f1a0fbc` feat(02-02): add quickSaveApplicationInput + updateApplicationInput schemas
3. **Task 3: Extract appendStatusEventTx**
   - `235b211` test(02-02): add failing regression test for appendStatusEventTx (RED)
   - `6500d90` feat(02-02): extract appendStatusEventTx from appendStatusEvent (GREEN)

**Plan metadata:** committed alongside this SUMMARY.

_Note: Task 2 had no separate RED test — it is pure schema addition verified by `npx tsc --noEmit` plus ad hoc `safeParse` checks per the plan's own `<verify>` block, not a behavior-test RED/GREEN cycle._

## Files Created/Modified
- `src/db/schema.ts` — added `postingUrl: text("posting_url")` to `applications`, nullable, no default.
- `drizzle/20260729174433_nifty_alice/` — generated migration (`ALTER TABLE applications ADD posting_url text`) + snapshot.
- `src/db/validation.ts` — added `quickSaveApplicationInput`/`QuickSaveApplicationInput`, `updateApplicationInput`/`UpdateApplicationInput`, and a shared `postingUrlSchema` http/https refinement.
- `src/domain/events.ts` — extracted `appendStatusEventTx(tx, validated)`; `appendStatusEvent` is now a thin wrapper; imports `DbOrTx` from `./projections` instead of redefining it.
- `tests/db/migrate.test.ts` — added a case asserting `posting_url` column presence and `notnull = 0`.
- `tests/domain/events.test.ts` — added a nested-transaction regression case for `appendStatusEventTx`.
- `.planning/phases/02-manual-capture-core-pipeline-ui/deferred-items.md` — logged two out-of-scope observations (see Deviations).

## Decisions Made
- Repaired a pre-existing stale migration-journal row in `data/real.sqlite` rather than working around it, because the plan's task explicitly requires `npm run db:migrate` to succeed against both demo and real stores, and the underlying table structure was already correct (only the tracking metadata was stale).
- Shared the http/https URL refinement as one `postingUrlSchema` constant instead of duplicating the `.refine(...)` in both new Zod schemas.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Repaired stale `__drizzle_migrations` journal entry in `data/real.sqlite`**
- **Found during:** Task 1 (applying the migration to the `real` store)
- **Issue:** `npm run db:migrate` with `DASHBOARD_MODE=real` failed with `table \`applications\` already exists`. `data/real.sqlite`'s `__drizzle_migrations` table recorded a migration named `20260722211923_pale_zeigeist` (a since-deleted/renamed folder from earlier Phase 1 iteration) whose hash didn't match any current migration folder. The migrator matches pending migrations by folder *name* against recorded names, so it queued both `20260728222830_bent_lester` (the current initial migration, structurally identical to the recorded one) and the new `20260729174433_nifty_alice` — the former's `CREATE TABLE` statements failed against tables that already existed.
- **Fix:** Verified `data/real.sqlite`'s live schema already matched the 13 tables `bent_lester` would produce (via `PRAGMA table_info`/table listing), then updated the stale journal row's `name`/`hash` to `20260728222830_bent_lester` / its correct content hash, so the migrator correctly recognized only `nifty_alice` as pending. Re-ran `npm run db:migrate` (DASHBOARD_MODE=real) — succeeded, applying only the new `ADD COLUMN posting_url` statement.
- **Files modified:** `data/real.sqlite` (gitignored, not committed — data file only)
- **Verification:** `PRAGMA table_info(applications)` on both `data/demo.sqlite` and `data/real.sqlite` confirms `posting_url` present with `notnull = 0`; table counts (15) and row counts (demo: 17 applications, real: 0) unchanged from before the fix.
- **Committed in:** N/A (data file, gitignored — not part of any git commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to satisfy the plan's explicit "apply to both demo and real" requirement; no schema/code change involved, purely a migration-tracking repair on a pre-existing inconsistency from Phase 1. No scope creep.

## Issues Encountered
- Discovered (not fixed, logged to `deferred-items.md`): a stale `.claude/worktrees/hopeful-mestorf-9a8ba0/` directory contains a full duplicate `tests/` tree from an earlier abandoned worktree-isolation attempt (#683). `vitest.config.ts` has no `test.exclude` for it, so a bare `vitest run`/`npm test` picks up both copies and surfaces 3 pre-existing failures in the stale copy only (`tests/db/seed.test.ts`, `tests/domain/companies.test.ts`) unrelated to any file this plan touches. The plan's own scoped verification (`vitest run tests/db/migrate.test.ts tests/domain/events.test.ts`) passes cleanly (14/14, 4 files including the stale duplicates of those two specific files, which also pass). Out of this plan's scope to fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `postingUrl` column, `quickSaveApplicationInput`/`updateApplicationInput` schemas, and `appendStatusEventTx` are all in place — Wave 3 write slices (02-05 `quickSaveApplication`, 02-06 `updateApplication`) are unblocked and can compose `appendStatusEventTx` inside their own `db.transaction` alongside direct field writes.
- Known non-blocking cleanup carried forward in `deferred-items.md`: (1) stale `.claude/worktrees/` duplicate test tree should be removed or excluded in `vitest.config.ts`; (2) the `data/real.sqlite` migration-journal repair pattern (name/hash mismatch after a migration folder rename) is worth a short note in project docs in case it recurs for a future schema change.

---
*Phase: 02-manual-capture-core-pipeline-ui*
*Completed: 2026-07-29*

## Self-Check: PASSED

All key files verified present on disk (src/db/schema.ts, src/db/validation.ts, src/domain/events.ts, tests/db/migrate.test.ts, tests/domain/events.test.ts, drizzle/20260729174433_nifty_alice/migration.sql, this SUMMARY). All 5 task commits (96e9ab3, 12756f0, f1a0fbc, 235b211, 6500d90) confirmed in git log. Plan-level verification (`vitest run tests/db/migrate.test.ts tests/domain/events.test.ts` and `npx tsc --noEmit`) re-run and passing at self-check time.
