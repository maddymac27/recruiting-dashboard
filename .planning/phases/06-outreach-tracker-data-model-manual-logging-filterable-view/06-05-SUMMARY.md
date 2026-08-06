---
phase: 06-outreach-tracker-data-model-manual-logging-filterable-view
plan: 05
subsystem: ui
tags: [nextjs, drizzle, contacts, outreach, demo-seed]

# Dependency graph
requires:
  - phase: 06-outreach-tracker-data-model-manual-logging-filterable-view (plan 02)
    provides: "src/domain/outreach.ts — createOutreach, getOutreachCountsByContact"
provides:
  - "ContactOutreachRow.outreachCount — per-contact outreach count derived via TypeScript Map (no grouped SQL)"
  - "'Outreach' column on the Contact Database table, deep-linking to /outreach?contactId={id} (D-11)"
  - "DemoOutreachFixture fixtures + seed replay so demo mode shows invented outreach data"
affects: [06-04-outreach-list-and-filters]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cross-link badge: reuse the existing Touchpoints badge classes, wrapped in a Next.js Link only when count > 0; plain muted dash otherwise"
    - "Demo fixture nesting: DemoOutreachFixture nests under DemoContactFixture (mirrors conversations), since contactId + companyId are only known at replay time"

key-files:
  created: []
  modified:
    - src/domain/contacts.ts
    - src/components/contacts-table.tsx
    - src/demo/seed/companies.ts
    - src/demo/seed/seed.ts

key-decisions:
  - "outreachCount computed via getOutreachCountsByContact(db) Map lookup inside listContactsWithOutreach, mirroring the existing touchpoints reduce-not-groupBy line exactly"
  - "Outreach fixtures added to 6 existing/new contacts across 6 companies (Brightloom x2, Northwind, Ember & Vale, Ironvale, Quietbrook, plus new contacts at Cascade Sundry Co, Stonebridge Robotics, Palisade Data Systems) for demo variety without inventing implausible new companies"

patterns-established:
  - "Contact Database rows now carry both `touchpoints` (conversations) and `outreachCount` (outreach_messages) as separate counts — future contact-list extensions should keep these as two distinct aggregates, not merged"

requirements-completed: [OUT-01, OUT-03]

coverage:
  - id: D1
    description: "ContactOutreachRow gains outreachCount populated from getOutreachCountsByContact via Map lookup (no grouped SQL)"
    requirement: "OUT-03"
    verification:
      - kind: unit
        ref: "tests/domain/contacts.test.ts (existing suite, all 6 tests green with the added field)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "Contact Database table renders an 'Outreach' column: count>0 links to /outreach?contactId={id}, count 0 renders a plain muted dash"
    requirement: "OUT-03"
    verification: []
    human_judgment: true
    rationale: "Visual rendering and click-through behavior of the badge/Link require a human to view the running app; no automated UI test exists for contacts-table.tsx"
  - id: D3
    description: "Demo seed replays invented outreach fixtures through createOutreach into data/demo.sqlite: 9 rows, 5 Email/4 LinkedIn, 5 responded=false/4 responded=true, spanning all 6 purpose categories"
    requirement: "OUT-01"
    verification:
      - kind: other
        ref: "DASHBOARD_MODE=demo npm run db:seed:demo; SELECT COUNT(*) FROM outreach_messages on data/demo.sqlite (verified: 9 rows, channel/responded breakdown confirmed via query)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-08-06
status: complete
---

# Phase 06 Plan 05: Contact cross-link + demo outreach seed Summary

**Contact Database "Outreach" column deep-links into /outreach?contactId={id} (D-11), backed by a TypeScript Map count; demo mode seeded with 9 invented outreach rows across 6 companies via the real createOutreach write path.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-06T10:28:35-05:00
- **Completed:** 2026-08-06T10:31:39-05:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `ContactOutreachRow` gains `outreachCount`, computed via `getOutreachCountsByContact(db)` — a `Map<contactId, count>` lookup, never a grouped SQL query
- `contacts-table.tsx` gains an "Outreach" column after "Touchpoints": a positive count renders the same badge styling as Touchpoints wrapped in a `Link` to `/outreach?contactId={id}`; a zero count renders a plain, non-linked muted dash
- `DemoOutreachFixture` interface added, nested under `DemoContactFixture` (mirrors how `conversations` nests under `contacts`), with a load-bearing "invented, never real" doc comment
- 9 invented outreach fixtures added across 6 companies (2 new contacts created purely for outreach demonstration at Stonebridge Robotics and Palisade Data Systems, plus one at Cascade Sundry Co) — spanning both channels, all 6 purpose categories, and a genuine responded true/false mix
- `seedDemo` replays every outreach fixture through `createOutreach` (never a raw INSERT), hardcoding `source: "manual"` / `sourceMessageId: null`, same write path the Server Action and future Gmail auto-capture will use

## Task Commits

Each task was committed atomically:

1. **Task 1: Cross-link — outreachCount in contacts domain + "Outreach" column in contacts-table** - `9ba8362` (feat)
2. **Task 2: Portfolio-safe demo outreach fixtures + seed replay** - `7b9bda4` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/domain/contacts.ts` - `ContactOutreachRow.outreachCount` field; `listContactsWithOutreach` now calls `getOutreachCountsByContact(db)` and sets `outreachCount` via Map lookup
- `src/components/contacts-table.tsx` - new "Outreach" `<th>`/`<td>` after Touchpoints; `Link` import added; count>0 links to `/outreach?contactId={id}`, count 0 is a plain dash
- `src/demo/seed/companies.ts` - new `DemoOutreachFixture` interface + `outreach?: DemoOutreachFixture[]` on `DemoContactFixture`; 9 fixtures added across 8 contacts (6 pre-existing, 3 newly added for demo variety)
- `src/demo/seed/seed.ts` - imports `createOutreach` from `@/domain/outreach`; added the per-contact outreach replay loop after the conversations replay

## Decisions Made
- Kept `outreachCount` as a fully separate field from `touchpoints` rather than merging them — Touchpoints counts `conversations` rows, Outreach counts `outreach_messages` rows; conflating them would misrepresent what each column measures
- Added 3 new demo contacts (Stonebridge Robotics, Palisade Data Systems, Cascade Sundry Co) rather than only reusing existing recruiter contacts, so the demo dataset demonstrates outreach to peers and cold recruiter contacts too, not just people already in an active conversation thread

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The `/outreach?contactId={id}` deep-link target is consumed by 06-04's filterable list (parallel plan, disjoint files) — this plan supplies the working link source, not the destination route itself.
- Demo dataset now contains outreach data end-to-end: `npm run db:seed:demo` under `DASHBOARD_MODE=demo` produces a fully wired demo including cross-linked outreach counts, ready for screen-share once 06-04's `/outreach` route lands.
- No blockers.

---
*Phase: 06-outreach-tracker-data-model-manual-logging-filterable-view*
*Completed: 2026-08-06*

## Self-Check: PASSED

All created/modified files found on disk; both task commits (9ba8362, 7b9bda4) verified present in git log.
