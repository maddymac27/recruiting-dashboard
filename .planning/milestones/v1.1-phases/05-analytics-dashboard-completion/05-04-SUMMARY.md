---
phase: 05-analytics-dashboard-completion
plan: 04
subsystem: ui
tags: [react, nextjs, server-components, staleness, board]

# Dependency graph
requires:
  - phase: 05-analytics-dashboard-completion (plan 01)
    provides: "src/lib/application-staleness.ts pure predicate (StalenessStatus type, getStalenessStatus), src/domain/today.ts getStalenessByApplication(db) read model, the D5-01 activity clock"
provides:
  - "ApplicationCard renders the shared 'Gone quiet · {N} days' Destructive badge, positioned top-right of the card content, without covering/truncating the company name"
  - "Board page (src/app/board/page.tsx) computes stalenessByApplication once via getStalenessByApplication(db) and threads it through PipelineBoard -> BoardColumn -> ApplicationCard"
affects: [board, today-view, analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-computed derived-state Map threaded by id through a component tree, looked up per-item at the leaf (mirrors 05-01's TodayItem approach, applied to the board's grouped-by-stage tree)"

key-files:
  created: []
  modified:
    - src/components/application-card.tsx
    - src/app/board/page.tsx
    - src/components/pipeline-board.tsx
    - src/components/board-column.tsx

key-decisions:
  - "Wrapped the card's company/role Link and the new badge in a flex row (Link: min-w-0 flex-1, Badge: shrink-0) rather than absolute positioning — simpler, and guarantees the badge never overlaps the truncating company-name text at any card width."
  - "Reused today-list.tsx's exact Badge variant/icon/copy convention (variant=\"destructive\", AlertTriangle size-3, \"Gone quiet · {N} days\") verbatim for visual consistency between the Today view and the board card, per UI-SPEC Surface 3."

patterns-established: []

requirements-completed: [DASH-03]

coverage:
  - id: D1
    description: "ApplicationCard renders the Destructive 'Gone quiet · {N} days' badge only when the passed stalenessStatus.kind is 'gone-quiet'; renders nothing for absent/none/saved-nudge"
    requirement: "DASH-03"
    verification:
      - kind: other
        ref: "npx tsc --noEmit -p tsconfig.json (end-to-end prop typing across ApplicationCard/BoardColumn/PipelineBoard/board/page.tsx)"
        status: pass
    human_judgment: true
    rationale: "Visual placement (badge not covering/truncating the company name) and actual on-screen appearance at /board require human visual verification; no UI test harness exists in this codebase for pixel-level overlap checks."
  - id: D2
    description: "src/app/board/page.tsx computes staleness via the reused 05-01 getStalenessByApplication(db) and threads the resulting Map through PipelineBoard -> BoardColumn -> ApplicationCard with no duplicated staleness/clock logic"
    requirement: "DASH-03"
    verification:
      - kind: other
        ref: "npx tsc --noEmit -p tsconfig.json"
        status: pass
      - kind: unit
        ref: "npm test (192/192 passing, includes existing tests/domain/today.test.ts covering getStalenessByApplication — unmodified by this plan)"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-08-03
status: complete
---

# Phase 5 Plan 4: Board Card Gone-Quiet Badge Summary

**Threaded the D5-01/D5-08 shared staleness predicate through the pipeline-board component tree so gone-quiet applications show the same Destructive badge on their board card as on the Today view.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-03T21:35:00Z
- **Completed:** 2026-08-03T21:51:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `ApplicationCard` gained an optional `stalenessStatus?: StalenessStatus` prop and renders a top-right Destructive "Gone quiet · {N} days" badge (with `AlertTriangle` icon), only for `kind === "gone-quiet"`, never covering the truncating company-name text.
- `src/app/board/page.tsx` computes `stalenessByApplication` once per request via 05-01's `getStalenessByApplication(db)` and threads the `Map<number, StalenessStatus>` through `PipelineBoard` -> `BoardColumn`, which looks it up per card by `application.id`.
- No new staleness/clock logic was written anywhere in this plan — the board consumes the exact same predicate and D5-01 activity clock the Today view already uses (D5-08: one predicate, both surfaces).

## Task Commits

Each task was committed atomically:

1. **Task 1: Render the gone-quiet badge on the application card** - `e2b5c63` (feat)
2. **Task 2: Compute + thread staleness from board page through the column tree** - `85f2cbc` (feat)

**Plan metadata:** _pending — final docs commit follows this SUMMARY_

_Note: no TDD tasks in this plan (tdd_mode: false); each task is a single feat commit._

## Files Created/Modified
- `src/components/application-card.tsx` - Added `stalenessStatus?: StalenessStatus` prop; renders the Destructive gone-quiet badge top-right, wrapped alongside the Link in a flex row so it never covers/truncates the company name
- `src/app/board/page.tsx` - Computes `stalenessByApplication` via `getStalenessByApplication(db)` (reused from `@/domain/today`) and passes it to `PipelineBoard`
- `src/components/pipeline-board.tsx` - Added `stalenessByApplication: Map<number, StalenessStatus>` prop, threaded straight through to each `BoardColumn`
- `src/components/board-column.tsx` - Added the same prop; in the card render loop, passes `stalenessStatus={stalenessByApplication.get(application.id)}` per card

## Decisions Made
- Used a flex row (`min-w-0 flex-1` Link + `shrink-0` Badge) instead of absolute positioning for the badge placement — simpler and layout-safe at any card width, satisfying the UI-SPEC "must not cover/truncate the company name" requirement without extra CSS stacking-context concerns.
- Matched `today-list.tsx`'s exact badge styling/copy convention verbatim (`variant="destructive"`, `AlertTriangle` `size-3`, "Gone quiet · {N} days") so the two surfaces are visually identical per UI-SPEC Surface 3's explicit requirement.

## Deviations from Plan

None - plan executed exactly as written. No new staleness logic was introduced; both tasks reused 05-01's `getStalenessByApplication`/`StalenessStatus` exports unmodified.

## Issues Encountered

None. `npx tsc --noEmit -p tsconfig.json` passed clean after each task, and the full test suite (`npm test`, 192/192) passed with no regressions — no stray-worktree failures were present this run (the 3 previously-noted pre-existing failures from `04-02-SUMMARY.md`'s deferred-items.md did not reproduce, likely because that stray worktree copy no longer exists).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DASH-03 is now fully satisfied on both surfaces (Today view from 05-01/05-02, board card from this plan) — the shared D5-08 predicate module has no remaining consumer gaps.
- Phase 5 plans 01-04 are all complete; this was the final plan (4 of 4) in Phase 05 — Analytics & Dashboard Completion.
- Manual UAT recommended before milestone close: visit `/board` with demo data seeded, confirm a stale non-terminal card shows the badge, terminal/fresh/saved cards show none, and the badge doesn't visually collide with company names at narrow card widths (backstop items from UI-SPEC E4).

---
*Phase: 05-analytics-dashboard-completion*
*Completed: 2026-08-03*

## Self-Check: PASSED

All modified files found on disk (`src/components/application-card.tsx`, `src/app/board/page.tsx`, `src/components/pipeline-board.tsx`, `src/components/board-column.tsx`, this SUMMARY.md). Both task commit hashes (`e2b5c63`, `85f2cbc`) confirmed present in `git log`.
