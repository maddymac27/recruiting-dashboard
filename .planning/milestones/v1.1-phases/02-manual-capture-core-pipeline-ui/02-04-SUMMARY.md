---
phase: 02-manual-capture-core-pipeline-ui
plan: 04
subsystem: ui
tags: [nextjs, server-components, drizzle, timeline, job-detail]

# Dependency graph
requires:
  - phase: 02-manual-capture-core-pipeline-ui
    provides: "02-01 Tailwind v4 + shadcn scaffold (Card/Badge/Skeleton primitives, nav shell, cn()); 02-02 postingUrl migration + appendStatusEventTx; 02-03 ApplicationCard linking to /job/[id]"
provides:
  - "src/domain/timeline.ts — getJobTimeline(db, applicationId) + TimelineEntry discriminated-union interface"
  - "src/domain/contacts.ts — getConversationsForApplication(db, applicationId) read helper"
  - "The /job/[id] job detail route — second user-visible read slice, proving the Phase 1 event-sourced model renders end-to-end"
  - "src/components/timeline.tsx — Timeline + TimelineSkeleton server components, reusable by the Wave 3 write slice (02-06)"
affects: [02-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composed timeline read model: two independently-ordered queries (status_events, conversations) concatenated, each entry tagged with its original concat-array index as a stable secondary sort key, then sorted occurredAt descending — guarantees equal-timestamp entries never reshuffle across renders (explicit tiebreak, not relied on JS sort stability)"
    - "Dates formatted to display strings in the page.tsx Server Component and passed as plain strings into <Timeline>, not raw Date objects — Timeline itself never formats a date"
    - "Route-level loading.tsx + a *Skeleton-suffixed sibling export (TimelineSkeleton) is the established pattern (mirrors 02-03's PipelineBoardSkeleton) for row-shaped loading placeholders"
    - "notFound() from next/navigation for both an invalid (non-numeric/non-positive) id and a nonexistent application id — same 404 path for both cases"

key-files:
  created:
    - src/domain/timeline.ts
    - tests/domain/timeline.test.ts
    - src/components/timeline.tsx
    - src/app/job/[id]/page.tsx
    - src/app/job/[id]/loading.tsx
  modified:
    - src/domain/contacts.ts
    - tests/domain/contacts.test.ts
    - .planning/phases/02-manual-capture-core-pipeline-ui/deferred-items.md

key-decisions:
  - "Assigned an explicit source-order index to every timeline entry before sorting (rather than relying on JS Array.sort's stability guarantee) so the equal-occurredAt tiebreak is self-documenting and independently testable — verified by a dedicated adjacency test asserting the same tie order across two separate getJobTimeline calls."
  - "Stage badge on the detail header uses Badge variant=\"secondary\" (not the default primary/accent variant) — UI-SPEC reserves the accent color role for CTAs/focus rings, not general status labels."
  - "Conversation rows render 'No notes recorded.' as a fallback when notes is null (schema allows null) rather than an empty paragraph, so the row never renders visually blank."

patterns-established:
  - "Timeline merge: two ordered read queries concatenated with a stable source-order tiebreak, sorted once — the pattern any future multi-source composed read model (e.g. a future 'linked message' entity in Phase 3) should follow"

requirements-completed: [DASH-05]

coverage:
  - id: D1
    description: "getConversationsForApplication + getJobTimeline read models, fully unit-tested including the merge/sort/equal-timestamp-adjacency behavior"
    requirement: DASH-05
    verification:
      - kind: unit
        ref: "tests/domain/timeline.test.ts — 3/3 tests: merge + most-recent-first sort with correct stage/contact/notes fields, equal-occurredAt adjacency with deterministic tie order (re-verified across two calls), zero-entries empty array"
        status: pass
      - kind: unit
        ref: "tests/domain/contacts.test.ts — getConversationsForApplication: 1/1 new test confirms application-scoped filtering (excludes a different application's conversation), contact-name join, occurredAt ascending order"
        status: pass
    human_judgment: false
  - id: D2
    description: "/job/[id] detail page: async Server Component awaiting Next.js 16 async params, header (company/role/stage badge/date) + unified timeline, notFound() for invalid/nonexistent id, read-failure fallback copy, no direct DB access, no raw-HTML injection prop"
    requirement: DASH-05
    verification:
      - kind: unit
        ref: "Task 2 acceptance_criteria: grep 'await params' in page.tsx (1 match); grep -c dangerouslySetInnerHTML in timeline.tsx (0); grep -c toLocaleDateString in both files (0); grep for direct db.select/insert/update/delete in either file (0 matches); npx tsc --noEmit exits 0"
        status: pass
      - kind: manual_procedural
        ref: "npm run dev DASHBOARD_MODE=demo fetch checks: /job/1 (application with 4 status events + 3 conversations) renders one merged ol> list, most-recent-first, correct stage/contact/notes text per entry; /job/9999 and /job/abc both trigger Next's NEXT_HTTP_ERROR_FALLBACK;404 (notFound())"
        status: pass
    human_judgment: true
    rationale: "Visual/layout adequacy (typography sizing rendering per UI-SPEC, long-note wrap behavior with no truncation, loading-skeleton row shape) was checked via HTML content and tsc assertions only, not a rendered screenshot — a human should eyeball the actual rendered detail page (especially a long pasted note) before treating the portfolio-grade visual bar as met."

# Metrics
duration: ~20min
completed: 2026-07-29
status: complete
---

# Phase 2 Plan 4: Job Detail + Unified Timeline Summary

**Read-only `/job/[id]` detail page whose timeline merges status_events and conversations into one most-recent-first stream with a deterministic equal-timestamp tiebreak, proving the Phase 1 event-sourced model renders end-to-end.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 completed
- **Files modified:** 8 (5 created, 3 modified)

## Accomplishments

- `src/domain/contacts.ts`: `getConversationsForApplication(db, applicationId)` — application-scoped conversation read, joined to the contact's name, ordered `occurredAt` ascending.
- `src/domain/timeline.ts`: `getJobTimeline(db, applicationId)` + `TimelineEntry` discriminated-union interface — merges status events (joined to `stages` for the label) with conversations into one most-recent-first list, with an explicit stable secondary sort key so entries sharing an identical `occurredAt` never reshuffle between calls.
- `tests/domain/timeline.test.ts` (new, 3 tests) + `tests/domain/contacts.test.ts` (extended, 1 test): cover the merge/sort, equal-timestamp adjacency (asserted stable across two separate `getJobTimeline` calls), the zero-entries case, and application-scoped conversation filtering.
- `src/app/job/[id]/page.tsx`: async Server Component that awaits Next.js 16's async `params`, resolves and validates the numeric id, reads `getApplicationDetail` + `getJobTimeline` only (no direct DB access), renders the header (company/role/stage badge/formatted date), formats every timeline date to a display string before handing it to `<Timeline>`, calls `notFound()` for an invalid or nonexistent id, and falls back to "Couldn't load this page. Refresh to try again." on a read-fetch exception.
- `src/components/timeline.tsx`: `Timeline` server component rendering merged rows as escaped JSX text only (no raw-HTML injection prop anywhere — the primary stored-XSS control per the plan's threat register), notes wrapping fully with `whitespace-pre-wrap break-words` (no truncation/character limit), and a clean "No history yet" empty state for zero entries. Exports `TimelineSkeleton` for the loading fallback.
- `src/app/job/[id]/loading.tsx` (Rule 2 deviation, mirrors 02-03's precedent): wires `TimelineSkeleton` into Next.js's automatic route-level Suspense boundary so the loading/timeline UI-SPEC backstop is actually live.
- Verified end-to-end via `npm run dev DASHBOARD_MODE=demo`: `/job/1` (a demo application with 4 status events + 3 conversations) renders one merged, most-recent-first stream with correct stage/contact/notes content per row; `/job/9999` and `/job/abc` both correctly trigger `notFound()`.

## Task Commits

Each task was committed atomically:

1. **Task 1: getConversationsForApplication + getJobTimeline read models (with tests)** - `e646b39` (feat)
2. **Task 2: /job/[id] detail page (async params) + timeline component with empty/loading/error/long-text states** - `1231007` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/domain/timeline.ts` - `getJobTimeline`, `TimelineEntry` discriminated-union interface
- `src/domain/contacts.ts` - added `getConversationsForApplication`
- `tests/domain/timeline.test.ts` - merge/sort/adjacency/empty-array coverage
- `tests/domain/contacts.test.ts` - added `getConversationsForApplication` scoping/join/order test
- `src/components/timeline.tsx` - `Timeline` (merged rows, empty state, escaped text) + `TimelineSkeleton`
- `src/app/job/[id]/page.tsx` - job detail Server Component (async params, header, read-failure/not-found handling)
- `src/app/job/[id]/loading.tsx` - route-level Suspense fallback wiring the timeline skeleton
- `.planning/phases/02-manual-capture-core-pipeline-ui/deferred-items.md` - logged recurring tsconfig.json auto-rewrite and a non-idempotent-reseed data-directory note (both pre-existing, out of scope)

## Decisions Made

- Assigned each timeline entry an explicit source-order index before sorting, rather than relying on JS `Array.sort`'s stability guarantee, so the equal-`occurredAt` tiebreak is self-documenting and independently testable — confirmed stable across two separate `getJobTimeline` calls in the adjacency test.
- Stage badge uses `variant="secondary"`, not the default primary/accent variant — UI-SPEC reserves the accent color role for CTAs and focus rings, not general status labels.
- Conversation rows fall back to "No notes recorded." when `notes` is null (a valid schema state) so a row never renders visually blank.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded a doc comment that literally matched the plan's own acceptance-criteria grep**
- **Found during:** Task 2
- **Issue:** `timeline.tsx`'s doc comment explaining what NOT to do contained the exact literal substring `dangerouslySetInnerHTML` that the plan's own acceptance-criteria `grep -c "dangerouslySetInnerHTML"` check was designed to catch as absent — the same false-positive pattern documented in 02-01's and 02-03's SUMMARYs.
- **Fix:** Reworded the comment to preserve the same warning ("React's raw-HTML injection escape hatch") without the literal matched string.
- **Files modified:** src/components/timeline.tsx
- **Verification:** Re-ran the exact grep command; count is now 0.
- **Committed in:** 1231007 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Wired the timeline loading skeleton into a live route-level `loading.tsx`**
- **Found during:** Task 2
- **Issue:** The plan's must-haves list a loading/timeline backstop ("row-shaped shadcn Skeleton placeholders render, no spinner" while the detail server component fetches) but Task 2's `<files>` scope covered only `page.tsx` and `timeline.tsx`, leaving the exported `TimelineSkeleton` unused and the must-have undelivered in practice — the exact gap 02-03 hit and fixed the same way for the board route.
- **Fix:** Added `src/app/job/[id]/loading.tsx`, which Next.js's App Router automatically wraps around the detail page as a Suspense fallback.
- **Files modified:** src/app/job/[id]/loading.tsx (new)
- **Verification:** `npx tsc --noEmit` exits 0; file follows the same server-component, no-raw-SQL conventions as the rest of the route.
- **Committed in:** 1231007 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug/false-positive, 1 missing-critical addition)
**Impact on plan:** Both fixes were necessary for the plan's own stated verification/must-haves to pass; no scope creep — the loading.tsx addition stays inside the same domain-owns-SQL, server-component-only conventions already established by prior plans in this phase.

## Issues Encountered

- `tsconfig.json` was again auto-rewritten by `next dev` during manual verification (the same recurring Next.js 16.2.11 behavior first documented in 02-01's SUMMARY) — reverted with `git checkout -- tsconfig.json` before finalizing; no code change involved.
- Re-running `npm run db:seed:demo` against the already-seeded `data/demo.sqlite` (left over from 02-03's verification pass) failed on a `UNIQUE constraint failed: companies.normalized_key` — the seed script isn't idempotent against already-seeded data, which is expected/out of scope. Verification instead queried the existing seeded data directly to find an application with both status events and conversations (id 1) and used that for the `npm run dev` check.
- Same stale `.claude/worktrees/hopeful-mestorf-9a8ba0/` duplicate test tree noted in every prior plan's SUMMARY was not re-checked this plan since `npx vitest run` was scoped to this plan's own two test files only (both passed 8/8); not expected to affect those scoped runs based on prior plans' findings.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `/job/[id]` is live and reads real domain data end-to-end (demo mode: interleaved most-recent-first history for an application with events + conversations; nonexistent/invalid ids correctly 404) — the second genuinely user-visible read slice of Phase 2, alongside the Pipeline board (02-03).
- `getJobTimeline`/`getConversationsForApplication` and the `Timeline`/`TimelineSkeleton` components are ready inputs for the Wave 3 write slice (02-06), which adds inline contact/conversation logging (CAP-04) directly on top of this same detail page — this plan deliberately did not add those forms/dialogs (read-only per the plan objective).
- No "linked message" content renders yet in the timeline by design — no messages entity exists until Phase 3 ingestion (RESEARCH Pattern 4 note); this is expected, not a gap.

## Self-Check: PASSED

All 5 created files verified present on disk (src/domain/timeline.ts, tests/domain/timeline.test.ts, src/components/timeline.tsx, src/app/job/[id]/page.tsx, src/app/job/[id]/loading.tsx). Both commits (e646b39, 1231007) verified present in git log. `npx vitest run tests/domain/timeline.test.ts tests/domain/contacts.test.ts` exits 0 (8/8 pass). `npx tsc --noEmit` exits 0. All Task 2 acceptance-criteria greps re-verified passing. Manual `npm run dev DASHBOARD_MODE=demo` verification confirmed the merged timeline renders correctly and both invalid/nonexistent ids trigger `notFound()`.

---
*Phase: 02-manual-capture-core-pipeline-ui*
*Completed: 2026-07-29*
