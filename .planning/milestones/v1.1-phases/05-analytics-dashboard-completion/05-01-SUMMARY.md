---
phase: 05-analytics-dashboard-completion
plan: 01
subsystem: ui
tags: [nextjs, drizzle, node-sqlite, vitest, staleness-predicate, read-model]

requires:
  - phase: 04-incremental-sync-automatic-scheduling
    provides: applications.currentStageSince maintained by recomputeCurrentStage, the Ghosted terminal stage seeded in Phase 1
provides:
  - "src/lib/application-staleness.ts — the sole per-stage gone-quiet/saved-nudge threshold predicate (D5-08)"
  - "src/domain/today.ts — getTodayItems/getStalenessByApplication, the Today-view read model composing the D5-01 activity clock"
  - "The Today view (/) as the new landing page; the Pipeline board moved to /board (D5-04)"
  - "Optional trigger prop on StageChangeDialog/ContactConversationForm for future reuse with a custom labeled trigger"
affects: [05-02-board-card-gone-quiet-overlay, 05-03-analytics-view]

tech-stack:
  added: []
  patterns:
    - "Pure staleness predicate mirroring src/lib/staleness.ts (named threshold constants, now: Date = new Date() default param, null-safe short-circuit)"
    - "TypeScript-side reduction over a flat select (never SQL GROUP BY) for the D5-01 clock and the today read model"
    - "Optional `trigger?: ReactNode` prop on a client dialog component so a second surface can supply its own labeled trigger without duplicating dialog/Server Action logic"

key-files:
  created:
    - src/lib/application-staleness.ts
    - src/domain/today.ts
    - src/app/board/page.tsx
    - src/app/board/loading.tsx
    - src/components/today-list.tsx
    - tests/lib/application-staleness.test.ts
    - tests/domain/today.test.ts
  modified:
    - src/domain/board.ts
    - src/domain/contacts.ts
    - src/app/page.tsx
    - src/app/loading.tsx
    - src/components/nav-shell.tsx
    - src/components/stage-change-dialog.tsx
    - src/components/contact-conversation-form.tsx

key-decisions:
  - "Added an optional `trigger?: ReactNode` prop to StageChangeDialog and ContactConversationForm (not in the plan's files_modified list) so the Today view can render UI-SPEC's labeled 'Change stage'/'Log a follow-up' buttons while every existing call site keeps its original icon-only/'Log Contact' trigger unchanged — avoids duplicating dialog/Server Action logic in a second component"
  - "Moved src/app/loading.tsx to src/app/board/loading.tsx alongside the page move, and added a new row-shaped src/app/loading.tsx for the Today view, to satisfy the plan's own Today-view Skeleton-loading backstop truth"
  - "Contact summaries for the 'Log a follow-up' dialog are fetched per gone-quiet row (bounded by the already-filtered flagged-item count), not via a new cross-application aggregate — same single-application lookup the job-detail page already makes, just scoped to a small subset"

patterns-established:
  - "Optional custom `trigger` prop pattern for reusable dialog components — lets a second surface supply its own labeled trigger without forking the dialog"

requirements-completed: [DASH-01, DASH-03]

coverage:
  - id: D1
    description: "Pure getStalenessStatus predicate with per-stage GONE_QUIET_THRESHOLDS_DAYS (Applied 14/Screen 10/Interview 10) and SAVED_NUDGE_THRESHOLD_DAYS 7, inclusive >= boundary, terminal short-circuit keyed on isTerminal, Math.floor daysSince rounding"
    requirement: "DASH-01"
    verification:
      - kind: unit
        ref: "tests/lib/application-staleness.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Today-view read model (getTodayItems) composes the D5-01 max(currentStageSince, latest conversation) clock, excludes terminal stages, performs no writes, and orders daysSince desc / id asc"
    requirement: "DASH-01"
    verification:
      - kind: integration
        ref: "tests/domain/today.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "DASH-03: Ghosted (and every other terminal stage) is never auto-flagged gone-quiet regardless of activity age — Ghosted remains a manual terminal stage the user sets"
    requirement: "DASH-03"
    verification:
      - kind: unit
        ref: "tests/lib/application-staleness.test.ts#terminal stage %s is never flagged"
        status: pass
      - kind: integration
        ref: "tests/domain/today.test.ts#never flags a terminal (Ghosted) app regardless of age"
        status: pass
    human_judgment: false
  - id: D4
    description: "Route restructure (D5-04): Today view at /, Pipeline board moved verbatim to /board, nav-shell lists Today/Pipeline/Analytics/Review/Dead-letter with correct active-state pathname checks"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit -p tsconfig.json"
        status: pass
    human_judgment: true
    rationale: "Active-link highlighting and page rendering at each route require visual/browser confirmation — type-checking proves the code compiles but not that the UI renders correctly; phase UAT covers this per the plan's own Manual verification note."
  - id: D5
    description: "Inline row actions (D5-05): gone-quiet rows expose 'Log a follow-up' (ContactConversationForm) + 'Change stage' (StageChangeDialog) + click-through to /job/{id}; saved-nudge rows expose only 'Change stage' + click-through; no snooze/dismiss control anywhere"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit -p tsconfig.json"
        status: pass
    human_judgment: true
    rationale: "Dialog wiring and button placement are visually/interactively verified, not covered by an automated test in this plan's Wave 0 scope — phase UAT covers this per the plan's own Manual verification note."

duration: 25min
completed: 2026-08-03
status: complete
---

# Phase 5 Plan 01: Today View + Staleness Predicate + Route Restructure Summary

**A shared per-stage gone-quiet/saved-nudge predicate, a Today-view read model composing the D5-01 activity clock, and a route restructure moving the Pipeline board from `/` to `/board` behind a new Today landing page.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-03T16:16:00Z (approx.)
- **Completed:** 2026-08-03T16:23:27-05:00
- **Tasks:** 3 completed
- **Files modified:** 12 (7 new, 5 modified — see key-files)

## Accomplishments
- `src/lib/application-staleness.ts` — the sole pure predicate for gone-quiet/saved-nudge status, mirroring `src/lib/staleness.ts`'s pattern, with the exact D5-02 per-stage thresholds and inclusive `>=` boundary
- `src/domain/today.ts` — `getTodayItems`/`getStalenessByApplication` compose the D5-01 activity clock (`max(currentStageSince, latest conversation)`) over the existing board/contacts read models, with zero new SQL aggregates
- Route restructure landed atomically: `src/app/board/page.tsx` (Pipeline, moved verbatim) and a brand-new `src/app/page.tsx` (Today view) with `nav-shell.tsx` updated in the same commit, avoiding a broken intermediate nav state
- `src/components/today-list.tsx` renders the two Today sections with stage + urgency badges and the two D5-05 inline actions, reusing the existing `changeStageAction`/`logConversationAction` Server Actions verbatim

## Task Commits

Each task was committed atomically:

1. **Task 1: Failing tests for the staleness predicate + today read model (RED)** - `5c14f84` (test)
2. **Task 2: Pure predicate + D5-01 clock halves + today read model (GREEN)** - `fca9711` (feat)
3. **Task 3: Route restructure + Today page + inline actions + nav (D5-04, D5-05)** - `3c0fd70` (feat)

_TDD tasks 1-2 form the RED→GREEN pair for the staleness predicate and today read model; task 3 is a single non-TDD `auto` task per the plan._

## Files Created/Modified
- `src/lib/application-staleness.ts` - pure `getStalenessStatus` predicate, `GONE_QUIET_THRESHOLDS_DAYS`/`SAVED_NUDGE_THRESHOLD_DAYS` constants
- `src/domain/today.ts` - `getTodayItems`/`getStalenessByApplication`, `TodayItem` interface
- `src/domain/board.ts` - `BoardApplication` gains `currentStageSince: Date | null`
- `src/domain/contacts.ts` - new `getLatestConversationDateByApplication` (flat select + TS reduce)
- `src/app/board/page.tsx` - Pipeline board, moved verbatim from `src/app/page.tsx`
- `src/app/board/loading.tsx` - Pipeline loading skeleton, moved verbatim
- `src/app/page.tsx` - NEW Today view Server Component
- `src/app/loading.tsx` - NEW row-shaped Today loading skeleton
- `src/components/today-list.tsx` - NEW Section A/B row renderer with inline actions
- `src/components/nav-shell.tsx` - activates Today/Analytics links, reorders nav, updates active-state checks
- `src/components/stage-change-dialog.tsx` - adds optional `trigger` prop
- `src/components/contact-conversation-form.tsx` - adds optional `trigger` prop
- `tests/lib/application-staleness.test.ts` - 11 tests, threshold/boundary/terminal coverage
- `tests/domain/today.test.ts` - 6 tests, clock composition/ordering/read-only coverage

## Decisions Made
- Extended `StageChangeDialog`/`ContactConversationForm` with an optional `trigger` prop instead of forking either component — keeps the Server Action/validation logic single-sourced while letting the Today view show UI-SPEC's labeled buttons and the board/job-detail pages keep their original triggers unchanged
- Moved the pipeline loading skeleton to `src/app/board/loading.tsx` and added a new row-shaped `src/app/loading.tsx` for Today, so the plan's own "Skeleton row-shaped placeholders" backstop truth is actually built, not left as a gap for UAT to discover
- Fetch `existingContacts` per gone-quiet row (not a new cross-application aggregate) — bounded by the already-filtered flagged-item count, same single-application query pattern the job-detail page already uses

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added optional `trigger` prop to StageChangeDialog and ContactConversationForm**
- **Found during:** Task 3 (Today page + inline actions)
- **Issue:** UI-SPEC requires the Today view's "Log a follow-up"/"Change stage" actions to render as labeled buttons (UI Considerations E1: "both Today-view inline actions are labeled buttons, not icon-only"), but the existing components only exposed a fixed icon-only trigger (`StageChangeDialog`) or a fixed "Log Contact" label (`ContactConversationForm`), and neither file was in the plan's `files_modified` list.
- **Fix:** Added an optional `trigger?: ReactNode` prop to both components, defaulting to each component's original trigger when omitted (byte-identical behavior at every existing call site — board card, job-detail page). `today-list.tsx` supplies its own labeled `Button` triggers.
- **Files modified:** `src/components/stage-change-dialog.tsx`, `src/components/contact-conversation-form.tsx`
- **Verification:** `npx tsc --noEmit` clean; full `npm test` suite (183 tests) still green; `contact-conversation-form.tsx`'s default "Log Contact" label is unchanged in its default (no-`trigger`) render path
- **Committed in:** `3c0fd70` (Task 3 commit)

**2. [Rule 2 - Missing Critical] Split the Pipeline board's `loading.tsx` skeleton to follow the route move, and added a new Today-view loading skeleton**
- **Found during:** Task 3 (route restructure)
- **Issue:** The existing `src/app/loading.tsx` renders the Pipeline board's card-grid skeleton. Left in place, it would show the wrong shape under the new Today view at `/`, and `/board` would lose its route-level Suspense loading state entirely — undermining the plan's own must-have backstop truth ("Today view renders shadcn Skeleton row-shaped placeholders during the SSR fetch").
- **Fix:** Moved the existing skeleton to `src/app/board/loading.tsx` unchanged, and added a new row-shaped `src/app/loading.tsx` for the Today view.
- **Files modified:** `src/app/board/loading.tsx` (new), `src/app/loading.tsx` (replaced)
- **Verification:** `npx tsc --noEmit` clean
- **Committed in:** `3c0fd70` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 2 - missing critical functionality required to satisfy the plan's own explicit UI-SPEC/must-have requirements)
**Impact on plan:** Both deviations are additive, backward-compatible extensions of existing components/routes. No scope creep — no new Server Actions, no new database surface, no behavior change at any pre-existing call site.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `src/lib/application-staleness.ts` is ready for the board-card gone-quiet overlay (UI-SPEC Surface 3, deferred to a later plan in this phase — `application-card.tsx` was intentionally not touched here since it wasn't in this plan's `files_modified`)
- The `/analytics` nav link is wired and active-state-correct but the route itself does not exist yet (lands in plan 05-03 per the plan's own note) — this is expected, not a dangling-link bug
- Full test suite (183 tests across 29 files) is green with zero pre-existing failures; the previously-noted stray-worktree failures (STATE.md) are no longer present

---
*Phase: 05-analytics-dashboard-completion*
*Completed: 2026-08-03*

## Self-Check: PASSED

All 15 created/modified files verified present on disk; all 4 commits
(`5c14f84`, `fca9711`, `3c0fd70`, `34fc09b`) verified present in `git log`.
