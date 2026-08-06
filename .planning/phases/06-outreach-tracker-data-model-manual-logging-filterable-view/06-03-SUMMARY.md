---
phase: 06-outreach-tracker-data-model-manual-logging-filterable-view
plan: 03
subsystem: ui
tags: [server-actions, zod, dialog, shadcn, checkbox, next.js, react]

# Dependency graph
requires:
  - phase: 06-01
    provides: outreachMessages schema + newOutreachInput validation contract
  - phase: 06-02
    provides: createOutreach/listOutreach/getOutreachCountsByContact domain functions
provides:
  - logOutreachAction Server Action (manual write path, hardcoded provenance)
  - outreach-log-form.tsx Dialog (OUT-01 manual logging, 9 fields)
  - outreach-view-dialog.tsx Dialog (OUT-05 read full body, props-only)
  - checkbox.tsx shadcn primitive
affects: [06-04, 06-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action write-path convention (safeParse -> typed ActionResult -> domain write -> revalidatePath)"
    - "Progressive disclosure via conditional-render blocks (isNewContact / isOtherPurpose / responded)"
    - "Stored-XSS mitigation: free text persisted verbatim, rendered only as escaped JSX with whitespace-pre-wrap"

key-files:
  created:
    - src/components/ui/checkbox.tsx
    - src/components/outreach-log-form.tsx
    - src/components/outreach-view-dialog.tsx
  modified:
    - src/app/actions.ts

key-decisions:
  - "logOutreachAction hardcodes source:\"manual\"/sourceMessageId:null server-side; newOutreachInput never declares either field, closing the provenance-spoof surface at the schema level (T-06-06)"
  - "outreach-log-form's new-contact sub-form is deliberately trimmed to Name/Email/LinkedIn only (Role/Relationship/Source/Channel omitted) per D-12 low-friction logging"
  - "outreach-view-dialog omits a null Subject entirely (no em-dash) since LinkedIn messages structurally have none; Body is always rendered since it's required at log time"

patterns-established:
  - "Pattern: read-only props-only Dialog for full-content display (no fetch inside the dialog) — outreach-view-dialog is the first instance in this codebase"

requirements-completed: [OUT-01, OUT-05, OUT-06]

coverage:
  - id: D1
    description: "logOutreachAction validates input, resolves company (find-or-create) and contact (existing or new), writes a manual-sourced outreach row via createOutreach, and revalidates /outreach + /contacts"
    requirement: "OUT-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "No automated test exercises the Server Action end-to-end (DB write + revalidate); type-check alone proves the contract compiles, not that the write path behaves correctly against a live DB."
  - id: D2
    description: "outreach-log-form Dialog collects all 9 fields with correct required/optional gating, progressive disclosure (new-contact sub-form, Other purpose, Outcome-on-Responded), and fails loudly on save error"
    requirement: "OUT-01"
    verification: []
    human_judgment: true
    rationale: "Interactive form behavior (field gating, disclosure toggling, error surfacing) requires manual or browser-automation verification not present in this plan's scope."
  - id: D3
    description: "outreach-view-dialog renders title, pill row, optional subject, full escaped body, and optional outcome from OutreachRow props with no fetch"
    requirement: "OUT-05"
    verification: []
    human_judgment: true
    rationale: "Visual rendering (null-subject omission, pill colors, scroll behavior) requires manual or browser-automation verification not present in this plan's scope."
  - id: D4
    description: "checkbox.tsx installed via official shadcn registry with zero package.json changes"
    verification:
      - kind: other
        ref: "git diff --stat package.json (empty after npx shadcn add checkbox)"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-08-06
status: complete
---

# Phase 6 Plan 3: Outreach Log Form + View Dialog Summary

**logOutreachAction Server Action plus outreach-log-form and outreach-view-dialog Dialogs, closing the manual-logging write loop (OUT-01) and full-body read surface (OUT-05) with hardcoded manual provenance and escaped-JSX-only rendering.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-06T15:22:35Z
- **Completed:** 2026-08-06T15:25:00Z
- **Tasks:** 3 completed
- **Files modified:** 4 (1 modified, 3 created)

## Accomplishments
- `logOutreachAction` validates via `newOutreachInput.safeParse`, resolves company via `resolveCompany ?? createCompany`, resolves the recipient (existing `contactId` or a new `createContact` call), writes through `createOutreach` with hardcoded `source:"manual"`/`sourceMessageId:null`, and revalidates `/outreach` + `/contacts`
- `outreach-log-form.tsx` Dialog collects all 9 fields (Recipient, Company, Channel, Purpose, Subject, Body, Sent date, Responded, Outcome) with progressive disclosure for the new-contact sub-form, "Other" purpose free text, and the Responded-gated Outcome field
- `outreach-view-dialog.tsx` renders a read-only full-body view from already-loaded `OutreachRow` props — title, pill row (Channel/Purpose/Sent date/Responded), optional subject (omitted when null, not "—"), scrollable body, optional outcome — with no `dangerouslySetInnerHTML` anywhere
- `checkbox.tsx` installed via `npx shadcn add checkbox` (official registry) with zero `package.json` change, confirmed by `git diff --stat`

## Task Commits

Each task was committed atomically:

1. **Task 1: Install checkbox primitive + add logOutreachAction** - `e79d66f` (feat)
2. **Task 2: outreach-log-form Dialog** - `7264e46` (feat)
3. **Task 3: outreach-view-dialog** - `100544d` (feat)

**Plan metadata:** (pending — see final commit below)

## Files Created/Modified
- `src/components/ui/checkbox.tsx` - shadcn official checkbox primitive (radix-ui backed), used by the Responded field
- `src/app/actions.ts` - added `logOutreachAction`; imports `createContact`, `createOutreach`, `newOutreachInput`
- `src/components/outreach-log-form.tsx` - manual outreach logging Dialog, all 9 fields + progressive disclosure
- `src/components/outreach-view-dialog.tsx` - read-only full-body Dialog, props-only, no fetch

## Decisions Made
- Hardcoded `source`/`sourceMessageId` inside `logOutreachAction` only (never in `newOutreachInput`, which doesn't declare either field) so a manual row can never masquerade as gmail-ingested (T-06-06)
- New-contact sub-form in the log form intentionally omits Role/Relationship/Source/Channel (present in `ContactConversationForm`'s analogous block) to keep outreach logging fast, per D-12 and UI-SPEC Surface 2
- Purpose "Other" free text and Responded-gated Outcome both use the same conditional-render (`{condition && (...)}`) pattern as `isNewContact`, for consistency with the existing form convention
- `outreach-view-dialog` pill color maps are defined inline in the component (no shared pill-component module existed to reuse) per the UI-SPEC Color table's exact class values

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `logOutreachAction`, `outreach-log-form.tsx`, and `outreach-view-dialog.tsx` are ready for 06-04 to host on `/outreach` and 06-05 to wire the Contact Database cross-link
- `outreach-log-form` expects an `existingContacts: ExistingOutreachContactOption[]` prop (contactId + name) — 06-04's page must supply this from a contacts read
- `outreach-view-dialog` expects an `outreach: OutreachRow` prop (from `listOutreach`) — 06-04's table "View" button is the intended trigger
- No blockers identified for 06-04/06-05

---
*Phase: 06-outreach-tracker-data-model-manual-logging-filterable-view*
*Completed: 2026-08-06*

## Self-Check: PASSED

- FOUND: src/components/ui/checkbox.tsx
- FOUND: src/components/outreach-log-form.tsx
- FOUND: src/components/outreach-view-dialog.tsx
- FOUND: src/app/actions.ts
- FOUND commit: e79d66f
- FOUND commit: 7264e46
- FOUND commit: 100544d
