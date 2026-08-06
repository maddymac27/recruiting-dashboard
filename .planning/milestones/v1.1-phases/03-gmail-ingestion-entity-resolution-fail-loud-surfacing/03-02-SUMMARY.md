---
phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
plan: 02
subsystem: database
tags: [drizzle, node-sqlite, zod, overrides, read-model]

# Dependency graph
requires:
  - phase: 01-persistence-foundation
    provides: "overrides table + setOverride/getMergedField (DATA-07) and OVERRIDABLE_FIELDS allow-list"
  - phase: 03-01
    provides: "Phase 3 schema foundation (sync_runs, ingested_messages, review/dead-letter columns)"
provides:
  - "getApplicationDetail returns override-merged values for all six OVERRIDABLE_FIELDS"
  - "CAP-03 is now verifiable: a manual correction survives a re-parse of the same application"
affects: [03-gmail-ingestion-entity-resolution-fail-loud-surfacing, board-read-model]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-path override merge: every OVERRIDABLE_FIELDS display value passed through getMergedField(db, id, fieldName, derivedValue) before returning from a detail read function"

key-files:
  created: []
  modified:
    - src/domain/applications.ts
    - tests/domain/applications.test.ts

key-decisions:
  - "date_applied is bridged through an ISO-string round trip (overrides store text; the field is a Date on ApplicationDetail) rather than adding a second override storage type"
  - "outcome stays derived from the raw (unmerged) currentStageId/stages.outcomeLabel join per the plan's explicit instruction — only the display label is override-merged, not the outcome computation"

patterns-established:
  - "Detail read functions call getMergedField per overridable field at the return boundary; they never query the overrides table directly or re-implement precedence"

requirements-completed: [CAP-03]

coverage:
  - id: D1
    description: "getApplicationDetail merges each of the six OVERRIDABLE_FIELDS (company, role_title, role_type, source, date_applied, current_stage) through getMergedField before returning"
    requirement: "CAP-03"
    verification:
      - kind: unit
        ref: "tests/domain/applications.test.ts#CAP-03 override precedence in read path > override on current_stage wins over the derived stage, and survives a simulated re-parse"
        status: pass
      - kind: unit
        ref: "tests/domain/applications.test.ts#CAP-03 override precedence in read path > override on company is returned by getApplicationDetail.companyName even after a field write"
        status: pass
      - kind: unit
        ref: "tests/domain/applications.test.ts#CAP-03 override precedence in read path > with no override set, getApplicationDetail returns the derived value unchanged"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-07-30
status: complete
---

# Phase 3 Plan 02: CAP-03 Read-Path Override Wiring Summary

**Wired the existing `getMergedField` override-precedence function into `getApplicationDetail`, closing the RESEARCH-flagged CRITICAL gap where a stored manual correction was never actually displayed.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-30T19:43:56Z
- **Completed:** 2026-07-30T19:47:50Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `getApplicationDetail` now merges all six `OVERRIDABLE_FIELDS` (company, role_title, role_type, source, date_applied, current_stage) through `getMergedField` before returning, so a saved override always wins over the derived/joined column value
- Proved via test that the correction survives a simulated re-parse: after `appendStatusEvent` moves the underlying projection to a new stage, `getApplicationDetail` still reports the overridden stage label
- No write-path changes — ingestion/derive code still never consults the `overrides` table; only the read path calls `getMergedField`, preserving the single-source-of-precedence design (DATA-07)

## Task Commits

Each task was committed atomically:

1. **Task 1: Failing CAP-03 test — override survives a re-parse** - `8b76710` (test)
2. **Task 2: Wire getMergedField into getApplicationDetail (GREEN)** - `932a8e9` (feat)

**Plan metadata:** (this commit)

_TDD RED→GREEN cycle: Task 1 confirmed failing (2 assertions failed against unmodified `getApplicationDetail`) before Task 2 made them pass._

## Files Created/Modified
- `src/domain/applications.ts` - `getApplicationDetail` now imports `getMergedField` from `./overrides` and merges companyName, roleTitle, roleTypeLabel, sourceLabel, dateApplied, and currentStageLabel through it before returning; outcome computation left unchanged (derived from the raw, unmerged current stage join, per plan instruction)
- `tests/domain/applications.test.ts` - New `describe("CAP-03 override precedence in read path")` block with three tests: stage-override survives a simulated re-parse, company-override survives an unrelated field write, and a no-override control case proving no regression

## Decisions Made
- **date_applied bridging:** overrides store `valueText: string | null`, but `ApplicationDetail.dateApplied` is `Date | null`. Passed the derived date as `rest.dateApplied?.toISOString() ?? null` into `getMergedField`, then converted a non-null merged result back to a `Date` — avoids adding a second override value type or touching the overrides schema.
- **outcome stays derived from the raw stage:** the plan explicitly said to keep `outcomeLabel ?? "Active"` unchanged. `outcome` is computed from `stages.outcomeLabel` joined via the application's actual `currentStageId`, not from the merged `currentStageLabel` string — so an override on `current_stage` changes the displayed label but not the computed outcome category. This matches the plan's instruction and DATA-01's "outcome is never stored, always derived" invariant; it does mean a stage-label override and the outcome badge could theoretically diverge, which is accepted as the plan's explicit choice, not a bug.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test's re-parse event date to be chronologically after the Saved event**
- **Found during:** Task 2 (running the CAP-03 test against the new implementation)
- **Issue:** The Task 1 test hardcoded the simulated re-parse event's `occurredAt` to `2026-02-01`, which is earlier than the Saved event's `occurredAt` (`new Date()` at quickSave time, i.e. the real current date). `recomputeCurrentStage` orders by `occurredAt` ASC (DATA-03, out-of-order derivation), so the earlier-dated "Rejected" event never became the current stage — the projection assertion (`rawRow?.currentStageId === rejectedStageId`) failed even though the override-merge code itself was correct.
- **Fix:** Changed the re-parse event's `occurredAt` to `new Date(Date.now() + 60_000)` — strictly after the Saved event's timestamp — so the projection actually advances to Rejected before asserting the override still overrides it.
- **Files modified:** tests/domain/applications.test.ts
- **Verification:** Full test file green (11/11), full domain suite green (40/40)
- **Committed in:** 932a8e9 (Task 2 commit, alongside the GREEN implementation)

---

**Total deviations:** 1 auto-fixed (1 bug — test date ordering, not an implementation defect)
**Impact on plan:** No scope creep; the fix was to the plan's own test fixture data, required to make the test actually exercise DATA-03's occurred-time ordering rule correctly.

## Issues Encountered
None beyond the test-date deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CAP-03 is now verifiable end-to-end for any override write via the existing `setOverride` path — the next Gmail-ingestion plans in this phase can rely on read-time precedence being correctly enforced without any further wiring
- Scope was deliberately limited to `getApplicationDetail` per the plan; the board read model (`src/domain/board.ts` or equivalent) was not touched — if a future plan surfaces overridable fields on the board view, it will need its own `getMergedField` wiring, following the same pattern established here
- `npx tsc --noEmit` clean; full `tests/domain` suite green (40/40 tests, 8 files)

---
*Phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing*
*Completed: 2026-07-30*

## Self-Check: PASSED

- FOUND: src/domain/applications.ts
- FOUND: tests/domain/applications.test.ts
- FOUND: .planning/phases/03-gmail-ingestion-entity-resolution-fail-loud-surfacing/03-02-SUMMARY.md
- FOUND: 8b76710
- FOUND: 932a8e9
