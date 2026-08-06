---
phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
plan: 01
subsystem: database
tags: [drizzle, sqlite, zod, googleapis, mailparser, html-to-text, schema-migration]

# Dependency graph
requires:
  - phase: 01-foundation-data-model
    provides: review_queue and dead_letter structural stub tables (D-15), Drizzle + zod conventions
provides:
  - ingested_messages dedup ledger (unique on message_id) — DATA-06 / D3-06
  - sync_runs history table — REL-03
  - review_queue extended with type/sender/subject/body_text/parsed_*/resolved_at
  - dead_letter extended with type/status/sender/subject/resolved_at
  - parsedEmailResult, newReviewQueueEntryInput, newDeadLetterEntryInput, newSyncRunInput zod schemas
  - googleapis, mailparser, html-to-text installed and vetted
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07, 03-08, 03-09, 03-10]

# Tech tracking
tech-stack:
  added: [googleapis@^173.0.0, mailparser@^3.9.14, html-to-text@^10.0.0]
  patterns:
    - "Additive-migration-safe nullable columns: new discriminator/display columns are nullable at the DB level; required-ness is enforced only in zod, so an ALTER TABLE ADD COLUMN never conflicts with existing rows in a possibly-non-empty real.sqlite"
    - "Dedup ledger via uniqueIndex on a natural key (message_id), mirroring the existing status_events.source_message_id unique-index pattern"

key-files:
  created:
    - drizzle/20260730193220_silent_aqueduct/migration.sql
    - drizzle/20260730193220_silent_aqueduct/snapshot.json
  modified:
    - src/db/schema.ts
    - src/db/validation.ts
    - package.json
    - package-lock.json

key-decisions:
  - "Package legitimacy checkpoint (Task 1, gate=blocking-human) was surfaced and NOT auto-approved; human explicitly verified googleapis/google-auth-library/mailparser/html-to-text publisher identity on npmjs.com before any install ran"
  - "Ran non-breaking `npm audit fix` for googleapis's transitive dependency chain (brace-expansion/minimatch/glob/rimraf/gaxios/googleapis-common); it reported fixable but did not actually change resolved versions because googleapis-common@8.0.3 pins an exact gaxios@7.1.3 range in its own manifest — no non-breaking fix currently exists upstream"
  - "Declined `npm audit fix --force` — it would downgrade next to 9.3.3 (a major breaking regression across the entire app) to address unrelated pre-existing next/postcss/sharp advisories; out of scope for this plan and far too destructive for a transitive-dependency hygiene issue"

requirements-completed: [REL-01, REL-02, REL-03]

coverage:
  - id: D1
    description: "review_queue and dead_letter extended with discriminator (type) and display (sender/subject/body_text/parsed_*/resolved_at) columns needed by the fail-loud queues"
    requirement: "REL-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: other
        ref: "grep -c ingested_messages src/db/schema.ts >= 1; grep -c sync_runs src/db/schema.ts >= 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "ingested_messages dedup ledger uniquely keys each Gmail message id (DATA-06 / D3-06); sync_runs records started/finished/status/counts for a sync"
    requirement: "REL-03"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: other
        ref: "npm run db:migrate (DASHBOARD_MODE=real) applied cleanly to data/real.sqlite"
        status: pass
    human_judgment: false
  - id: D3
    description: "parsedEmailResult, newReviewQueueEntryInput, newDeadLetterEntryInput, newSyncRunInput zod schemas mirror the new column shapes"
    requirement: "REL-02"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D4
    description: "One additive Drizzle migration generated; neither existing migration folder edited; only googleapis/mailparser/html-to-text installed, behind an approved blocking-human legitimacy checkpoint"
    requirement: "REL-01"
    verification:
      - kind: other
        ref: "git status --short drizzle/20260728222830_bent_lester drizzle/20260729174433_nifty_alice (empty output = untouched)"
        status: pass
      - kind: other
        ref: "node package.json dependency check — only googleapis, mailparser, html-to-text added"
        status: pass
    human_judgment: true
    rationale: "The package-legitimacy checkpoint approval itself was a human judgment call (publisher verification on npmjs.com) — recorded here for audit traceability even though the resulting file-state checks are automated."

duration: 25min
completed: 2026-07-30
status: complete
---

# Phase 3 Plan 01: Persistence Foundation + Vetted Package Install Summary

**Extended review_queue/dead_letter with fail-loud discriminator columns, added ingested_messages dedup ledger + sync_runs history tables, four new zod schemas, one additive migration, and three human-vetted npm packages (googleapis, mailparser, html-to-text).**

## Performance

- **Duration:** ~25 min (across two sessions, split by the blocking-human checkpoint)
- **Started:** 2026-07-30 (Task 1 checkpoint surfaced)
- **Completed:** 2026-07-30T19:35:38Z
- **Tasks:** 2/2 (Task 1 checkpoint + Task 2 auto)
- **Files modified:** 6 (package.json, package-lock.json, src/db/schema.ts, src/db/validation.ts, plus 2 new migration files)

## Accomplishments
- `review_queue` extended with `type`, `sender`, `subject`, `body_text`, `parsed_company`, `parsed_role_title`, `parsed_stage_label`, `parsed_event_date`, `resolved_at` (all nullable at DB level; required-ness enforced in zod)
- `dead_letter` extended with `type`, `status` (NOT NULL default `pending`), `sender`, `subject`, `resolved_at`
- New `ingested_messages` table with a unique index on `message_id` — the dedup ledger DATA-06/D3-06 depends on
- New `sync_runs` table tracking started/finished time, running/success/failed status, and new/review/dead-letter counts
- Four new zod schemas in `src/db/validation.ts`: `parsedEmailResult`, `newReviewQueueEntryInput`, `newDeadLetterEntryInput`, `newSyncRunInput` (plus their enum constants and inferred types)
- One additive migration (`20260730193220_silent_aqueduct`) generated and applied cleanly to `data/real.sqlite`; both prior migration folders verified untouched
- `googleapis`, `mailparser`, `html-to-text` installed after an explicit human-verified package-legitimacy checkpoint (gate=blocking-human, never auto-approved)

## Task Commits

Each task was committed atomically:

1. **Task 1: Package legitimacy checkpoint** - no commit (checkpoint only; nothing to install/build until approved)
2. **Task 2a: Install approved packages** - `1488ab0` (feat) — installs googleapis/mailparser/html-to-text, runs non-breaking `npm audit fix`
3. **Task 2b: Extend schema + validation + migration** - `e966544` (feat) — schema.ts/validation.ts extensions, new migration generated and applied

**Plan metadata:** (this commit, following SUMMARY write)

## Files Created/Modified
- `src/db/schema.ts` - Extended `reviewQueue`/`deadLetter`; added `ingestedMessages`/`syncRuns` tables + their inferred types
- `src/db/validation.ts` - Added `parsedEmailResult`, `newReviewQueueEntryInput`, `newDeadLetterEntryInput`, `newSyncRunInput` zod schemas
- `package.json` / `package-lock.json` - Added `googleapis`, `mailparser`, `html-to-text`
- `drizzle/20260730193220_silent_aqueduct/migration.sql` - New additive migration (2 new tables, 5 + 5 new columns)
- `drizzle/20260730193220_silent_aqueduct/snapshot.json` - Drizzle-kit schema snapshot for the new migration

## Decisions Made
- Package-legitimacy checkpoint enforced strictly per `gate="blocking-human"` — the executor stopped before Task 2 and returned a structured checkpoint; only proceeded after an explicit "approved" message reporting the human's npmjs.com verification of all four package identities.
- Kept all new review_queue/dead_letter/ingested_messages/sync_runs columns nullable at the DB level (per plan instruction) so the additive migration is guaranteed safe against a non-empty `real.sqlite`; correctness is enforced by the new zod schemas at the write boundary instead.
- Declined `npm audit fix --force` (see Deviations) — would have downgraded `next` to a pre-App-Router-era version to address unrelated, pre-existing advisories.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale "no write path this phase" comment on review_queue/dead_letter section header**
- **Found during:** Task 2 (schema extension)
- **Issue:** The existing section-header comment above `reviewQueue`/`deadLetter` read "Structural-only stubs (D-15) — no write path this phase," which becomes inaccurate the moment Phase 3 adds the write path these tables were stubbed for.
- **Fix:** Updated the comment to describe the Phase 1 stub → Phase 3 extension history accurately.
- **Files modified:** `src/db/schema.ts`
- **Verification:** `npx tsc --noEmit` passes; comment-only change, no behavior impact.
- **Committed in:** `e966544` (Task 2 commit)

### Notes on Acceptance Criteria Wording

**1. [Spec discrepancy, not a code issue] Task 2's literal grep-count criterion undercounts by design**
- **Found during:** Task 2 acceptance-criteria verification
- **Issue:** The plan's stated criterion `grep -Ec "parsedEmailResult|newReviewQueueEntryInput|newDeadLetterEntryInput|newSyncRunInput" src/db/validation.ts` returns 4` undercounts: each schema name matches two lines (the `export const` declaration and the `export type ... = z.infer<typeof ...>` line), for 8 total matching lines across 4 schemas — matching the codebase's own pre-existing convention (verified: `grep -c "newStatusEventInput" src/db/validation.ts` on the existing, unmodified `newStatusEventInput` schema also returns 2).
- **Resolution:** Followed the plan's explicit instruction ("Export z.infer types for each") and the established codebase convention rather than the miscounted literal grep target. Verified via per-name match count (each of the 4 names present, 2 lines each) and `npx tsc --noEmit` passing.
- **Files modified:** none beyond the planned `src/db/validation.ts` change
- **Committed in:** `e966544` (Task 2 commit)

### Deferred / Out of Scope

**1. [Deferred - transitive dependency vulnerabilities] googleapis pulls in a pinned-vulnerable gaxios via googleapis-common**
- **Found during:** Task 2a (install)
- **Issue:** `npm audit` reports 9 high-severity advisories after install. Of these, `brace-expansion`/`minimatch`/`glob`/`rimraf`/`gaxios`/`googleapis-common` form a transitive chain rooted in `googleapis-common@8.0.3`'s exact-pinned `gaxios@7.1.3` dependency (not a caret range) — `npm audit fix` reports these as fixable but cannot actually resolve them because the parent package's own manifest pins the vulnerable version. The remaining three (`next`, `postcss`, `sharp`) are pre-existing (unrelated to this plan's changes) and only resolvable via `npm audit fix --force`, which would downgrade `next` to `9.3.3` — a major breaking regression.
- **Action:** Not auto-fixed (no safe fix exists upstream yet for the googleapis chain; the next/postcss/sharp chain is out of scope and its only "fix" is destructive). Logged here for visibility; re-run `npm audit` after `googleapis` or its dependencies publish an update.
- **Files affected:** none (no code change possible without an upstream release)
- **Verification:** `npm audit` re-run confirms the same 9 advisories remain, all attributable to pinned transitive ranges or out-of-scope pre-existing packages.

**2. [Deferred - stray leftover directory, out of scope] `.claude/worktrees/hopeful-mestorf-9a8ba0/` duplicate test files**
- **Found during:** post-Task-2 verification (`npx vitest run`)
- **Issue:** An untracked leftover directory `.claude/worktrees/hopeful-mestorf-9a8ba0/` (likely from a prior parallel-worktree execution that was never cleaned up) contains a stale copy of `tests/`. Vitest's default discovery picks these up alongside the real `tests/` directory, producing 4 duplicate-path test failures unrelated to any change in this plan.
- **Action:** Not touched — deleting arbitrary directories outside this task's scope is prohibited (destructive-git/scope-boundary rules). Confirmed via `npx vitest run tests/ --exclude ".claude/**"` that all 55 real tests pass cleanly (15/15 files).
- **Files affected:** none
- **Verification:** `npx vitest run tests/ --exclude ".claude/**"` → 15 files, 55 tests, all passing.

---

**Total deviations:** 1 auto-fixed (doc/comment accuracy), 1 spec-wording discrepancy resolved in favor of plan intent + codebase convention, 2 deferred (transitive dependency vulnerability with no safe fix available; unrelated stray leftover directory)
**Impact on plan:** No scope creep. The doc fix is cosmetic; the acceptance-criteria discrepancy is a plan-authoring miscount, not a code defect. Both deferred items are pre-existing/upstream issues confirmed not to affect this plan's deliverables — the real test suite (55 tests) and typecheck pass cleanly.

## Issues Encountered
None beyond the two deferred items documented above.

## User Setup Required
None - no external service configuration required. (Gmail OAuth client setup is a later Phase 3 plan.)

## Next Phase Readiness
- The persistence foundation (`ingested_messages`, `sync_runs`, extended `review_queue`/`dead_letter`, and the four zod schemas) is in place for every downstream Phase 3 plan to write against.
- `googleapis`, `mailparser`, `html-to-text` are installed and ready for the Gmail OAuth/fetch/parse plans (03-02 onward).
- Known upstream transitive-dependency advisories (googleapis-common's pinned gaxios chain) should be periodically re-checked with `npm audit` as no local fix exists yet.

---
*Phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing*
*Completed: 2026-07-30*

## Self-Check: PASSED

All claimed files verified present on disk (src/db/schema.ts, src/db/validation.ts, package.json, drizzle/20260730193220_silent_aqueduct/migration.sql, drizzle/20260730193220_silent_aqueduct/snapshot.json, this SUMMARY.md). Both task commits (`1488ab0`, `e966544`) verified present in `git log`.
