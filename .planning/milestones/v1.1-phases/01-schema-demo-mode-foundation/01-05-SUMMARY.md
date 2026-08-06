---
phase: 01-schema-demo-mode-foundation
plan: 05
subsystem: database
tags: [drizzle, node:sqlite, seed, demo-mode, vitest, tdd]

# Dependency graph
requires:
  - phase: 01-schema-demo-mode-foundation (01-01)
    provides: schema.ts (13 tables incl. lookup tables), migrate.ts, paths.ts, createTestDb()
  - phase: 01-schema-demo-mode-foundation (01-02)
    provides: server-only db client, DASHBOARD_MODE fail-loud resolution
  - phase: 01-schema-demo-mode-foundation (01-03)
    provides: createApplication, appendStatusEvent, recomputeCurrentStage (projection derivation)
  - phase: 01-schema-demo-mode-foundation (01-04)
    provides: createCompany/resolveCompany (alias resolution), createContact/linkContactToApplication/addConversation
provides:
  - seedLookups(db) — idempotent D-05/D-06/D-07 vocabulary seeder (insert-or-ignore by label)
  - db:seed:lookups npm script
  - src/demo/seed/companies.ts — 17 invented-company fixtures spanning all 8 stages
  - seedDemo(db) — replays fixtures through the real domain write path
  - Proof tests: idempotency, dataset density, structural real/demo isolation, schema parity
affects: [Phase 2 (dashboard UI — will read this demo data for screen-shares), Phase 3 (Gmail ingestion — writes into the same schema this seed proves out)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lookup vocabularies seeded as DATA rows via insert-or-ignore on the unique label column (not onConflictDoUpdate — reserved for single-column uniques, composite-key upserts stay banned per 01-03's Pitfall 2 finding)"
    - "Demo/synthetic fixtures are literal .ts arrays (never derived from real data), replayed through the same domain functions production code uses, so derived columns are never hand-set in a seed"

key-files:
  created:
    - src/db/seed-lookups.ts
    - src/demo/seed/companies.ts
    - src/demo/seed/seed.ts
    - tests/db/seed.test.ts
    - tests/db/schema-parity.test.ts
  modified:
    - package.json (added db:seed:lookups script)

key-decisions:
  - "seedLookups uses onConflictDoNothing keyed on each table's unique `label` column (not a composite key) — safe per 01-03's documented Drizzle/SQLite composite-upsert flakiness, since these are single-column unique targets"
  - "Saved-not-applied fixtures still get one status event (stage: Saved) so recomputeCurrentStage sets a real currentStageId — without an event, Saved companies would have a null current stage and the dataset's stage-count assertion would undercount"
  - "17 invented companies (not the minimum 15) to comfortably clear both the >=15 company floor and give every one of the 8 stages at least one representative, not just the required >=5"

requirements-completed: [DEMO-01, DEMO-02, DEMO-03]

coverage:
  - id: D1
    description: "seedLookups idempotently inserts the 8 canonical stages, 5 sources, and 4 role types (D-05/D-06/D-07), with correct is_terminal/outcome_label on terminal stages"
    requirement: "DEMO-01"
    verification:
      - kind: unit
        ref: "tests/db/seed.test.ts#seedLookups (D-05/D-06/D-07 — lookups) > inserts the canonical stages, sources, and role types"
        status: pass
      - kind: unit
        ref: "tests/db/seed.test.ts#seedLookups (D-05/D-06/D-07 — lookups) > is idempotent — running twice yields exactly one row per canonical label"
        status: pass
    human_judgment: false
  - id: D2
    description: "seedDemo populates >=15 invented companies (delivered 17) spanning every pipeline stage (delivered all 8, not just the required >=5, including Offer and Ghosted), with contacts and dated conversations"
    requirement: "DEMO-01"
    verification:
      - kind: unit
        ref: "tests/db/seed.test.ts#seedDemo (DEMO-01, D-12 — invented-only demo dataset) > populates >=15 invented companies spanning >=5 distinct stages, including Offer and Ghosted, with contacts and dated conversations"
        status: pass
      - kind: other
        ref: "DASHBOARD_MODE=demo npm run db:seed:demo against data/demo.sqlite, verified via node:sqlite query: 17 companies, all 8 distinct stages present, 6 contacts, 7 conversations"
        status: pass
    human_judgment: false
  - id: D3
    description: "The demo seed structurally cannot write the real store — seed.ts has no reference to resolveDbPath('real') or real.sqlite, and its CLI resolves resolveDbPath('demo') only"
    requirement: "DEMO-02"
    verification:
      - kind: unit
        ref: "tests/db/seed.test.ts#seedDemo (DEMO-01, D-12 — invented-only demo dataset) > never references the real store path (structural isolation, Pitfall 4)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Identical migrations applied to two independent SQLite files produce identical 13-table schemas, and demo/real paths remain structurally distinct"
    requirement: "DEMO-03"
    verification:
      - kind: unit
        ref: "tests/db/schema-parity.test.ts#schema parity between two independently-migrated files (DEMO-03) > applying runMigrations to two separate temp SQLite files yields identical table sets, both containing all 13 expected tables"
        status: pass
      - kind: unit
        ref: "tests/db/schema-parity.test.ts#schema parity between two independently-migrated files (DEMO-03) > resolveDbPath('demo') and resolveDbPath('real') are distinct, and neither the seed nor the migrate CLI addresses both stores in one handle (DEMO-02)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-07-27
status: complete
---

# Phase 01 Plan 05: Vocabulary Seeder + Invented-Company Demo Dataset Summary

**Idempotent D-05/D-06/D-07 lookup seeder plus a 17-company invented demo dataset (all 8 pipeline stages, 6 contacts, 7 dated conversations) built entirely through the existing domain write path, with tests proving the seed cannot touch the real store and that migrations apply identically to both files.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-07-27T15:20:00-05:00
- **Completed:** 2026-07-27T16:05:00-05:00
- **Tasks:** 3
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments
- `seedLookups(db)` inserts the 8 canonical stages, 5 sources, and 4 role types as idempotent data rows (insert-or-ignore by unique `label`) — a new role type later is one INSERT, zero migrations (D-07)
- `src/demo/seed/companies.ts` defines 17 invented (never-real) company fixtures spanning all 8 stages — 1 Offer, 2 Interview, 2 Screen, 2 Applied, 3 Rejected, 3 Ghosted, 1 Withdrawn, 3 Saved — with 6 contacts and 7 dated conversations attached to a subset
- `seedDemo(db)` replays every fixture through the real domain write path (`createCompany`, `createApplication`, `appendStatusEvent`, `createContact`, `linkContactToApplication`, `addConversation`) so `currentStageId`/`currentStageSince` are always derived by `recomputeCurrentStage`, never hand-set
- Structural isolation proven: `seedDemo`'s CLI wrapper resolves only `resolveDbPath('demo')`; a test asserts `seed.ts`'s source contains no reference to `resolveDbPath('real')` or `real.sqlite`
- Schema-parity proven: `runMigrations` applied to two independent temp SQLite files yields identical 13-table schemas
- End-to-end verified: `DASHBOARD_MODE=demo npm run db:seed:demo` populated `data/demo.sqlite` with all 17 companies across all 8 stages, 6 contacts, 7 conversations (then cleaned up — the file stays gitignored)

## Task Commits

Each task was committed atomically (TDD RED -> GREEN):

1. **Task 1: Idempotent vocabulary seeder (D-05/D-06/D-07)**
   - `fefb90e` test(01-05): add failing test for lookup vocabulary seeder
   - `91d24bf` feat(01-05): implement idempotent vocabulary seeder (D-05/D-06/D-07)
2. **Task 2: Invented-company demo dataset (DEMO-01, D-12)**
   - `2f3b629` test(01-05): add failing test for invented-company demo dataset
   - `376d25c` feat(01-05): implement invented-company demo dataset (DEMO-01, D-12)
3. **Task 3: Structural isolation + schema parity across both files (DEMO-02, DEMO-03)**
   - `ee2789c` test(01-05): add schema-parity + structural isolation test (DEMO-02, DEMO-03)
   - (test-only task — proves already-built `runMigrations`/`resolveDbPath` behavior; no separate GREEN commit needed)

**Plan metadata:** (this commit, see below)

## Files Created/Modified
- `src/db/seed-lookups.ts` - `seedLookups(db)` idempotent D-05/D-06/D-07 vocabulary seeder + CLI wrapper (`db:seed:lookups`)
- `src/demo/seed/companies.ts` - 17 invented-company fixture array with typed `DemoCompanyFixture`/`DemoContactFixture`/`DemoConversationFixture`/`DemoStatusEventFixture` shapes
- `src/demo/seed/seed.ts` - `seedDemo(db)` + CLI wrapper resolving only `resolveDbPath('demo')`
- `tests/db/seed.test.ts` - lookups idempotency, demo dataset density, structural isolation (source-scan) tests
- `tests/db/schema-parity.test.ts` - two-file schema-parity + demo/real path-distinctness tests
- `package.json` - added `db:seed:lookups` script alongside the existing `db:migrate`/`db:seed:demo`

## Decisions Made
- Used `onConflictDoNothing` keyed on each lookup table's single-column unique `label` (not a composite-key upsert) — this sidesteps the documented Drizzle/SQLite composite-key `onConflictDoUpdate` flakiness (01-03's Pitfall 2 finding) because these targets are all single-column uniques, which is a different, reliable code path.
- Saved-not-applied fixtures (`dateApplied: null`) still get exactly one status event (`stage: "Saved"`) rather than zero events — without an event, `recomputeCurrentStage` never runs and `currentStageId` stays `null`, which would silently exclude those 3 companies from the "distinct current stages" count the DEMO-01 test/dashboard density depends on.
- Shipped 17 fixtures (above the 15 minimum) specifically so every one of the 8 stages has at least one representative, not just the plan's required minimum of 5 distinct stages — this maximizes how "alive" the dashboard looks on a screen-share (D-12's stated purpose) at negligible extra cost.

## Deviations from Plan

None - plan executed exactly as written. All three tasks (vocabulary seeder, demo dataset, schema-parity/isolation proof) match the plan's `must_haves` and `acceptance_criteria` with no scope changes.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 10 Phase 1 requirements (DATA-01..07, DEMO-01..03) are now complete — this was the last plan of Phase 1.
- Phase 2 can rely on: a fully migrated schema, the domain write path (applications/events/projections/overrides/companies/contacts), and a dense, screen-share-ready demo dataset reachable via `DASHBOARD_MODE=demo npm run db:seed:demo`.
- Real store (`data/real.sqlite`) remains untouched by any seed path — Phase 2 is the first phase expected to write real records into it, consistent with the phase boundary noted in 01-RESEARCH.md.
- No blockers.

---
*Phase: 01-schema-demo-mode-foundation*
*Completed: 2026-07-27*

## Self-Check: PASSED

All 6 created/modified files found on disk; all 5 task commit hashes (fefb90e, 91d24bf, 2f3b629, 376d25c, ee2789c) found in git log.
