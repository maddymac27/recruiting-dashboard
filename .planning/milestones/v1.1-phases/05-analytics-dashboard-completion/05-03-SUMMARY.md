---
phase: 05-analytics-dashboard-completion
plan: 03
subsystem: analytics
tags: [recharts, drizzle-orm, node-sqlite, nextjs-server-components, ts-reduction]

# Dependency graph
requires:
  - phase: 05-analytics-dashboard-completion
    provides: "05-02 installed recharts (^3.10.1) + the shadcn chart block (src/components/ui/chart.tsx) behind a package-legitimacy checkpoint"
provides:
  - "src/domain/analytics.ts — getFunnelCounts (5-bucket furthest-reached-stage funnel) + getAnalyticsSummary (total/response-rate/active-closed/outcome breakdown), both computed by TypeScript reduction"
  - "src/components/funnel-chart.tsx — \"use client\" horizontal recharts BarChart wrapper"
  - "/analytics route (src/app/analytics/page.tsx) satisfying DASH-06"
affects: [analytics, dashboard-completion, requirements-DASH-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TS-side aggregation (never SQL GROUP BY) applied to a second domain module (analytics.ts), following board.ts's getPipelineSummary precedent"
    - "First recharts/\"use client\" chart component in the codebase, following RESEARCH Pattern 4 exactly (ChartContainer + horizontal BarChart, not native Funnel)"

key-files:
  created:
    - tests/domain/analytics.test.ts
    - src/domain/analytics.ts
    - src/components/funnel-chart.tsx
    - src/app/analytics/page.tsx
  modified: []

key-decisions:
  - "responseRatePct denominator is the funnel's Applied bucket (reachedApplied), not applications.dateApplied — keeps numerator/denominator both event-sourced (D5-07)"
  - "Offer is itself a funnel stage (FUNNEL_STAGE_ORDER includes it) — the outcome-breakdown test fixtures for Offer/Ghosted rows were deliberately kept event-free so they exercise the current-stage-label outcome count without inflating reachedApplied/reachedScreenPlus"
  - "Summary tiles rendered inline in the page (not via a typed KpiRow reuse) since KpiRow's props are typed to PipelineSummary, not AnalyticsSummary — same grid classes/tile shape, new local array"

patterns-established:
  - "getAnalyticsSummary composes listBoardApplications (current-state) + getFunnelCounts (event-history) rather than a third flat query, keeping the domain-owns-SQL invariant to two read models"

requirements-completed: [DASH-06]

coverage:
  - id: D1
    description: "getFunnelCounts returns 5 buckets in canonical order (Saved/Applied/Screen/Interview/Offer), furthest-reached-stage semantics, Rejected does not reduce a reached stage, monotonically non-increasing, unreached stage is 0"
    requirement: "DASH-06"
    verification:
      - kind: integration
        ref: "tests/domain/analytics.test.ts#getFunnelCounts"
        status: pass
    human_judgment: false
  - id: D2
    description: "getAnalyticsSummary: total/response-rate rounding (1/3->33%)/divide-by-zero guard/active-closed/outcome breakdown"
    requirement: "DASH-06"
    verification:
      - kind: integration
        ref: "tests/domain/analytics.test.ts#getAnalyticsSummary"
        status: pass
    human_judgment: false
  - id: D3
    description: "/analytics page renders summary tile grid + funnel bar chart; error/empty/populated states; zero-application DB shows 'No data yet'"
    requirement: "DASH-06"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit -p tsconfig.json"
        status: pass
    human_judgment: true
    rationale: "Visual rendering (tile grid layout, chart bar proportions, empty/error state copy) requires human visual confirmation — no automated UI test exists for this page in this plan's scope"

duration: ~20min
completed: 2026-08-03
status: complete
---

# Phase 5 Plan 3: Analytics Domain + Funnel Chart Summary

**New `src/domain/analytics.ts` computing a 5-stage funnel and 7-metric summary via TypeScript reduction over `statusEvents`/`applications`, rendered on `/analytics` via a recharts horizontal BarChart wrapped in the shadcn `chart` block.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-03T16:38:00Z (approx, session start)
- **Completed:** 2026-08-03T16:46:01Z
- **Tasks:** 3
- **Files modified:** 4 (all new)

## Accomplishments

- `getFunnelCounts(db)` — for each application, finds the furthest stage ever reached (canonical order Saved < Applied < Screen < Interview < Offer) and counts distinct applications whose furthest reach is at or beyond each stage; a later Rejected/Ghosted event never reduces an already-reached stage's count (funnel stages excluded from `FUNNEL_STAGE_ORDER` simply contribute nothing)
- `getAnalyticsSummary(db)` — total applications, response rate (`reachedScreenPlus ÷ reachedApplied`, `Math.round`, divide-by-zero guarded to `0`), active/closed (non-terminal/terminal current stage), and offers/rejected/ghosted outcome breakdown, composed from `listBoardApplications` + `getFunnelCounts` with zero additional SQL queries
- `FunnelChart` — the codebase's first recharts client component: a horizontal `BarChart` (`layout="vertical"`) with a single accent (`#2563eb`) fill, wrapped in shadcn's `ChartContainer`/`ChartTooltip`, receiving only a plain `{stageLabel, count}[]` prop (no DB handle crosses the server→client boundary)
- `/analytics` page — Server Component with the standard read-or-null → error-state → empty-state → populated shape (mirroring `src/app/page.tsx`); summary tile grid reuses the `KpiRow` visual pattern (`grid-cols-2 sm:grid-cols-4`, Label caption + Display numeral, zero-value buckets still render "0"); "No data yet" empty state replaces both blocks when `totalApplications === 0`

## Task Commits

Each task was committed atomically:

1. **Task 1: Failing tests for funnel counts + summary metrics (RED)** — `a9a61b2` (test)
2. **Task 2: Analytics domain module — funnel counts + summary metrics (GREEN)** — `b8801cf` (feat)
3. **Task 3: Funnel chart client component + /analytics page (DASH-06 UI)** — `72b083b` (feat)

**Plan metadata:** (pending — this commit)

_Note: Task 2's commit also amended the Task 1 test file's fixture math (see Deviations) — both changes landed together as GREEN._

## Files Created/Modified

- `tests/domain/analytics.test.ts` - 9 integration tests: funnel order/furthest-reach/Rejected-non-reduction/two-app-equal-furthest/monotonicity/zero-count, summary total/response-rate/divide-by-zero/outcome-breakdown, zero-application DB
- `src/domain/analytics.ts` - `FUNNEL_STAGE_ORDER`, `FunnelBucket`, `getFunnelCounts`, `AnalyticsSummary`, `getAnalyticsSummary` — pure TS-reduction aggregation, no SQL GROUP BY
- `src/components/funnel-chart.tsx` - `"use client"` `FunnelChart` — recharts horizontal `BarChart` in a shadcn `ChartContainer`
- `src/app/analytics/page.tsx` - `/analytics` Server Component — summary tiles + funnel chart, error/empty/populated states

## Decisions Made

- Kept `responseRatePct`'s denominator as the funnel's Applied bucket (event-sourced), not `applications.dateApplied`, for internal consistency with the Screen+ numerator — both sides of the ratio come from the same "ever reached stage" history (D5-07 default confirmed at plan time)
- Rendered the 7 summary tiles inline in `analytics/page.tsx` (a local array + the same Tailwind classes `KpiRow` uses) rather than extending or reusing `KpiRow` itself, since `KpiRow`'s prop type is `PipelineSummary`, a different shape than `AnalyticsSummary` — avoids widening `KpiRow`'s contract for a one-page consumer

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed my own test fixture's response-rate math**
- **Found during:** Task 2 (running the GREEN verification)
- **Issue:** The first `getAnalyticsSummary` test fixture (written in Task 1) gave every one of 5 applications at least a Saved+Applied event, including the ones meant to represent the Offer/Ghosted outcome-breakdown rows — but Offer is itself a member of `FUNNEL_STAGE_ORDER`, so those rows also counted toward `reachedApplied`/`reachedScreenPlus`, producing `responseRatePct: 40` instead of the plan's intended `33` example (`1/3 → 33%`)
- **Fix:** Redesigned the fixture to 6 applications: 3 with real event histories reaching Applied/Applied/Screen (giving `reachedApplied=3`, `reachedScreenPlus=1` → 33%), plus a 4th Saved-only application (must NOT count toward `reachedApplied`), plus 2 event-free applications whose `currentStageId` is Offer/Ghosted purely to exercise the outcome-breakdown count without touching the funnel numerator/denominator
- **Files modified:** `tests/domain/analytics.test.ts` (implementation `src/domain/analytics.ts` was correct as written — no source change needed)
- **Verification:** `npx vitest run tests/domain/analytics.test.ts` — all 9 tests pass
- **Committed in:** `b8801cf` (Task 2 commit, alongside the GREEN implementation)

---

**Total deviations:** 1 auto-fixed (1 bug, in my own test fixture, not the plan or implementation)
**Impact on plan:** No scope creep — the implementation matches the plan's `getFunnelCounts`/`getAnalyticsSummary` shape exactly; only the test's seed data needed correcting.

## Issues Encountered

None beyond the fixture math above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DASH-06 satisfied: `/analytics` ships the summary metrics row and the funnel bar chart, kept basic per D5-07 (no ANLYT-01/02/03 richer-analytics creep)
- Full suite (`npm test`) green — 30 test files, 192 tests, no pre-existing failures observed in this run (the previously-logged 3 stray-worktree failures did not reproduce)
- `npx tsc --noEmit -p tsconfig.json` clean
- 05-04 (the remaining Phase 5 plan) can proceed independently — this plan touched no shared files outside its own `files_modified` list

---
*Phase: 05-analytics-dashboard-completion*
*Completed: 2026-08-03*

## Self-Check: PASSED

All 4 created files confirmed present on disk; all 3 task commit hashes (`a9a61b2`, `b8801cf`, `72b083b`) confirmed in git history.
