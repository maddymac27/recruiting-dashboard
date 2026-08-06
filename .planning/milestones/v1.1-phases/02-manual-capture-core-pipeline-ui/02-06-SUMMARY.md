---
phase: 02-manual-capture-core-pipeline-ui
plan: 06
subsystem: ui
tags: [next, server-actions, react-19, useActionState, zod, sqlite, event-sourcing, xss]

# Dependency graph
requires:
  - phase: 02-04
    provides: job detail page (src/app/job/[id]/page.tsx), unified timeline (getJobTimeline), getConversationsForApplication
  - phase: 01
    provides: createContact / linkContactToApplication / addConversation domain writes, newContactInput / newConversationInput Zod schemas
provides:
  - Inline contact + conversation logging on the job detail page (CAP-04)
  - Free-text paste path capturing a self-forwarded LinkedIn note verbatim as a conversation entry
  - logContactAction / logConversationAction Server Actions (safeParse + revalidatePath)
  - Contacts/conversations sub-list empty-state backstop on the detail page
affects: [phase-03-gmail-ingestion, phase-05-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action mutation tier: 'use server' module safeParses against Phase 1 Zod schemas, then revalidatePath(`/job/${id}`) so the unified timeline reflects the write without a reload"
    - "Client form receives applicationId/companyId as props and mutates ONLY via Server Actions — never imports @/db/client (server-only isolation, T-02-18)"
    - "Free-text (pasted) notes persisted verbatim with no length cap; rendered back only as escaped JSX text nodes (stored-XSS mitigation, T-02-16)"

key-files:
  created:
    - src/app/job/[id]/actions.ts
    - src/components/contact-conversation-form.tsx
  modified:
    - src/app/job/[id]/page.tsx
    - src/domain/contacts.ts
    - tests/domain/contacts.test.ts

key-decisions:
  - "companyId and applicationId are supplied to the Server Actions by the detail Server Component (from the application's own row), never trusted from client input — a contact always belongs to the job's company (D-03)"
  - "notes persisted verbatim by addConversation (no length cap, no transformation) so a pasted self-forwarded LinkedIn note is captured in full (CAP-04 free-text edge)"
  - "Added getContactSummariesForApplication to src/domain/contacts.ts to drive the detail-page contacts sub-list + empty-state backstop (small read helper, kept in the Task 1 commit)"
  - "Notes rendered only as escaped JSX text nodes via the 02-04 timeline — no raw-HTML injection prop anywhere in the paste round-trip (T-02-16)"

patterns-established:
  - "Pattern: inline write form on a read page — 'use client' form + route-local 'use server' actions.ts + revalidatePath, props-not-imports for server-only deps"

requirements-completed: [CAP-04]

coverage:
  - id: D1
    description: "logContactAction / logConversationAction persist a contact linked to the job's company and a conversation attached to the application, then revalidate the detail path"
    requirement: CAP-04
    verification:
      - kind: unit
        ref: "tests/domain/contacts.test.ts#addConversation with applicationId readable via getConversationsForApplication"
        status: pass
    human_judgment: false
  - id: D2
    description: "Free-text paste path captures a long/unicode self-forwarded LinkedIn note verbatim with no truncation or character cap"
    requirement: CAP-04
    verification:
      - kind: unit
        ref: "tests/domain/contacts.test.ts#addConversation - long/unicode notes round-trip (CAP-04 free-text paste path)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Inline contact/conversation form on the job detail page logs an entry that appears in the unified timeline without leaving the page"
    verification:
      - kind: manual_procedural
        ref: "Open a demo job → log a contact + conversation via inline form → entry appears in timeline; paste a long multi-paragraph note → saved in full and wraps without truncation"
        status: unknown
    human_judgment: true
    rationale: "End-to-end UI flow (form submit → revalidation → timeline render) was not machine-verified; the executor's dev-server verification was interrupted by an API stall. Requires UAT."
  - id: D4
    description: "Empty contacts sub-list renders the 'No contacts yet' / 'Log a contact to keep track of who you've spoken with.' backstop copy instead of a blank gap"
    verification:
      - kind: manual_procedural
        ref: "Open a job with no contacts → backstop empty state renders (grep confirms both copy strings present in page.tsx)"
        status: unknown
    human_judgment: true
    rationale: "Visual backstop — copy presence is grep-confirmed, but rendered appearance is a human visual check."

# Metrics
duration: ~25min
completed: 2026-07-29
status: complete
---

# Phase 02 Plan 06: Inline Contact + Conversation Logging Summary

**Inline contact/conversation logging on the job detail page (CAP-04) — 'use client' form + route-local Server Actions that safeParse against the Phase 1 Zod schemas and revalidate the detail path, with a free-text paste path that captures a self-forwarded LinkedIn note verbatim into the unified timeline.**

## Performance

- **Duration:** ~25 min (implementation), plus orchestrator manual close-out
- **Started:** 2026-07-29T14:41:06-05:00 (Task 1 commit)
- **Completed:** 2026-07-29 (Task 2 commit 2026-07-29T15:03:04-05:00; closed out during orchestration)
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments
- Two route-local Server Actions (`logContactAction`, `logConversationAction`) that `safeParse` client input against the Phase 1 `newContactInput` / `newConversationInput` schemas before any Drizzle write, then `revalidatePath(`/job/${id}`)` so a new entry surfaces in the unified timeline without a reload.
- `ContactConversationForm` (`'use client'`, React 19 `useActionState`) embedded on the job detail page, with a `Textarea` notes field (no length cap) that doubles as the free-text self-forwarded-LinkedIn-note paste path.
- Contacts/conversations sub-list with a "No contacts yet" empty-state backstop on the detail page.
- Extended `tests/domain/contacts.test.ts` with application-scoped conversation coverage and a long/unicode notes round-trip test proving verbatim capture.

## Task Commits

1. **Task 1: Contact + conversation Server Actions (log against application) with tests** — `5ae79ed` (feat) — also added the `getContactSummariesForApplication` read helper to `src/domain/contacts.ts` for the sub-list.
2. **Task 2: Contact/conversation form (with paste path) embedded on the detail page + contacts sub-list empty state** — `bd912d7` (feat)

**Plan metadata:** SUMMARY.md + tracking committed during orchestrator close-out (see Issues Encountered).

## Files Created/Modified
- `src/app/job/[id]/actions.ts` (created) — `logContactAction` / `logConversationAction`; caller-supplied companyId/applicationId (not trusted from client), notes persisted verbatim.
- `src/components/contact-conversation-form.tsx` (created, 399 lines) — inline `'use client'` form; no `@/db/client` import (grep-verified 0); no `maxLength` on the notes Textarea.
- `src/app/job/[id]/page.tsx` (modified) — embeds the form, renders the contacts sub-list + empty-state backstop copy, threads applicationId/companyId as props.
- `src/domain/contacts.ts` (modified) — added `getContactSummariesForApplication`.
- `tests/domain/contacts.test.ts` (modified) — application-scoped conversation + long/unicode round-trip cases (8/8 pass).

## Decisions Made
- companyId/applicationId are supplied server-side by the detail component, never trusted from client input (D-03 + T-02-18).
- notes captured verbatim with no cap and rendered only as escaped JSX (CAP-04 free-text + T-02-16 stored-XSS mitigation).
- Small `getContactSummariesForApplication` read helper kept in the Task 1 commit rather than split into its own change.

## Deviations from Plan

### Auto-fixed Issues
None affecting implementation scope — the code matches the plan's task/artifact contract and all acceptance-criteria greps pass. (The single `maxLength` token in the form is inside an explanatory comment stating the notes Textarea has no cap — not an attribute.)

---

**Total deviations:** 0 implementation deviations.
**Impact on plan:** Delivered as specified. One acceptance-criterion command (`npm run build`) is not satisfiable due to a pre-existing failure unrelated to this plan — see Issues Encountered.

## Issues Encountered

1. **`npm run build` fails on a pre-existing Turbopack build-worker crash.** Confirmed present before any Phase 2 write-slice code (isolated by plan 02-05 via `git apply -R`). `npx tsc --noEmit` (clean) is the substituted integration signal for this plan, consistent with 02-05. Logged in `deferred-items.md`.
2. **Executor stalled twice on transient API errors** ("Response stalled mid-stream", then two `529 Overloaded`) during Task 2 verification / close-out. Task 1 (`5ae79ed`) had already committed; Task 2's implementation was complete and correct in the working tree but uncommitted. Per the execute-phase safe-resume gate, the orchestrator verified git/disk state, independently re-ran `npx tsc --noEmit` (clean) and `npx vitest run tests/domain/contacts.test.ts` (8/8 pass), then closed the plan out manually: committed Task 2 by explicit path (`bd912d7`, excluding the unrelated Next.js `tsconfig.json` auto-rewrite and `next-env.d.ts`), wrote this SUMMARY, and updated tracking. No implementation work was re-done or duplicated.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 2's final capture slice is complete: the manual tracker now supports quick-save, add/edit, change-stage (02-05), and inline contact/conversation logging (02-06) — CAP-01/CAP-02/CAP-04 all delivered on the read surface built in Waves 1–2.
- **UAT recommended** for the two `human_judgment: true` deliverables (D3 inline-log → timeline flow; D4 empty-state backstop) — the executor's dev-server verification was cut short by the API stall.
- Carry-forward: the pre-existing `npm run build` Turbopack crash should be resolved before any production build / deploy (Phase 3+), tracked in `deferred-items.md`.

---
*Phase: 02-manual-capture-core-pipeline-ui*
*Completed: 2026-07-29*
