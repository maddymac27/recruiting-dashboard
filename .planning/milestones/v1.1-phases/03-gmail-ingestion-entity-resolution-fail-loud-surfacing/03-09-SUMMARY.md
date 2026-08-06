---
phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
plan: 09
subsystem: ui
tags: [nextjs, server-components, shadcn, table, tabs, scroll-area, dead-letter, security]

# Dependency graph
requires:
  - phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
    provides: "03-05 dead-letter domain layer — listPendingDeadLetter/listResolvedDeadLetter, insertDeadLetterEntry(Tx), resolveDeadLetterByMessageIdTx"
  - phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
    provides: "03-08 /review page/table/tabs/pagination pattern, mirrored verbatim for /dead-letter"
provides:
  - "/dead-letter Server Component: paginated (25/page Load-more), Pending/Resolved-tabbed table over dead_letter rows, with confirmed empty-state copy and a D3-04 destructive-red Type badge for known_sender_failed"
  - "src/components/dead-letter-item.tsx: read-only 'View raw email' dialog rendering the full raw payload as escaped plain text inside a bounded scroll-area — never dangerouslySetInnerHTML"
  - "shadcn scroll-area primitive; a Dead-letter nav-shell entry point"
affects: [03-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-first pagination: page.tsx stays a pure Server Component; 25/page 'Load more' is a Link that increments a ?pendingLimit/?resolvedLimit search param — identical to 03-08's /review pattern"
    - "Raw untrusted content (dead-letter rawPayload) renders only inside a <pre>{content}</pre> plain-text node, never dangerouslySetInnerHTML — highest-risk render surface in the phase per the threat model (T-03-03)"
    - "No resolve/delete/dismiss control anywhere on the dead-letter surface — items only move Pending -> Resolved via a later successful re-parse of the same source message id (domain concern, T-03-14), never a UI action"

key-files:
  created:
    - src/app/dead-letter/page.tsx
    - src/app/dead-letter/loading.tsx
    - src/components/dead-letter-item.tsx
    - src/components/ui/scroll-area.tsx
  modified:
    - src/components/nav-shell.tsx

key-decisions:
  - "The 'View raw email' Actions column renders in both the Pending and Resolved tabs, not only Pending — diagnosing what a now-resolved item originally failed on retains value, and the plan's UI-SPEC coverage table description doesn't restrict the action to Pending rows."
  - "Added src/app/dead-letter/loading.tsx (not explicitly in the plan's files_modified) mirroring src/app/review/loading.tsx's Skeleton-row Suspense fallback — matches 03-08's precedent and the UI-SPEC's loading/queue backstop requirement."

patterns-established:
  - "Dead-letter row -> DeadLetterItem client island -> read-only Dialog+ScrollArea is the fixed shape for any future fail-loud/diagnostic viewer surface; no write action attaches to this component by design."

requirements-completed: [REL-02]

coverage:
  - id: D1
    description: "/dead-letter renders a Pending/Resolved-tabbed, paginated table (Type badge, Sender/Subject, Date, View raw email action) with confirmed empty-state copy; known_sender_failed uses the destructive badge, unparseable uses neutral"
    requirement: "REL-02"
    verification:
      - kind: other
        ref: "node -e check: listPendingDeadLetter present + 'Nothing in the dead-letter queue' copy present in src/app/dead-letter/page.tsx"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Visual table/tabs/pagination rendering and empty-state layout require a human to confirm against the running app — no dev server was started this plan (no Gmail sync has populated real dead_letter rows yet, per 03-CONTEXT: this surface displays real items only once the ingestion orchestrator ships and a parse actually fails)."
  - id: D2
    description: "No user-facing delete/dismiss/ignore control exists anywhere on the dead-letter page — items are only resolved by domain-layer re-parse"
    requirement: "REL-02"
    verification:
      - kind: other
        ref: "grep -Ec 'delete|dismiss|ignore' src/app/dead-letter/page.tsx -> 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "dead-letter-item.tsx is a client component, imports no db client, renders the raw payload as escaped plain text only inside a bounded ScrollArea with no truncation, and has no resolve/delete/dismiss control (read-only viewer)"
    requirement: "REL-02"
    verification:
      - kind: other
        ref: "node -e check: 'use client' present + no @/db/client import in src/components/dead-letter-item.tsx"
        status: pass
      - kind: other
        ref: "grep -v '^\\s*//' src/components/dead-letter-item.tsx | grep -c dangerouslySetInnerHTML -> 0"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass

duration: 15min
completed: 2026-07-31
status: complete
---

# Phase 3 Plan 09: Dead-letter Queue UI Summary

**`/dead-letter` Server Component table (destructive-red badge for known-sender parse failures, neutral for generic unparseable) with Pending/Resolved tabs and 25/page Load-more pagination, plus a read-only client dialog whose bounded scroll-area renders the full raw email payload as escaped plain text — never `dangerouslySetInnerHTML` — with no delete/dismiss control anywhere on the surface.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-31
- **Completed:** 2026-07-31
- **Tasks:** 2/2
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments
- `src/app/dead-letter/page.tsx` — Server Component reading `listPendingDeadLetter`/`listResolvedDeadLetter` (03-05), rendering a shadcn `Tabs` (Pending/Resolved) over a shadcn `Table` (Type / Sender-Subject / Date / Actions); confirmed empty-state copy per tab verbatim from UI-SPEC; `TypeBadge` renders `variant="destructive"` for `known_sender_failed` and `variant="secondary"` for `unparseable` (D3-04); 25/page pagination via `?pendingLimit`/`?resolvedLimit` URL search params + "Load more" `Link`, mirroring 03-08's `/review` pattern exactly
- `src/components/dead-letter-item.tsx` — client component; the row's "View raw email" `Button` (with an explicit `aria-label`) opens a shadcn `Dialog` containing a bounded-height `ScrollArea`; the raw payload renders as `<pre>{item.rawPayload}</pre>` — a plain JSX text node, never interpolated as HTML — with no character truncation; a null/empty payload renders a graceful "Raw payload unavailable." note instead of crashing; no resolve/delete/dismiss control anywhere in the dialog (read-only diagnostics only)
- `src/app/dead-letter/loading.tsx` — Skeleton-row Suspense fallback, mirroring 03-08's `/review/loading.tsx`
- shadcn `scroll-area` primitive added (official registry, no new npm dependencies — `radix-ui` already installed); a "Dead-letter" nav-shell entry point added alongside "Review"
- `npx tsc --noEmit` clean; all plan-specified automated grep/node checks pass; the real project test suite (`tests/db/seed.test.ts`, `tests/domain/companies.test.ts` at their correct location) passes unaffected — the only failures observed are the same pre-existing stale-worktree copies under `.claude/worktrees/hopeful-mestorf-9a8ba0/tests/` documented in 03-08-SUMMARY.md, confirmed out of scope

## Task Commits

Each task was committed atomically:

1. **Task 1: /dead-letter Server Component table + tabs + pagination + empty states** - `0f5bc1d` (feat)
2. **Task 2: View raw email dialog (escaped plain text in a bounded scroll-area)** - `dc8fb16` (feat)

**Plan metadata:** (this commit, following SUMMARY write)

## Files Created/Modified
- `src/app/dead-letter/page.tsx` - Server Component: Pending/Resolved tabbed, paginated dead-letter table
- `src/app/dead-letter/loading.tsx` - Skeleton-row loading fallback (route-level Suspense boundary)
- `src/components/dead-letter-item.tsx` - Client dialog: read-only "View raw email" viewer, escaped plain text, bounded scroll-area
- `src/components/ui/scroll-area.tsx` - shadcn scroll-area primitive (official registry)
- `src/components/nav-shell.tsx` - Added a "Dead-letter" nav link entry point to `/dead-letter`

## Decisions Made
- The "View raw email" action renders in both the Pending and Resolved tabs (not gated to Pending only) — a resolved item's original raw payload is still diagnostically useful, and nothing in the plan or UI-SPEC restricts the action to unresolved rows.
- Added `src/app/dead-letter/loading.tsx`, not explicitly listed in the plan's `files_modified` — mirrors 03-08's `review/loading.tsx` Skeleton fallback and satisfies the UI-SPEC's "Initial table load renders shadcn Skeleton row placeholders (consistent with 03-08 / Phase 2)" backstop consideration.
- Reused 03-08's exact pagination shape (URL search params, server-rendered `Link`, no client pagination state) rather than inventing a new pattern — the plan explicitly instructs mirroring the review-queue structure.

## Deviations from Plan

### Auto-fixed Issues

None beyond the two additive, non-scope-changing items already captured under Decisions Made above (adding `loading.tsx` and the nav link are Rule 2 — missing critical functionality per the UI-SPEC's explicit backstop/nav requirements, not new design).

**Total deviations:** 0 requiring separate documentation beyond Decisions Made.
**Impact on plan:** None — plan executed as written; two small additive files (loading fallback, nav link) fill gaps the UI-SPEC and success criteria already called for.

## Issues Encountered
- Ran `npx vitest run` and saw 3 pre-existing failures under `.claude/worktrees/hopeful-mestorf-9a8ba0/tests/` — the same stale, untracked worktree checkout documented in 03-08-SUMMARY.md's "Issues Encountered" section (dated 2026-07-28, unrelated to this plan). Confirmed the real `tests/db/seed.test.ts` and `tests/domain/companies.test.ts` at the project's actual `tests/` path pass cleanly when run directly. Out of scope per the deviation rules' scope boundary; not touched.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `/dead-letter` displays real dead-letter items once the Gmail ingestion orchestrator (03-06) ships and a sync produces an unparseable or known-sender-failed message — this plan proves the full read/view loop against the 03-05 domain layer but has no live data to click through yet (no dev server was started; verification is `tsc` + grep-based per the plan's `<verify>` blocks, consistent with 03-08's precedent).
- 03-10 (sidebar review/dead-letter count badges + REL-04 risk note) can link its dead-letter badge to `/dead-letter` now that the route exists.
- No blockers. `npx tsc --noEmit` clean; no delete/dismiss/ignore action controls (grep-verified in `src/app/dead-letter/page.tsx`); no `dangerouslySetInnerHTML` (grep-verified in `src/components/dead-letter-item.tsx`).

---
*Phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing*
*Completed: 2026-07-31*

## Self-Check: PASSED

All claimed files verified present on disk (src/app/dead-letter/page.tsx, src/app/dead-letter/loading.tsx, src/components/dead-letter-item.tsx, src/components/ui/scroll-area.tsx, this SUMMARY.md). Both task commits (`0f5bc1d`, `dc8fb16`) verified present in `git log`.
