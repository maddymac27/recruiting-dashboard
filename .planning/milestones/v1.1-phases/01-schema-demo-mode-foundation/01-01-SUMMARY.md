---
phase: 01-schema-demo-mode-foundation
plan: 01
subsystem: database

tags: [drizzle-orm, node-sqlite, zod, nextjs, typescript, vitest, sqlite]

# Dependency graph
requires: []
provides:
  - Greenfield Next.js 16 + TypeScript project scaffold running on node's built-in node:sqlite driver (no better-sqlite3, no native compile)
  - Complete Drizzle schema (13 tables) covering lookup vocab, companies/aliases, applications with materialized projection columns, append-only status_events, overrides, contacts/conversations/join table, and review_queue/dead_letter stubs
  - Zod write-boundary validation schemas incl. a fixed override field_name allow-list
  - Fail-loud DASHBOARD_MODE -> file path resolution (src/db/paths.ts)
  - Migration runner (src/db/migrate.ts) reused by app startup, demo seed, and tests
  - Generated first migration (drizzle/20260722211923_pale_zeigeist) creating all 13 tables with correct constraints
  - Shared in-memory test-DB fixture (tests/helpers/db.ts) for every downstream domain test
affects: [01-02, 01-03, 01-04, 01-05, phase-2-manual-capture-core-ui]

# Tech tracking
tech-stack:
  added:
    - "next@16.2.11, react@19.2.8, react-dom@19.2.8"
    - "drizzle-orm@1.0.0-rc.4, drizzle-kit@1.0.0-rc.4 (bumped from pinned 0.45.x/0.31.x — see key-decisions)"
    - "zod@4.4.3, server-only@0.0.1"
    - "typescript@7.0.2, @types/node@26.1.1, tsx@4.23.1, vitest@4.1.10"
    - "node:sqlite (DatabaseSync) via drizzle-orm/node-sqlite — Node's built-in driver, zero native compilation"
  patterns:
    - "Materialized projection columns on applications (current_stage_id/since, last_inbound_event_at) with no migration default — written only by a later recompute function, never by ingestion directly"
    - "Append-only status_events with UNIQUE(source_message_id) for idempotent re-sync"
    - "overrides table with composite UNIQUE(application_id, field_name) and a fixed Zod allow-list constant gating field_name at the write boundary"
    - "Single server-agnostic src/db/paths.ts module as the only place DASHBOARD_MODE maps to a file path"
    - "createTestDb() in tests/helpers/db.ts — isolated in-memory node:sqlite DB with migrations pre-applied, shared by every downstream test"

key-files:
  created:
    - package.json
    - tsconfig.json
    - next.config.ts
    - drizzle.config.ts
    - vitest.config.ts
    - .gitignore
    - .env.example
    - src/db/schema.ts
    - src/db/validation.ts
    - src/db/paths.ts
    - src/db/migrate.ts
    - tests/helpers/db.ts
    - tests/db/validation.test.ts
    - tests/db/migrate.test.ts
    - drizzle/20260722211923_pale_zeigeist/migration.sql
    - drizzle/20260722211923_pale_zeigeist/snapshot.json
  modified: []

key-decisions:
  - "Bumped drizzle-orm/drizzle-kit from the pinned 0.45.x/0.31.x stable line to 1.0.0-rc.4: the stable 0.45.2 release does not export drizzle-orm/node-sqlite at all (confirmed directly against the npm registry) — that subpath only exists starting in the 1.0.0 beta/rc pre-release track. Since D-14 locks in node:sqlite (better-sqlite3 is empirically broken on this Windows machine — no VS C++ Build Tools, no prebuild fallback), rc.4 (published 2026-06-27, ~13 months into a beta/rc cycle that began March 2025) was chosen as the most mature pre-release available, not a same-day snapshot."
  - "drizzle-orm 1.0.0's node-sqlite driver constructor signature changed from the 0.45.x two-argument form (drizzle(sqlite, { schema })) to a single-object form (drizzle({ client: sqlite })); the sqlite-specific config type in this version also drops the `schema` key entirely (relational-query schema is now passed via a separate `relations` config, not needed at this phase since the domain layer uses the plain query builder, not db.query.*)."
  - "Added a mkdirSync(dirname(dbPath), { recursive: true }) step to the migrate.ts CLI entry point — node:sqlite's DatabaseSync does not create missing parent directories, so a first-ever migrate run against a fresh clone would otherwise fail with 'unable to open database file' (verified directly)."
  - "createdAt/setByUserAt/linkedAt audit timestamp columns use .defaultNow(); the three materialized projection columns on applications (current_stage_id, current_stage_since, last_inbound_event_at) deliberately have no default, per the must-have truth that they are written only by a later recompute function."

patterns-established:
  - "Lookup tables (role_types, stages, sources) as seeded reference data, not SQLite enums — new values are one INSERT, zero migrations"
  - "Company alias table (company_aliases) + normalized_key defensive lookup column, over fuzzy string matching"
  - "contact_applications many-to-many join table with composite primary key + per-column indexes"

requirements-completed: [DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DEMO-03]

coverage:
  - id: D1
    description: "Complete Drizzle schema defining all 13 tables with correct constraints (UNIQUE on status_events.source_message_id, composite UNIQUE on overrides, composite PK on contact_applications, no-default projection columns on applications)"
    requirement: "DATA-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: integration
        ref: "tests/db/migrate.test.ts#creates all 13 expected tables in a fresh in-memory DB"
        status: pass
    human_judgment: false
  - id: D2
    description: "Zod write-boundary validation schemas, incl. overrideInput constrained to a fixed OVERRIDABLE_FIELDS allow-list rejecting arbitrary field_name values"
    requirement: "DATA-07"
    verification:
      - kind: unit
        ref: "tests/db/validation.test.ts#overrideInput rejects a field_name outside the correctable-field allow-list"
        status: pass
      - kind: unit
        ref: "tests/db/validation.test.ts#overrideInput accepts a field_name from the allow-list"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fail-loud DASHBOARD_MODE path resolution: assertMode()/resolveDbPath() throw on unset/invalid mode and return two distinct absolute file paths for demo vs real"
    requirement: "DEMO-03"
    verification:
      - kind: unit
        ref: "tests/db/migrate.test.ts#resolveDbPath returns two distinct absolute paths for demo and real"
        status: pass
      - kind: unit
        ref: "tests/db/migrate.test.ts#assertMode throws on an unset/invalid mode (fail loud, no default)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Migration runner (runMigrations) + shared in-memory test-DB helper (createTestDb) available to every downstream test"
    requirement: "DATA-06"
    verification:
      - kind: integration
        ref: "tests/db/migrate.test.ts#creates all 13 expected tables in a fresh in-memory DB"
        status: pass
      - kind: other
        ref: "DASHBOARD_MODE=demo npx tsx src/db/migrate.ts (manual CLI exercise, verified creates data/demo.sqlite with all tables, then removed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Greenfield project installs cleanly on the node:sqlite driver — no better-sqlite3, no native compilation, engines.node >=24 enforced"
    verification:
      - kind: other
        ref: "npm install (added 83 packages, 0 native compile steps); node -e forbidden-driver-check script"
        status: pass
    human_judgment: false
  - id: D6
    description: ".gitignore protects data/*.sqlite, data/*.sqlite-*, and .env* (but not .env.example) before any data directory exists"
    requirement: "DEMO-03"
    verification:
      - kind: other
        ref: "git check-ignore data/real.sqlite && git check-ignore .env && git ls-files .env.example"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-22
status: complete
---

# Phase 01 Plan 01: Schema + Project Scaffold Foundation Summary

**Next.js + TypeScript scaffold on Node's built-in node:sqlite driver, with a complete 13-table event-sourced Drizzle schema, Zod write-boundary validation with an override field allow-list, and a shared in-memory migrated test-DB harness.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-22T21:03:00Z (approx, from STATE.md session start)
- **Completed:** 2026-07-22T21:20:40Z
- **Tasks:** 4 (Task 1 pre-approved checkpoint + Tasks 2-4 executed)
- **Files modified:** 16 created

## Accomplishments
- Greenfield Next.js 16/React 19/TypeScript project installs cleanly with zero native compilation, on Node's built-in `node:sqlite` driver (D-14) — `better-sqlite3` confirmed absent from `node_modules`.
- All 13 Phase 1 tables defined in `src/db/schema.ts` with the exact constraints the plan's must-haves require: `UNIQUE(status_events.source_message_id)`, composite `UNIQUE(overrides.application_id, overrides.field_name)`, composite primary key on `contact_applications`, and no-default materialized projection columns on `applications`.
- Zod validation schemas (`src/db/validation.ts`) for every write path, with `overrideInput` gated by a single exported `OVERRIDABLE_FIELDS` allow-list constant (mitigates T-01-01 tampering threat).
- Fail-loud `DASHBOARD_MODE` → file path resolution (`src/db/paths.ts`) with no default, per D-13.
- Migration runner (`src/db/migrate.ts`) and the first generated migration creating all 13 tables; a shared in-memory test-DB fixture (`tests/helpers/db.ts`) that every downstream domain test can import.
- `.gitignore` protecting `data/*.sqlite` and `.env*` (but not `.env.example`) landed before any `data/` directory could exist.

## Task Commits

Each task was committed atomically (Tasks 3 and 4 followed full TDD RED→GREEN):

1. **Task 1: Package legitimacy spot-check** — pre-approved by the developer via the orchestrator before this agent ran; not re-prompted. No commit (gate only).
2. **Task 2: Project scaffold, configs, and .gitignore** — `88eb102` (feat)
3. **Task 3: Complete Drizzle schema + Zod validation** — `de5e355` (test, RED) → `518b709` (feat, GREEN)
4. **Task 4: Migration runner + in-memory test harness** — `cc79140` (test, RED) → `7f55f80` (feat, GREEN)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP/REQUIREMENTS update)

## TDD Gate Compliance

Both TDD-tagged tasks followed the required RED → GREEN sequence, confirmed in git log:
- Task 3: `de5e355` (test) precedes `518b709` (feat) — RED test failed on missing module before implementation, then passed after.
- Task 4: `cc79140` (test) precedes `7f55f80` (feat) — same pattern, verified failing then passing.

No REFACTOR commit was needed for either task (no post-GREEN cleanup required).

## Files Created/Modified
- `package.json` - deps/devDeps/engines/scripts for the scaffold
- `tsconfig.json` - strict TS config with `@/*` → `src/*` alias
- `next.config.ts` - minimal Next.js config
- `drizzle.config.ts` - drizzle-kit config targeting `src/db/schema.ts` → `./drizzle`
- `vitest.config.ts` - node environment, `@/*` alias resolution
- `.gitignore` - protects `data/*.sqlite`, `data/*.sqlite-*`, `.env*`, `*.tsbuildinfo`
- `.env.example` - documents `DASHBOARD_MODE` with no default
- `src/db/schema.ts` - all 13 Drizzle table definitions + inferred types
- `src/db/validation.ts` - Zod write-boundary schemas + `OVERRIDABLE_FIELDS` allow-list
- `src/db/paths.ts` - `assertMode()`/`resolveDbPath()` — the one place DASHBOARD_MODE maps to a path
- `src/db/migrate.ts` - `runMigrations()` + CLI entry (creates `data/` if missing)
- `tests/helpers/db.ts` - `createTestDb()` shared in-memory migrated DB fixture
- `tests/db/validation.test.ts` - override allow-list RED/GREEN test
- `tests/db/migrate.test.ts` - 13-table + path-resolution RED/GREEN test
- `drizzle/20260722211923_pale_zeigeist/migration.sql` - generated first migration
- `drizzle/20260722211923_pale_zeigeist/snapshot.json` - drizzle-kit schema snapshot
- `.planning/phases/01-schema-demo-mode-foundation/deferred-items.md` - logged out-of-scope npm audit findings

## Decisions Made
- Bumped `drizzle-orm`/`drizzle-kit` from the researched/pinned `0.45.x`/`0.31.x` stable line to `1.0.0-rc.4` — the stable line does not export `drizzle-orm/node-sqlite` at all (verified directly against the npm registry), and D-14's node:sqlite decision has no other path to fulfillment given better-sqlite3 is empirically broken on this machine. rc.4 was chosen deliberately (most mature pre-release, ~13-month-old beta/rc cycle, not a same-day snapshot) over `better-sqlite3` (already ruled out) or hand-rolling a driver adapter (unnecessary complexity). See Deviations below.
- Used the new single-object `drizzle({ client: sqlite })` constructor form required by drizzle-orm 1.0.0's node-sqlite driver (the two-argument `drizzle(sqlite, { schema })` form from the pinned research code no longer type-checks in this version).
- Added directory auto-creation (`mkdirSync`) to the migrate CLI since `node:sqlite`'s `DatabaseSync` does not create missing parent directories.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] drizzle-orm/drizzle-kit version bump: 0.45.x/0.31.x (pinned) → 1.0.0-rc.4**
- **Found during:** Task 2 (dependency install), confirmed before Task 3/4 implementation
- **Issue:** The plan/research pinned `drizzle-orm@0.45.x` and `drizzle-kit@0.31.x`, but the stable `0.45.2` release has no `drizzle-orm/node-sqlite` export at all — `npm view drizzle-orm@0.45.2` exports confirmed only `better-sqlite3`, `libsql`, `bun-sqlite`, etc., no `node-sqlite`. That subpath only appears starting in the `1.0.0` pre-release (beta/rc) track. Since D-14 explicitly locks in `node:sqlite` over `better-sqlite3` (which fails to install on this Windows machine, per CONTEXT.md/RESEARCH.md), Task 4's `migrate.ts`/`tests/helpers/db.ts` could not be implemented on the pinned version at all — a hard blocker, not a style preference.
- **Fix:** Pinned `drizzle-orm` and `drizzle-kit` to `1.0.0-rc.4` (same official package, no typosquat risk — verified directly via `npm view`; chosen over earlier betas because rc.4 sits ~13 months into a beta/rc cycle that began March 2025 and was published 2026-06-27, not a same-day dev snapshot). Adjusted two call sites for the resulting API changes: (a) `drizzle({ client: sqlite })` single-object constructor instead of the 0.45.x two-argument form; (b) dropped the `schema` config key (the sqlite-specific config type in 1.0.0 omits it — relational-query schema now goes through a separate `relations` config not needed at this phase since the domain layer uses `db.select()/.insert()`, not `db.query.*`).
- **Files modified:** package.json, src/db/migrate.ts, tests/helpers/db.ts
- **Verification:** `npx tsc --noEmit` exits 0; `npx vitest run` — 5/5 tests pass, including the 13-table migration assertion; `npx drizzle-kit generate` produced a valid migration applying all constraints correctly.
- **Committed in:** `88eb102` (package.json), `7f55f80` (migrate.ts, tests/helpers/db.ts)

**2. [Rule 2 - Missing Critical] Migration CLI creates the data/ directory if missing**
- **Found during:** Task 4 (migration runner implementation)
- **Issue:** `node:sqlite`'s `DatabaseSync` throws `unable to open database file` if the parent directory doesn't exist — verified directly. A first-ever `npm run db:migrate` on a fresh clone (no `data/` directory yet) would fail with a confusing native error instead of working, or would require a manual `mkdir` step the plan never mentions.
- **Fix:** Added `mkdirSync(dirname(dbPath), { recursive: true })` in `migrate.ts`'s CLI entry point before opening the `DatabaseSync` handle.
- **Files modified:** src/db/migrate.ts
- **Verification:** Ran `DASHBOARD_MODE=demo npx tsx src/db/migrate.ts` against a repo with no `data/` directory — it created `data/demo.sqlite` with all 13 tables successfully; artifact removed afterward (gitignored, not committed).
- **Committed in:** `7f55f80`

**3. [Rule 3 - Blocking, out of scope, logged not fixed] npm audit vulnerabilities in Next.js transitive deps**
- **Found during:** Task 2 (npm install)
- **Issue:** `npm audit` reports 1 moderate (postcss XSS) and 2 high (sharp/libvips CVEs) vulnerabilities, both transitive dependencies of the pinned `next@16.2.11`.
- **Fix:** Not fixed — out of scope per the deviation scope boundary (pre-existing in the locked Next.js version, not introduced by this task's own code/config; `npm audit fix --force` would force a breaking Next.js downgrade/upgrade outside this plan's remit). Logged to `.planning/phases/01-schema-demo-mode-foundation/deferred-items.md` for a future phase to revisit.
- **Files modified:** none (documentation only)
- **Committed in:** n/a (deferred-items.md tracked separately, not part of a task commit)

---

**Total deviations:** 2 auto-fixed (1 blocking version bump, 1 missing-critical directory creation), 1 logged-and-deferred (out of scope, not fixed)
**Impact on plan:** The version bump was necessary to fulfill the plan's own locked D-14 decision (node:sqlite) at all — without it, Task 4 could not have been implemented on any stable drizzle-orm release. No architectural change was made: same library, same schema patterns, same table shapes exactly as researched. No scope creep.

## Issues Encountered
- `drizzle-orm@0.45.2`'s stable release lacks `drizzle-orm/node-sqlite` — see Deviations #1. Resolved by version bump, not by reverting to `better-sqlite3` (already empirically ruled out) or hand-rolling a driver adapter.
- `node:sqlite` prints an `ExperimentalWarning: SQLite is an experimental feature` on every process start — expected, harmless, tracked as Assumption A1 in RESEARCH.md; no action needed.

## User Setup Required

None - no external service configuration required. (`DASHBOARD_MODE` is a required local env var but has no external service dependency; it's documented in `.env.example` and enforced fail-loud by `src/db/paths.ts`.)

## Next Phase Readiness

- `src/db/schema.ts`, `src/db/validation.ts`, `src/db/paths.ts`, `src/db/migrate.ts`, and `tests/helpers/db.ts` are the stable foundation every remaining Phase 1 plan (01-02 domain write/read functions, 01-03 demo seed, 01-04/01-05 liveness page) imports directly.
- The `drizzle-orm@1.0.0-rc.4`/`drizzle-kit@1.0.0-rc.4` version bump should be carried forward as the effective stack version for the rest of Phase 1 — do not re-pin to `0.45.x` in a later plan, as that would reintroduce the missing `node-sqlite` export.
- No blockers for 01-02. The one open risk to watch: `drizzle-orm`/`drizzle-kit` are pre-release (rc) software — if a later phase upgrades either package, re-verify the `node-sqlite` driver API surface hasn't shifted again before the 1.0.0 stable release.

## Self-Check: PASSED

All 15 declared artifact files verified present on disk; all 5 task commit hashes (`88eb102`, `de5e355`, `518b709`, `cc79140`, `7f55f80`) verified present in `git log --all`.

---
*Phase: 01-schema-demo-mode-foundation*
*Completed: 2026-07-22*
