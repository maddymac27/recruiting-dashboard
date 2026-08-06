---
phase: 01-schema-demo-mode-foundation
plan: 03
subsystem: database

tags: [drizzle-orm, node-sqlite, zod, vitest, event-sourcing]

# Dependency graph
requires:
  - phase: 01-01
    provides: Drizzle schema (applications, status_events, stages, companies, role_types, sources), Zod validation schemas, createTestDb() in-memory test harness
provides:
  - "createApplication / getApplicationDetail (src/domain/applications.ts) — captures all analysis dimensions in one applications row; outcome derived read-time from the current stage's outcome_label, never stored"
  - "appendStatusEvent (src/domain/events.ts) — append-only status_events insert with ON CONFLICT DO NOTHING on source_message_id, running recomputeCurrentStage in the same transaction"
  - "recomputeCurrentStage / rebuildAllProjections (src/domain/projections.ts) — sole writer of applications.current_stage_id/current_stage_since/last_inbound_event_at, ordered by occurred_at ASC, id ASC"
affects: [01-04, 01-05, phase-2-manual-capture-core-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Domain functions accept the Drizzle db/tx handle as first parameter (dependency injection) for unit-testability against the in-memory helper and reuse by the demo seed"
    - "recomputeCurrentStage(tx, applicationId) is the sole writer of the three materialized projection columns; appendStatusEvent always calls it in the same transaction as the event insert, even on a conflict no-op, so a retried caller never leaves the projection stale"
    - "Outcome is computed at read time from the current stage's outcome_label/is_terminal mapping — no outcome column exists on applications"

key-files:
  created:
    - src/domain/applications.ts
    - src/domain/events.ts
    - src/domain/projections.ts
    - tests/domain/applications.test.ts
    - tests/domain/events.test.ts
    - tests/domain/projections.test.ts
  modified: []

key-decisions:
  - "Followed the plan's build-safe commit ordering (applications -> projections -> events) rather than commit order matching task numbering (1, 2, 3), because events.ts imports recomputeCurrentStage from projections.ts and must not land before its dependency."
  - "TDD RED->GREEN commit granularity could not be reconstructed for this plan — see Deviations."

patterns-established:
  - "recomputeCurrentStage as the single projection writer, invoked transactionally from every event-appending call site"

requirements-completed: [DATA-01, DATA-02, DATA-03, DATA-06]

coverage:
  - id: D1
    description: "createApplication persists company/role title/role type/source/date applied in one row; getApplicationDetail derives outcome read-time from the current stage's outcome_label, with no stored outcome column (DATA-01)"
    requirement: "DATA-01"
    verification:
      - kind: unit
        ref: "tests/domain/applications.test.ts#captures all dimensions in one record, with outcome derived from the current stage"
        status: pass
      - kind: unit
        ref: "tests/domain/applications.test.ts#derives outcome from the current stage at read time — no stored outcome column exists"
        status: pass
    human_judgment: false
  - id: D2
    description: "appendStatusEvent stores status changes only as appended status_events rows (never an in-place update), and re-inserting an existing source_message_id is a no-op (DATA-02, DATA-06)"
    requirement: "DATA-02"
    verification:
      - kind: unit
        ref: "tests/domain/events.test.ts#append-only: two different events yield two rows, and neither is overwritten"
        status: pass
      - kind: unit
        ref: "tests/domain/events.test.ts#idempotent insert: re-inserting the same source_message_id creates no duplicate row (DATA-06)"
        status: pass
      - kind: unit
        ref: "tests/domain/events.test.ts#two manual events with NULL source_message_id both persist (SQLite treats NULLs as distinct)"
        status: pass
    human_judgment: false
  - id: D3
    description: "recomputeCurrentStage derives current stage from status_events ordered by occurred_at ASC, id ASC — reversed insertion order still resolves to the correct latest stage by real-world time (DATA-03)"
    requirement: "DATA-03"
    verification:
      - kind: unit
        ref: "tests/domain/projections.test.ts#derives current stage from occurred_at ordering, not insertion order (DATA-03)"
        status: pass
      - kind: unit
        ref: "tests/domain/projections.test.ts#uses id as a deterministic tiebreak when two events share the same occurred_at"
        status: pass
    human_judgment: false
  - id: D4
    description: "re-inserting a status event with an existing source_message_id is a no-op via ON CONFLICT DO NOTHING — no duplicate event, no duplicated projection change (DATA-06)"
    requirement: "DATA-06"
    verification:
      - kind: unit
        ref: "tests/domain/events.test.ts#idempotent insert: re-inserting the same source_message_id creates no duplicate row (DATA-06)"
        status: pass
    human_judgment: false

duration: unknown (interrupted mid-plan; recovery/finalization pass only)
completed: 2026-07-27
status: complete
---

# Phase 01 Plan 03: Event-Sourcing Core (Applications, Events, Projections) Summary

**Append-only status_events with ON CONFLICT DO NOTHING message-ID idempotency, and a single recomputeCurrentStage projection writer that derives current stage by occurred_at ordering, not insertion order — the two failure modes every prior tracker attempt died on.**

## Performance

- **Duration:** Not measurable — a prior executor session was interrupted after completing implementation and testing but before committing or writing this SUMMARY. This session performed verification, commit, and finalization only (recovery pass).
- **Completed:** 2026-07-27
- **Tasks:** 3 (all three completed by the prior session; verified and committed by this session)
- **Files modified:** 6 created (3 domain modules, 3 test files)

## Accomplishments
- `createApplication`/`getApplicationDetail` (`src/domain/applications.ts`) persist all six analysis dimensions (company, role title, role type, source, date applied, current stage) in one `applications` row, with `outcome` derived read-time from the current stage's `outcome_label`/`is_terminal` mapping — confirmed via `PRAGMA table_info(applications)` that no stored `outcome` column exists (DATA-01).
- `appendStatusEvent` (`src/domain/events.ts`) is genuinely append-only: it never updates a stage/status column on `applications` directly, inserting only a new `status_events` row and recomputing the projection in the same transaction (DATA-02). Re-inserting the same `source_message_id` (even three times) yields exactly one row via `onConflictDoNothing({ target: statusEvents.sourceMessageId })`, and the recompute still runs on a conflict no-op so a retried caller never leaves the projection stale (DATA-06).
- `recomputeCurrentStage`/`rebuildAllProjections` (`src/domain/projections.ts`) is the sole writer of `applications.current_stage_id`/`current_stage_since`/`last_inbound_event_at`, selecting events ordered by `occurred_at ASC, id ASC` — proven with a reverse-insertion-order test (a later-dated Rejected event appended before an earlier-dated Applied event still resolves to Rejected) and a same-timestamp id-tiebreak test (DATA-03).
- Full repo test suite: 15/15 passing (8 from 01-01/01-02, 7 new for 01-03). `npx tsc --noEmit` exits 0.

## Task Commits

Committed in build-safe dependency order (applications has no dependency on the other two; events.ts imports `recomputeCurrentStage` from projections.ts, so projections had to land no later than events):

1. **Task 1: createApplication — capture all analysis dimensions (DATA-01)** — `cd9407f` (feat)
2. **Task 3: recomputeCurrentStage — correct out-of-order derivation (DATA-03)** — `a4e6ca1` (feat)
3. **Task 2: appendStatusEvent — append-only + message-ID idempotency (DATA-02, DATA-06)** — `8c939f0` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP/REQUIREMENTS update)

## TDD Gate Compliance

**Not satisfied — see Deviations below.** The plan tagged all three tasks `tdd="true"`, but the prior executor session that wrote this code was interrupted after completing implementation and its tests (verified passing) but before making any commit. By the time this recovery session started, the implementation and its tests already coexisted as untracked files on disk — there was no way to reconstruct a failing-test-first commit, because the tests were never observed failing in this session's git history. Each file pair (implementation + test) was committed together as a single `feat` commit per task rather than a `test` (RED) commit followed by a `feat` (GREEN) commit. The behavior itself is still fully proven: all 7 new tests pass and encode the DATA-01/02/03/06 scenarios (out-of-order derivation, message-ID idempotency, append-only storage, derived outcome). This is a process/audit-trail gap, not a correctness gap.

## Files Created/Modified
- `src/domain/applications.ts` - `createApplication(db, input)` and `getApplicationDetail(db, id)`; outcome derived read-time from the joined current stage's `outcome_label`
- `src/domain/events.ts` - `appendStatusEvent(db, input)`: transactional append-only insert with `onConflictDoNothing` on `source_message_id`, calling `recomputeCurrentStage` in the same transaction
- `src/domain/projections.ts` - `recomputeCurrentStage(tx, applicationId)` (sole projection writer, ordered by `occurred_at ASC, id ASC`) and `rebuildAllProjections(db)` (repair path)
- `tests/domain/applications.test.ts` - seeds lookup vocab, asserts all dimensions round-trip and outcome is derived, not stored
- `tests/domain/events.test.ts` - append-only, idempotent-insert (DATA-06), and NULL-message-ID distinctness tests
- `tests/domain/projections.test.ts` - reverse-insertion-order derivation test (DATA-03) and same-timestamp id-tiebreak test

## Decisions Made
- Committed in dependency-safe order (applications, then projections, then events) rather than plan task-number order (1, 2, 3), since `events.ts` imports `recomputeCurrentStage` from `projections.ts` and must not be checked out ahead of that dependency.
- No architectural changes were made to the prior session's implementation — it was read in full, checked line-by-line against every must-have truth, acceptance criterion, and key-link in `01-03-PLAN.md`, and matched exactly. Nothing was rewritten.

## Deviations from Plan

### Process Deviation (not a correctness fix)

**1. [Recovery from interruption] TDD RED->GREEN commit granularity lost**
- **Found during:** Start of this recovery session
- **Issue:** The prior executor session for this plan was interrupted after writing all three domain modules and their tests (with `npx vitest run` already reporting 15/15 passing) but before making any git commit or writing `01-03-SUMMARY.md`. This session started with the finished, working code and tests sitting as untracked files on disk — there is no way to re-run a "RED" (failing-test) state through git history after the fact, because the tests never failed in a commit this session controls.
- **Fix:** None applied to code (nothing was broken). Committed the existing implementation + its test file together as one `feat(01-03): ...` commit per task, instead of the plan's intended `test` (RED) -> `feat` (GREEN) pair. Documented explicitly in this SUMMARY's TDD Gate Compliance section and in each commit message.
- **Files affected:** src/domain/applications.ts, src/domain/events.ts, src/domain/projections.ts, tests/domain/applications.test.ts, tests/domain/events.test.ts, tests/domain/projections.test.ts
- **Verification:** `npx vitest run` — 15/15 passing; `npx tsc --noEmit` — exit 0. All DATA-01/02/03/06 behaviors are exercised and pass.
- **Committed in:** `cd9407f`, `a4e6ca1`, `8c939f0`

---

**Total deviations:** 1 process deviation (TDD commit granularity lost to mid-plan interruption), 0 code deviations (implementation matched the plan exactly, nothing needed fixing).
**Impact on plan:** No impact on correctness or scope. The plan's must-have truths, acceptance criteria, and key-links (§frontmatter) are all satisfied and test-proven. The only loss is the audit trail of tests failing before implementation existed — the tests themselves still fully encode and prove each required behavior.

## Issues Encountered
- None beyond the interruption/recovery scenario described above. No bugs found during verification; the prior session's implementation matched the plan's must-haves and acceptance criteria exactly on first read.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `src/domain/applications.ts`, `src/domain/events.ts`, and `src/domain/projections.ts` are the stable event-sourcing core every later Phase 1 plan (demo seed, liveness/UI work) and Phase 2 (manual capture UI) will call directly.
- `recomputeCurrentStage` and `appendStatusEvent` are ready to be reused by the Phase 1 demo seed (01-04/01-05) and by the future Gmail-ingestion write path (Phase 3) without any interface changes.
- No blockers. One process note for future recovery scenarios: if an executor session is interrupted after tests already pass but before any commit, the TDD RED gate cannot be reconstructed after the fact — worth flagging to the orchestrator so interrupted sessions checkpoint more eagerly (e.g., commit immediately after each RED phase) in future runs.

## Self-Check: PASSED

All 6 declared artifact files verified present on disk (`src/domain/applications.ts`, `src/domain/events.ts`, `src/domain/projections.ts`, `tests/domain/applications.test.ts`, `tests/domain/events.test.ts`, `tests/domain/projections.test.ts`); all 3 task commit hashes (`cd9407f`, `a4e6ca1`, `8c939f0`) verified present in `git log --oneline`.

---
*Phase: 01-schema-demo-mode-foundation*
*Completed: 2026-07-27*
