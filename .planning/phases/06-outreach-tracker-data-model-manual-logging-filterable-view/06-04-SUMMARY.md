---
phase: 06-outreach-tracker-data-model-manual-logging-filterable-view
plan: 04
subsystem: ui
tags: [nextjs, react, server-components, client-table, drizzle]

requires:
  - phase: 06-outreach-tracker-data-model-manual-logging-filterable-view
    provides: "06-02 listOutreach domain read; 06-03 OutreachLogForm + OutreachViewDialog components and logOutreachAction"
provides:
  - "/outreach route: filterable/sortable Outreach tab, live end-to-end"
  - "OutreachTable client component (search + Channel/Responded filters + click-to-sort)"
  - "contactId deep-link support with a dismissible 'Filtered by {name}' chip"
  - "'Outreach' sidebar nav entry"
affects: [contacts, board, nav]

tech-stack:
  added: []
  patterns:
    - "OutreachTable is a structural clone of application-table.tsx (search input + N selects + click-to-sort headers + rounded-xl bordered table), the third component to follow this exact shape after application-table.tsx and contacts-table.tsx"
    - "Stable secondary sort by id-ascending appended to every primary sort comparator so equal-key rows never reorder across renders"

key-files:
  created:
    - src/components/outreach-table.tsx
    - src/app/outreach/page.tsx
    - src/app/outreach/loading.tsx
  modified:
    - src/components/nav-shell.tsx

key-decisions:
  - "Recipient cell renders as plain text (avatar + name), never a Link — no /contacts/[id] route exists in this codebase (RESEARCH Pitfall 5, T-06-15)"
  - "Reused listContactsWithOutreach(db) (not a new domain function) to source both the log form's recipient picker and the deep-link chip's contact name — avoids scope creep into src/domain/contacts.ts, which this plan's files_modified list did not include"
  - "filterChip is rendered by the page above whichever branch is active (populated table via OutreachTable's filterChip prop, or the empty-state card directly) so the dismissible chip is visible even when a contactId filter matches zero rows"

patterns-established:
  - "Sort comparator convention: primary-key comparison first, then `return primary !== 0 ? primary : a.id - b.id` as an unconditional (direction-independent) stable tiebreak"

requirements-completed: [OUT-03, OUT-04, OUT-06]

coverage:
  - id: D1
    description: "OutreachTable renders all nine columns (Recipient/Company/Channel/Purpose/Subject/Sent date/Responded/Outcome/Actions), search + Channel + Responded filters narrow rows, and sort works with a stable Sent-date-desc default"
    requirement: "OUT-04"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (clean)"
        status: pass
      - kind: e2e
        ref: "manual curl smoke against `next dev` (demo mode): GET /outreach returned 6 'No response yet' + 6 'Responded' pills and 13 'View' actions across the seeded rows"
        status: pass
    human_judgment: true
    rationale: "Interactive sort/filter/search behavior in the browser (click-to-sort direction toggling, live search-as-you-type) was not exercised via a real browser session — curl/tsc confirm the route renders and compiles, but visual/interaction verification needs a human or a browser-automation pass."
  - id: D2
    description: "/outreach route lists seeded outreach in demo mode, hosts the '+ Log outreach' CTA, and shows empty/error state copy per the Copywriting Contract"
    requirement: "OUT-03"
    verification:
      - kind: e2e
        ref: "manual curl smoke: GET /outreach (demo mode) rendered the 'Outreach' h1, '+ Log outreach' button, and populated table (no error/empty copy, since demo seed has rows)"
        status: pass
    human_judgment: true
    rationale: "Empty-state and forced-error-state copy were verified by code inspection (mirrors contacts/page.tsx's verified pattern) rather than by forcing 0 rows or a thrown read error in a live session."
  - id: D3
    description: "/outreach?contactId={id} pre-filters the list server-side and renders a dismissible 'Filtered by {name} ✕' chip that clears back to /outreach; the Contacts page's Outreach badge links to this deep-link"
    requirement: "OUT-06"
    verification:
      - kind: e2e
        ref: "manual curl smoke: GET /outreach?contactId=1 rendered 'Filtered by Priya Nandakumar ✕'; GET /contacts contained href=\"/outreach?contactId=1..5\" links"
        status: pass
    human_judgment: false
  - id: D4
    description: "'Outreach' sidebar nav link appears between 'Contact Database' and 'Review' with active-state styling"
    verification:
      - kind: e2e
        ref: "manual curl smoke: GET /outreach HTML nav anchors ordered 'Contact Database' -> 'Outreach' -> 'Review'; Outreach anchor carries bg-primary/10 text-primary"
        status: pass
    human_judgment: false

duration: ~12min
completed: 2026-08-06
status: complete
---

# Phase 06 Plan 04: Outreach Tab Route Summary

**Stood up the `/outreach` route (filterable/sortable OutreachTable + nav link + contactId deep-link chip), completing the manual outreach loop end-to-end.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-08-06T15:41:47Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `OutreachTable` — a structural clone of `application-table.tsx` with search + Channel/Responded filters, click-to-sort headers (Company/Channel/Sent date/Responded), and a stable id-ascending tiebreak so equal Sent dates never reorder between renders
- `/outreach` Server Component route: try/catch read via `listOutreach`, "Couldn't load outreach. Refresh to try again." on failure, dashed "No outreach logged yet" on 0 rows, otherwise the table — hosts the `OutreachLogForm` "+ Log outreach" CTA
- `/outreach?contactId={id}` deep-link: server-side filtered read plus a dismissible "Filtered by {contact name} ✕" chip that clears back to `/outreach` — confirmed live against the 06-05 Contacts-table cross-link
- Route-level `loading.tsx` skeleton table placeholder
- "Outreach" sidebar nav entry inserted between "Contact Database" and "Review", inheriting the existing generic active-state styling

## Task Commits

Each task was committed atomically:

1. **Task 1: OutreachTable — filterable/sortable client table with pills + View action** - `f789abf` (feat)
2. **Task 2: /outreach route (page + loading) + nav link** - `64a1b29` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/components/outreach-table.tsx` - filterable/sortable client table; Recipient as plain text, pills for Channel/Purpose/Responded, "View" opens `OutreachViewDialog`
- `src/app/outreach/page.tsx` - Server Component route: read, empty/error states, log-form CTA, deep-link chip resolution
- `src/app/outreach/loading.tsx` - route-level Skeleton table placeholder
- `src/components/nav-shell.tsx` - added the "Outreach" `NAV_ITEMS` entry

## Decisions Made
- Reused `listContactsWithOutreach(db)` (already exported from `src/domain/contacts.ts`) to source both the log form's `existingContacts` picker and the deep-link chip's contact name, rather than adding a new domain function — kept this plan's file scope to exactly the four `files_modified` paths in the frontmatter.
- Rendered the deep-link `filterChip` at the page level, above whichever branch is active (populated table via `OutreachTable`'s `filterChip` prop, or directly above the empty-state card) — so the chip and its "clear filter" affordance stay visible even if a `contactId` filter matches zero outreach rows, a case the plan's must-haves didn't explicitly resolve.
- Confirmed `listOutreach`'s actual signature is `listOutreach(db, opts?: { contactId?: number })` (per the already-shipped 06-02 domain code) — used that shape directly rather than the plan context note's shorthand `listOutreach(db, contactId?)`.

## Deviations from Plan

None — plan executed exactly as written. `sequential_execution` context's shorthand description of `listOutreach`'s signature (`listOutreach(db, contactId?)`) was reconciled against the actual 06-02 implementation (`listOutreach(db, { contactId? })`) during Task 2; this is a doc-vs-code reading correction, not a functional deviation.

## Issues Encountered
None. `npx tsc --noEmit` was clean after both tasks. A local `next dev` smoke test (demo mode, port 3417) confirmed: `/outreach` returns 200 and renders the populated table (13 rows, 6 "Responded"/6 "No response yet" pills, 13 "View" actions); `/outreach?contactId=1` renders the "Filtered by Priya Nandakumar ✕" chip; `/contacts` links into `/outreach?contactId={1..5}`; the sidebar nav renders `Contact Database -> Outreach -> Review` with the active link correctly styled. The dev server was stopped after the smoke test. Per STATE.md's pre-existing, unrelated Turbopack `npm run build` failure, verification used the plan's documented fallback (tsc + dev-server smoke) rather than a full production build.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
The manual outreach loop (log -> list -> filter/sort -> read -> see-what-converted, OUT-01/03/04/05/06) is now live end-to-end in demo mode. Phase 6 is complete; Phase 7 (Outreach Auto-Capture, OUT-02) can build the Gmail self-forward ingestion path on top of this schema/UI without further Phase 6 work.

---
*Phase: 06-outreach-tracker-data-model-manual-logging-filterable-view*
*Completed: 2026-08-06*

## Self-Check: PASSED

- FOUND: src/components/outreach-table.tsx
- FOUND: src/app/outreach/page.tsx
- FOUND: src/app/outreach/loading.tsx
- FOUND: .planning/phases/06-outreach-tracker-data-model-manual-logging-filterable-view/06-04-SUMMARY.md
- FOUND commit: f789abf
- FOUND commit: 64a1b29
