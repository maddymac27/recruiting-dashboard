---
phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
plan: 08
subsystem: ui
tags: [nextjs, server-actions, shadcn, table, tabs, review-queue, zod]

# Dependency graph
requires:
  - phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
    provides: "03-05 review-queue domain layer — listPendingReviewItems/listResolvedReviewItems/resolveReviewItem, insertReviewQueueEntry(Tx)"
provides:
  - "/review Server Component: paginated (25/page Load-more), Pending/Resolved-tabbed table over the review_queue rows, with confirmed empty-state copy and em-dash placeholders for absent parsed fields"
  - "src/app/review/actions.ts: confirmReviewMatchAction, attachReviewToApplicationAction, createFromReviewAction, logReviewAsConversationAction — each composes an existing domain write then resolves the item via resolveReviewItem"
  - "src/components/review-queue-item.tsx: per-type client dialogs (Confirm match, Choose different application, Create application, Attach to existing, Log as conversation)"
  - "src/domain/review-queue.ts: getReviewItemById (new read helper the actions use to trust server-stored parsed fields over client-resubmitted copies)"
  - "shadcn table/tabs primitives; a Review nav-shell entry point"
affects: [03-09, 03-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-first pagination: page.tsx stays a pure Server Component; 25/page 'Load more' is a Link that increments a ?pendingLimit/?resolvedLimit search param (no client pagination state, no extra client wrapper component)"
    - "Review actions read the item's own stored parsed fields (parsedStageLabel/parsedEventDate/sourceMessageId) via getReviewItemById rather than trusting client-resubmitted copies — the client only ever supplies reviewId + user-editable overrides"
    - "attachReviewToApplicationAction is the single shared write path for both 'Choose different application' (low_confidence_match) and 'Attach to existing' (unmatched_confirm_create) — functionally identical, differing only in which button surfaces it"

key-files:
  created:
    - src/app/review/page.tsx
    - src/app/review/actions.ts
    - src/app/review/loading.tsx
    - src/components/review-queue-item.tsx
    - src/components/ui/table.tsx
    - src/components/ui/tabs.tsx
  modified:
    - src/domain/review-queue.ts
    - src/components/nav-shell.tsx

key-decisions:
  - "review-queue-item.tsx does NOT literally embed <ContactConversationForm/> for label_mail's 'Log as conversation' — it reuses that component's ExistingContactOption type and mirrors its exact field set/UX, but dispatches through logReviewAsConversationAction (one atomic action composing contact-create-or-reuse + conversation + resolve) instead of the two-step job/[id]/actions.ts calls the original component is hardwired to. Documented as a deliberate reuse-of-contract rather than reuse-of-instance, since the two action shapes (2 separate Server Actions vs. 1 composed action) are structurally incompatible."
  - "Added getReviewItemById to src/domain/review-queue.ts (not explicitly named in the plan's files_modified) — required so confirm/attach/create/log actions can read the review item's server-stored parsedStageLabel/parsedEventDate/sourceMessageId rather than trusting client-resubmitted values for the write that ultimately drives a status-event transition (Rule 2 — missing critical read path)."
  - "Pagination implemented via URL search params (?tab/?pendingLimit/?resolvedLimit) rather than a client-side reveal-count component, keeping page.tsx a pure Server Component with no new client wrapper — Tabs/Table remain server-rendered except the per-row ReviewQueueItem client island."
  - "'Confirm match' (low_confidence_match) is a one-click button with no dialog — the plan's Task 2 spec for confirmReviewMatchAction takes only (reviewId, applicationId) with no editable input, since the suggested candidateApplicationId is already what the row displays."

patterns-established:
  - "Review action -> resolveReviewItem -> revalidatePath('/review') + revalidatePath('/') is the fixed shape every review-queue write follows; sub-actions differ only in which domain write(s) precede the resolve call."

requirements-completed: [REL-01]

coverage:
  - id: D1
    description: "/review renders a Pending/Resolved-tabbed, paginated table (Type badge, Sender/Subject, parsed company/role, Date, Actions) with confirmed empty-state copy and em-dash placeholders for absent parsed fields"
    requirement: "REL-01"
    verification:
      - kind: other
        ref: "node -e check: listPendingReviewItems/listResolvedReviewItems present + 'Review queue is empty' copy present in src/app/review/page.tsx"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Visual table/tabs/pagination rendering and empty-state layout require a human to confirm against the running app — no dev server was started this plan (no Gmail sync has populated real review_queue rows yet, per 03-CONTEXT: this surface displays real items only once 03-06 ships)."
  - id: D2
    description: "Four review actions (confirmReviewMatchAction/attachReviewToApplicationAction/createFromReviewAction/logReviewAsConversationAction) each compose an existing domain write, call resolveReviewItem, and revalidate /review + / — never delete a review row"
    requirement: "REL-01"
    verification:
      - kind: other
        ref: "node -e check: resolveReviewItem present + no .delete( in src/app/review/actions.ts"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D3
    description: "review-queue-item.tsx dispatches the correct per-type action set, never imports the db client, and renders all content (including verbatim email body) as escaped JSX text only — no dangerouslySetInnerHTML"
    requirement: "REL-01"
    verification:
      - kind: other
        ref: "node -e check: 'use client' present + no @/db/client import in src/components/review-queue-item.tsx"
        status: pass
      - kind: other
        ref: "grep -v '^\\s*//' src/components/review-queue-item.tsx | grep -c dangerouslySetInnerHTML -> 0"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-07-30
status: complete
---

# Phase 3 Plan 08: Review Queue UI Summary

**`/review` Server Component table (Type/Sender-Subject/Company-Role/Date/Actions) with Pending/Resolved tabs, 25/page Load-more pagination, and four Server Actions (confirm/attach/create/log-as-conversation) that each compose an existing domain write and transition the item to a permanent Resolved audit trail.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-07-30 (approx, mid-session)
- **Completed:** 2026-07-30
- **Tasks:** 3/3
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments
- `src/app/review/page.tsx` — Server Component reading `listPendingReviewItems`/`listResolvedReviewItems` (03-05) plus an eagerly-computed application+contacts lookup list (from `listBoardApplications` + `getContactSummariesForApplication`), rendering a shadcn `Tabs` (Pending/Resolved) over a shadcn `Table`; empty-state copy matches the UI-SPEC verbatim; parsed-absent cells render an em-dash, never "null"; pagination is 25/page via URL search params + a "Load more" `Link`
- `src/app/review/actions.ts` — `confirmReviewMatchAction`, `attachReviewToApplicationAction`, `createFromReviewAction`, `logReviewAsConversationAction`, each safeParsing input, reading the item's own server-stored parsed fields via the new `getReviewItemById`, composing an existing domain write (`appendStatusEvent`/`createApplication`/`addConversation` — no new event-write path), then calling `resolveReviewItem` and revalidating `/review` + `/`
- `src/components/review-queue-item.tsx` — client component dispatching per review-item type: `low_confidence_match` → one-click "Confirm match" + "Choose different application" dialog; `unmatched_confirm_create` → "Create application" dialog (prefilled, editable) + "Attach to existing" dialog; `label_mail` → "Log as conversation" dialog (mirrors the Phase 2 CAP-04 form's field set, prefilled with the email date + verbatim body)
- `src/domain/review-queue.ts` extended with `getReviewItemById` — the read primitive every review action needs to trust server-stored parsed fields over client-resubmitted values
- shadcn `table`/`tabs` added (official registry, no new dependencies — `radix-ui`/`class-variance-authority` already installed); a "Review" nav-shell entry point added
- `npx tsc --noEmit` clean; all plan-specified automated grep/node checks pass; full project test suite (22 real test files, 133 tests) passes unaffected

## Task Commits

Each task was committed atomically:

1. **Task 1: /review Server Component table + tabs + pagination + empty states** - `4a8645d` (feat)
2. **Task 2: review actions (confirm / create / attach / log-as-conversation)** - `af3fef8` (feat)
3. **Task 3: review-queue-item client dialog (per-type actions, escaped body)** - `dd1cfce` (feat)

**Plan metadata:** (this commit, following SUMMARY write)

## Files Created/Modified
- `src/app/review/page.tsx` - Server Component: Pending/Resolved tabbed, paginated review-queue table
- `src/app/review/actions.ts` - Four review Server Actions (confirm/attach/create/log-as-conversation)
- `src/app/review/loading.tsx` - Skeleton-row loading fallback (route-level Suspense boundary)
- `src/components/review-queue-item.tsx` - Client dialogs dispatching per-type review actions
- `src/components/ui/table.tsx` - shadcn table primitive (official registry)
- `src/components/ui/tabs.tsx` - shadcn tabs primitive (official registry)
- `src/domain/review-queue.ts` - Added `getReviewItemById` read helper
- `src/components/nav-shell.tsx` - Added a "Review" nav link entry point to `/review`

## Decisions Made
- `review-queue-item.tsx`'s "Log as conversation" dialog reuses `ContactConversationForm`'s `ExistingContactOption` type and replicates its exact field layout, but is a separate component wired to `logReviewAsConversationAction` — the plan's Task 2 spec requires one atomic action composing contact-create-or-reuse + conversation + resolve, which is structurally incompatible with the original component's hardwired two-step `logContactAction`/`logConversationAction` calls into `job/[id]/actions.ts`. This preserves the "reuse the Phase 2 CAP-04 contract" intent (same fields, same UX, same type) without forking the write-action wiring of the original component.
- Added `getReviewItemById` to `src/domain/review-queue.ts` (not explicitly listed in the plan's `files_modified`) so every review action can read the item's own stored `parsedStageLabel`/`parsedEventDate`/`sourceMessageId` server-side — the plan's action descriptions explicitly say "using the item's parsedStageLabel ... parsedEventDate ... sourceMessageId," which requires a lookup, not client-resubmitted values.
- Pagination is implemented as server-rendered `Link`s that increment `?pendingLimit`/`?resolvedLimit` search params, not a new client-side pagination-state component — keeps `page.tsx` a pure Server Component (only the per-row `ReviewQueueItem` is a client island), matching the "simplest control" UI-SPEC guidance and the codebase's existing all-reads-in-Server-Components convention.
- `attachReviewToApplicationAction` is shared verbatim between "Choose different application" (`low_confidence_match`) and "Attach to existing" (`unmatched_confirm_create`) — both are functionally identical (append the item's parsed-stage event to a user-chosen application, resolve "reassigned"), so one action serves both dialogs rather than duplicating the write path.
- "Confirm match" renders as a one-click button (no dialog) — the plan's `confirmReviewMatchAction(reviewId, applicationId)` signature takes no editable input, since the suggested `candidateApplicationId` already stored on the row is exactly what the button confirms.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `getReviewItemById` to `src/domain/review-queue.ts`**
- **Found during:** Task 2 (review actions implementation)
- **Issue:** The plan's action descriptions require each action to use "the item's" `parsedStageLabel`/`parsedEventDate`/`sourceMessageId` — these are server-stored fields on the `review_queue` row, but `src/domain/review-queue.ts` (03-05) only exported list/insert/resolve functions, no get-by-id. Without it, the actions would have had to trust client-resubmitted copies of these fields, which both contradicts the plan's stated data source and widens the write-path's trust boundary unnecessarily.
- **Fix:** Added `getReviewItemById(db, id)` — a simple `db.select().from(reviewQueue).where(eq(reviewQueue.id, id)).get()`, matching the file's existing query style.
- **Files modified:** `src/domain/review-queue.ts`
- **Verification:** `npx tsc --noEmit` clean; all four review actions in `src/app/review/actions.ts` compile against it and read parsed fields server-side, not from client input.
- **Committed in:** `af3fef8` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical read path)
**Impact on plan:** Necessary to fulfill the plan's own stated data-source requirement for the confirm/attach/create/log actions. No scope creep — no new table, no new write surface, purely an additive read function on the existing `review_queue` table.

## Issues Encountered
- Ran the full `vitest run` suite and saw 3 pre-existing failures under `.claude/worktrees/hopeful-mestorf-9a8ba0/tests/` — a stale worktree checkout left over from a prior session (dated 2026-07-28, untracked by git), not this project's real `tests/` directory. Confirmed the real `tests/db/seed.test.ts` and `tests/domain/companies.test.ts` (the same-named files at the correct location) pass cleanly; this is out of scope per the deviation rules' scope boundary (pre-existing, unrelated to this plan's files) and was not touched.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `/review` displays real review-queue items once 03-06 (Gmail ingestion orchestrator) ships and a sync populates `review_queue` rows — this plan proves the full UI/action loop against the 03-05 domain layer but has no live data to click through yet (no dev server was started; verification is `tsc` + grep-based per plan spec, consistent with the plan's `<verify>` blocks).
- 03-09 (dead-letter queue UI) can follow the same page.tsx/actions.ts/*-item.tsx split established here.
- 03-10 (sidebar review/dead-letter count badges + REL-04 risk note) can link its review-queue badge to `/review` now that the route exists.
- No blockers. `npx tsc --noEmit` clean; no delete on review rows (grep-verified in both `review-queue.ts` and `review/actions.ts`); no `dangerouslySetInnerHTML` in `review-queue-item.tsx` (grep-verified).

---
*Phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing*
*Completed: 2026-07-30*

## Self-Check: PASSED

All claimed files verified present on disk (src/app/review/page.tsx, src/app/review/actions.ts, src/app/review/loading.tsx, src/components/review-queue-item.tsx, src/components/ui/table.tsx, src/components/ui/tabs.tsx, src/domain/review-queue.ts, src/components/nav-shell.tsx, this SUMMARY.md). All three task commits (`4a8645d`, `af3fef8`, `dd1cfce`) verified present in `git log`.
