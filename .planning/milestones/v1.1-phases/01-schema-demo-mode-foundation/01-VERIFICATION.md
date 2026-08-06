---
phase: 01-schema-demo-mode-foundation
verified: 2026-07-28T00:00:00Z
status: passed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 1: Schema + Demo Mode Foundation Verification Report

**Phase Goal (ROADMAP.md, system-facing):** The persistence foundation — event-sourced status history, company/contact/alias entities, correction overrides, and fail-loud queues — exists correctly, and demo/real data are structurally separated, before any UI or ingestion code is written.
**Phase Goal (01-01-PLAN.md, walking-skeleton reframing):** Open a running app whose event-sourced schema, correction/override model, and demo/real data swap are proven end-to-end by one live page.
**Verified:** 2026-07-28
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

This phase does not use MVP-mode User Story verification despite `Mode: mvp` in ROADMAP.md — the goal text is system-facing ("the persistence foundation... exists correctly"), not a `As a X, I want Y, so that Z.` user story, and 01-01-PLAN.md explicitly documents this as an intentional reframing for a walking-skeleton phase. Standard goal-backward verification was applied instead, per the task's explicit framing.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Inserting an application captures source, role type, company, date applied, current stage, and outcome in one record (DATA-01) | VERIFIED | `src/domain/applications.ts` `createApplication`/`getApplicationDetail`; `tests/domain/applications.test.ts` — asserts all dimensions round-trip and outcome is read-time derived (not a stored column; `PRAGMA table_info` assertion confirms no `outcome` column exists) |
| 2 | Status changes are stored only as new dated event rows; no code path updates a status field in place (DATA-02) | VERIFIED | `src/domain/events.ts` `appendStatusEvent` only inserts into `status_events` + calls `recomputeCurrentStage`; `tests/domain/events.test.ts` "append-only" test proves two events yield two rows, neither overwritten |
| 3 | Current stage is derived correctly even when events are inserted out of real-world order (DATA-03) | VERIFIED (behavioral) | `src/domain/projections.ts` `recomputeCurrentStage` orders by `occurred_at ASC, id ASC`; `tests/domain/projections.test.ts` genuinely appends a later-dated Rejected event BEFORE an earlier-dated Applied event and asserts the derived stage is Rejected — a true behavioral state-transition test, not a presence check |
| 4 | Two company name variants (e.g. Meta/Facebook) link as aliases resolving to one entity (DATA-04) | VERIFIED | `src/domain/companies.ts` `resolveCompany`/`addAlias`; `tests/domain/companies.test.ts` proves `resolveCompany('Facebook')` and `resolveCompany('meta')` both return the same company id, and alias-collision-with-canonical-name is rejected |
| 5 | A contact links to more than one job with dates preserved (DATA-05) | VERIFIED | `src/domain/contacts.ts` `linkContactToApplication`; `tests/domain/contacts.test.ts` "multi-job linkage" proves bidirectional 2×2 linkage with distinct `linked_at` values preserved per link |
| 6 | Re-inserting a message with the same message ID never creates a duplicate event or record (DATA-06) | VERIFIED (behavioral) | `status_events_source_message_id_unique` UNIQUE index (schema.ts, migration.sql) + `onConflictDoNothing` in `appendStatusEvent`; `tests/domain/events.test.ts` "idempotent insert" appends the same event 3x and asserts exactly 1 row survives; NULL-message-id distinctness also tested |
| 7 | A manually-set field value is stored separately from and takes precedence over any parser-derived value (DATA-07) | VERIFIED (behavioral) | `src/domain/overrides.ts` `setOverride`/`getMergedField` (explicit read-then-write, never `onConflictDoUpdate` on the composite key); `tests/domain/overrides.test.ts` "survives re-derive" sets an override then calls `getMergedField` with two different simulated derived values and asserts the override still wins both times |
| 8 | Toggling demo mode points every query at a completely separate, seeded SQLite file with no code path capable of mixing real and demo data (DEMO-01, DEMO-02) | VERIFIED | `src/db/client.ts` (sole DASHBOARD_MODE reader, `import "server-only"`, globalThis-cached), `src/db/paths.ts` (`assertMode`/`resolveDbPath`); `tests/db/client.test.ts` fail-loud + distinct-path + module-surface tests; `tests/db/seed.test.ts` source-scan proves `seed.ts` never references `resolveDbPath('real')`/`real.sqlite`; human-verified browser checkpoint (01-02-SUMMARY.md) recorded exact evidence: unset mode → HTTP 500 fail-loud, `DASHBOARD_MODE=real` → live count rendered and `/api/health` returned `{"ok":true,"mode":"real","applicationCount":0}` |
| 9 | Demo mode ships with a dense, invented (never-real) seed dataset (DEMO-01) | VERIFIED | `src/demo/seed/companies.ts` (17 invented companies, all 8 stages represented); `src/demo/seed/seed.ts` `seedDemo` replays fixtures through the real domain write path; `tests/db/seed.test.ts` asserts ≥15 companies, ≥5 distinct stages incl. Offer and Ghosted, ≥1 contact with ≥1 conversation |
| 10 | Migrations apply identically to both demo and real files (DEMO-03) | VERIFIED | `tests/db/schema-parity.test.ts` runs `runMigrations` against two independent temp files and asserts identical 13-table sets, both containing all expected tables |

**Score:** 10/10 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | 13 Drizzle tables with correct constraints | VERIFIED | All 13 tables present; UNIQUE on `status_events.source_message_id`, composite UNIQUE on `overrides(application_id, field_name)`, composite PK on `contact_applications`, no-default projection columns confirmed by direct read and cross-checked against generated `drizzle/20260722211923_pale_zeigeist/migration.sql` |
| `src/db/validation.ts` | Zod write-boundary schemas + override allow-list | VERIFIED | `OVERRIDABLE_FIELDS` allow-list + 5 input schemas present; no credential/secret fields |
| `src/db/paths.ts` | Fail-loud mode → path resolution | VERIFIED | `assertMode`/`resolveDbPath`, no default, single source of DASHBOARD_MODE→path mapping |
| `src/db/client.ts` | Sole DASHBOARD_MODE reader, server-only, globalThis singleton | VERIFIED | `import "server-only"` first line; exports exactly `{db, dashboardMode}`; test asserts module surface |
| `src/db/migrate.ts` | Shared migration runner | VERIFIED | `runMigrations` reused by test helper, seed scripts, and CLI |
| `tests/helpers/db.ts` | In-memory migrated test DB fixture | VERIFIED | `createTestDb()` used by all 8 domain/db test files |
| `src/domain/applications.ts`, `events.ts`, `projections.ts` | Event-sourcing core | VERIFIED | All present, substantive, wired; see Observable Truths 1-3, 6 |
| `src/domain/overrides.ts`, `companies.ts`, `contacts.ts` | Override/alias/contact-graph domain layer | VERIFIED | All present, substantive, wired; see Observable Truths 4, 5, 7 |
| `src/db/seed-lookups.ts`, `src/demo/seed/companies.ts`, `src/demo/seed/seed.ts` | Vocabulary + demo seed | VERIFIED | Idempotent lookup seeding; 17-company invented fixture set; structural real-store isolation confirmed by source scan test |
| `drizzle/20260722211923_pale_zeigeist/` | Generated migration | VERIFIED | `migration.sql` creates all 13 tables with matching constraints; applied cleanly in tests and via manual CLI exercise (per 01-01/01-02 SUMMARYs) |
| `.gitignore` | Protects real data/secrets before any data dir exists | VERIFIED | `git check-ignore` confirms `data/real.sqlite` and `.env` ignored; `.env.example` tracked; no `.sqlite`/`.env` file ever appears in `git log --all` |
| `src/app/page.tsx`, `src/app/api/health/route.ts` | Walking-skeleton liveness slice | VERIFIED | Both read exclusively through the `db`/`dashboardMode` singleton; human-verified end-to-end in a real browser (01-02-SUMMARY.md Task 3 checkpoint, developer-approved with quoted evidence) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `schema.ts` | `drizzle/*.sql` | `drizzle-kit generate` | WIRED | Migration file matches schema exactly (13 tables, matching constraints) |
| `events.ts` | `projections.ts` | `recomputeCurrentStage` called inside the same transaction as the event insert | WIRED | Confirmed by direct source read; test proves the projection updates atomically with the append |
| `page.tsx` / `api/health/route.ts` | `client.ts` | imports `db`/`dashboardMode`, no direct connection construction | WIRED | Confirmed by direct source read; no other module in `src/app` constructs a `DatabaseSync` |
| `client.ts` | `paths.ts` | `assertMode`/`resolveDbPath` | WIRED | Single call site, no duplication |
| `seed.ts` | `resolveDbPath('demo')` only | CLI entry point | WIRED, structurally isolated | Source-scan test (`tests/db/seed.test.ts`) confirms no reference to `resolveDbPath('real')` or `real.sqlite` anywhere in `seed.ts` |
| `getMergedField` | `overrides` table | read-then-write, override always wins | WIRED | No ingestion/derive code path reads `overrides` before writing — precedence enforced only at the read boundary, confirmed by source read of every domain write function |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| DATA-01 | 01-01, 01-03 | All analysis dimensions captured in one record | SATISFIED | Schema + `createApplication`/`getApplicationDetail` + test |
| DATA-02 | 01-01, 01-03 | Append-only status transitions | SATISFIED | `appendStatusEvent` + append-only test |
| DATA-03 | 01-01, 01-03 | Out-of-order-correct current-stage derivation | SATISFIED | `recomputeCurrentStage` + reverse-insertion-order behavioral test |
| DATA-04 | 01-01, 01-04 | Company alias resolution | SATISFIED | `resolveCompany`/`addAlias` + test |
| DATA-05 | 01-01, 01-04 | Multi-job contact linkage with dates preserved | SATISFIED | `linkContactToApplication` + multi-job-linkage test |
| DATA-06 | 01-01, 01-03 | Message-ID idempotency | SATISFIED | UNIQUE index + `onConflictDoNothing` + idempotent-insert test |
| DATA-07 | 01-01, 01-04 | Override precedence over parser-derived values | SATISFIED | `setOverride`/`getMergedField` + survives-re-derive test |
| DEMO-01 | 01-05 | Realistic seed dataset toggle | SATISFIED | `seedDemo` + 17-company fixture set + density test |
| DEMO-02 | 01-02, 01-05 | Structural demo/real separation | SATISFIED | `client.ts` sole-reader design + schema-parity/source-scan tests |
| DEMO-03 | 01-01, 01-02, 01-05 | Demo present from v1, schema parity | SATISFIED | `schema-parity.test.ts` + seed shipped in Phase 1 |

No orphaned requirements — all 10 IDs mapped to this phase in REQUIREMENTS.md are covered by at least one plan and independently confirmed against source.

### Load-Bearing Constraint Verification (per task instructions)

| Constraint | Status | Evidence |
|------------|--------|----------|
| FAIL-LOUD: unset/invalid DASHBOARD_MODE throws, no silent default; read in exactly one module | VERIFIED | `assertMode` throws on `undefined`/`"bogus"`; `client.ts` is the only module calling `resolveMode()`/reading `process.env.DASHBOARD_MODE` at runtime (migrate.ts/seed-lookups.ts/seed.ts CLI entry points also call `assertMode` directly from `process.env`, but these are standalone CLI scripts, not part of the app-runtime read path — each independently fail-loud, consistent with D-13's intent) |
| APPEND-ONLY event sourcing: status changes are new rows; `recomputeCurrentStage` is sole projection writer; derivation by `occurred_at ASC, id ASC` | VERIFIED | Confirmed by source read of `events.ts`/`projections.ts` (no other function updates `current_stage_id`/`current_stage_since`/`last_inbound_event_at`) and by the reverse-insertion-order behavioral test |
| IDEMPOTENCY: re-inserting an existing `source_message_id` is a no-op | VERIFIED | UNIQUE index + `onConflictDoNothing({target: statusEvents.sourceMessageId})`; 3x-insert test proves exactly 1 row survives |
| OVERRIDE model: read-time precedence via read-then-write; `field_name` constrained to allow-list | VERIFIED | `setOverride` uses explicit read-then-write (not `onConflictDoUpdate`); `overrideInput` Zod schema rejects any field outside `OVERRIDABLE_FIELDS`; allow-list-rejection test passes |
| DEMO/REAL structural separation: seed writes only demo store; physically separate files; schema parity | VERIFIED | `seed.ts` CLI resolves only `resolveDbPath("demo")`; source-scan test confirms no `real` reference; `schema-parity.test.ts` confirms identical 13-table schemas across two independent files |
| NO real personal data/secrets committed; `data/*.sqlite` and `.env` gitignored; no better-sqlite3; `node:sqlite` on Node ≥24 | VERIFIED | `git log --all -- "*.sqlite" "*.sqlite-*" ".env"` returns no commits; `.gitignore` confirmed via `git check-ignore`; `node_modules/better-sqlite3` absent (the `better-sqlite3` string in `package-lock.json` is only drizzle-orm's optional peer-dependency metadata, not an installed package); local Node is v24.14.1, matching `engines.node: ">=24"` |

### Documented Deviations — Judged

1. **drizzle-orm/drizzle-kit bumped to `1.0.0-rc.4`** (from pinned `0.45.x`/`0.31.x`), because the stable line has no `drizzle-orm/node-sqlite` export at all. This is a forced, well-documented, verifiable deviation (confirmed directly against the npm registry per 01-01-SUMMARY.md) — not a shortcut. `npx tsc --noEmit` and the full test suite both pass cleanly against this version, so it does not undermine the goal. Residual risk: pre-release software could shift its API surface before a 1.0.0 stable release — flagged in 01-01/01-02 SUMMARYs as a watch item for future phases, not a Phase 1 gap.
2. **01-03's TDD RED→GREEN commit granularity lost** because the original executor session was interrupted after implementation and tests already passed, before any commit. This is a pure process/audit-trail gap: the behaviors themselves (out-of-order derivation, idempotency, append-only storage) are still fully proven by passing tests written before the recovery session touched anything, independently re-confirmed here by reading and running those tests myself. Does not undermine the goal.

Neither deviation is a blocker. Both are transparently documented and their correctness impact is independently verified rather than taken on faith.

### Anti-Patterns Found

None. `grep` for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|not yet implemented|coming soon` across `src/db`, `src/domain`, `src/demo`, `src/app` returned zero matches.

### Behavioral Spot-Checks / Test Execution (run independently, not from SUMMARY claims)

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Typecheck | `npx tsc --noEmit` | exits 0, no output | PASS |
| Full test suite | `npx vitest run` | 11 test files, 32 tests, all passing | PASS |
| Out-of-order derivation (behavior-dependent truth) | `tests/domain/projections.test.ts` (included in full run) | Reverse-insertion-order test passes — asserts derived stage reflects `occurred_at`, not insertion order | PASS |
| Override survives-re-derive (behavior-dependent truth) | `tests/domain/overrides.test.ts` (included in full run) | Override value returned across two simulated re-derives with different values | PASS |
| Idempotent event insert (behavior-dependent truth) | `tests/domain/events.test.ts` (included in full run) | 3x insert of same `source_message_id` yields exactly 1 row | PASS |
| Schema parity across two files | `tests/db/schema-parity.test.ts` (included in full run) | Two independently migrated temp files produce identical 13-table sets | PASS |
| gitignore protection | `git check-ignore data/real.sqlite .env` | both succeed | PASS |
| No real data/secrets ever committed | `git log --all -- "*.sqlite" "*.sqlite-*" ".env"` | empty | PASS |
| No better-sqlite3 installed | `ls node_modules/better-sqlite3` | not found | PASS |
| Node version matches engines constraint | `node --version` → v24.14.1 vs `engines.node: ">=24"` | matches | PASS |

### Human Verification Required

None outstanding. The one item requiring a real browser (walking-skeleton liveness page + health route + fail-loud unset-mode behavior) was already executed as a blocking-human checkpoint during 01-02's own execution, with specific quoted evidence recorded in 01-02-SUMMARY.md (exact error message, exact JSON response body) and developer approval. No contradicting evidence was found during this verification pass, so it is not re-flagged as an open item.

### Gaps Summary

None. All 10 must-have truths (mapped 1:1 to DATA-01..07 and DEMO-01..03) are independently verified against the actual source code and a fresh, self-run test suite — not inferred from SUMMARY.md narrative. Both documented deviations were judged non-blocking with independent evidence. The phase goal — a persistence foundation with event-sourcing, override precedence, and demo/real structural separation, proven end-to-end by a live page — is achieved.

**Minor documentation note (non-blocking):** ROADMAP.md's progress table still lists Phase 1 as "In Progress" with plan checkboxes marked `[x]` but the phase-level checkbox at the top of the Phases list (`- [ ] **Phase 1: ...**`) unchecked. This is a bookkeeping item for whoever runs the next roadmap-update step, not a gap in the phase's actual deliverable.

---

*Verified: 2026-07-28*
*Verifier: Claude (gsd-verifier)*
