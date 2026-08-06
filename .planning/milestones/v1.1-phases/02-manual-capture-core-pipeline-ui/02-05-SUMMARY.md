---
phase: 02-manual-capture-core-pipeline-ui
plan: 05
subsystem: ui
tags: [nextjs, server-actions, drizzle, event-sourcing, react19, shadcn]

# Dependency graph
requires:
  - phase: 02-manual-capture-core-pipeline-ui
    provides: "02-02 quickSaveApplicationInput/updateApplicationInput schemas + appendStatusEventTx; 02-03 read-only board (page.tsx, PipelineBoard, BoardColumn, ApplicationCard, listStages/listRoleTypes/listSources)"
provides:
  - "src/domain/applications.ts — quickSaveApplication(db, savedStageId, input), updateApplication(db, id, input): atomic, event-sourcing-safe write paths"
  - "src/app/actions.ts — quickSaveAction, addApplicationAction, updateApplicationAction, changeStageAction Server Actions"
  - "src/components/{quick-save-dialog,application-form-dialog,stage-change-dialog}.tsx — client mutation dialogs"
  - "The board is no longer read-only: Add/Quick-Save/Edit/Change-stage all live and wired end-to-end"
affects: [02-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "quickSaveApplication composes resolveCompany/createCompany + a direct tx.insert(applications) (not createApplication, which would silently strip postingUrl via newApplicationInput.parse) + appendStatusEventTx, all inside one db.transaction"
    - "updateApplication splits validated input into directFields + stageId; directFields go through tx.update(applications).set(...), stageId (only if present) goes through appendStatusEventTx — both inside the same outer transaction, never a direct currentStageId write"
    - "Dialog components receive lookup arrays (stages/roleTypes/sources) as props threaded from the Server Component tree (page.tsx -> PipelineBoard -> BoardColumn -> ApplicationCard) — no dialog ever imports @/db/client"
    - "Icon-only card triggers (edit, change-stage) render outside the card's <Link>, each stopPropagation()-guarded and sized to a 44px minimum hit target (UI-SPEC spacing exception)"
    - "Edit mode only includes stageId in the update payload when it differs from the card's original stage — appendStatusEventTx has no same-stage dedup, so always sending it would append a spurious duplicate event on every unrelated field edit"

key-files:
  created:
    - src/components/application-form-dialog.tsx
    - src/components/quick-save-dialog.tsx
    - src/components/stage-change-dialog.tsx
  modified:
    - src/domain/applications.ts
    - tests/domain/applications.test.ts
    - src/app/actions.ts
    - src/domain/board.ts
    - src/components/application-card.tsx
    - src/components/board-column.tsx
    - src/components/pipeline-board.tsx
    - src/app/page.tsx
    - .planning/phases/02-manual-capture-core-pipeline-ui/deferred-items.md

key-decisions:
  - "quickSaveApplication inserts directly against `applications` inside its own transaction rather than delegating to createApplication, because createApplication validates through newApplicationInput (no postingUrl field) and would silently strip it via Zod's default strip-unknown-keys behavior."
  - "Extended BoardApplication (board.ts) with companyId/roleTypeId/sourceId/postingUrl so the inline edit dialog can pre-fill every field from the board's own read model, without a second per-card getApplicationDetail fetch."
  - "Added an 'Edit application' trigger to application-card.tsx — not explicitly named in Task 3's action text (which only calls out the change-stage trigger), but CAP-02 ('edit any field on an existing application') has no other UI entry point within this plan's declared file scope; without it, edit mode would have no way to be invoked from the board this plan."
  - "updateApplicationAction accepts an optional companyName (resolved/created the same way quick-save/add do) alongside updateApplicationInput's fields, since companies aren't a fixed lookup (D-04) and the client can't reasonably supply a numeric companyId for a free-text company field."
  - "board-column.tsx and pipeline-board.tsx (not in the plan's declared files_modified) were threaded with stages/roleTypes/sources props — required end-to-end wiring for the declared Task 3 deliverable (the card's embedded triggers), not scope creep."

patterns-established:
  - "Server Action mutation pattern: safeParse against the 02-02 Zod schemas -> call the event-sourcing-safe @/domain/* write -> revalidatePath('/') (+ /job/[id] for any stage-affecting edit) -> typed { ok, error? } result consumed by a client dialog via useTransition + sonner toast on failure."

requirements-completed: [CAP-01, CAP-02]

coverage:
  - id: D1
    description: "quickSaveApplication + updateApplication domain writes: atomic company-resolve/create + application-insert + Saved-event transaction (with rollback on any throw), and a stageId-triggers-event-append update supporting a combined field+stage single-transaction edit"
    requirement: CAP-01
    verification:
      - kind: unit
        ref: "tests/domain/applications.test.ts#quickSaveApplication (3 cases: atomic create + Saved event, existing-company resolution, rollback-on-throw — no orphan company/application/event survives)"
        status: pass
      - kind: unit
        ref: "tests/domain/applications.test.ts#updateApplication (3 cases: direct-field-only leaves currentStageId untouched, stageId appends exactly one event + recomputes, combined field+stage commits in one transaction with no nested-transaction error)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Server Actions (quickSaveAction, addApplicationAction, updateApplicationAction, changeStageAction) safeParse input, return the exact 'Couldn't save this change...' error copy on failure, call the domain writes, and revalidatePath the affected routes"
    requirement: CAP-02
    verification:
      - kind: other
        ref: "npx tsc --noEmit (0 errors); grep -c 'use server'/'revalidatePath'/\"Couldn't save this change\" src/app/actions.ts (Task 2 acceptance_criteria, all pass)"
        status: pass
    human_judgment: true
    rationale: "Actual Server Action invocation from a submitted form (both the success path and the safeParse-failure -> toast path) isn't exercised by the node-only Vitest suite (no jsdom/RTL this phase, per 02-VALIDATION.md's Manual-Only Verifications table) — structural checks (tsc, grep) prove the wiring exists and is correctly shaped; a human should click through Quick-Save/Add/Edit/Change-stage once to confirm the full round trip."
  - id: D3
    description: "Quick-save, add/edit, and change-stage dialogs wired into the board: 'Add Application' + 'Quick-Save Job' CTAs on page.tsx (empty and populated states), and an edit + change-stage trigger embedded on every card, all reading lookups from props and never importing @/db/client"
    requirement: CAP-01
    verification:
      - kind: manual_procedural
        ref: "npm run dev DASHBOARD_MODE=demo + curl content check: '/' contains 'Quick-Save Job' (>=1), 'Add Application' (>=1), 'Edit application' (>=1), 'Change stage' (>=1), 'DEMO' badge present; '/job/1' returns HTTP 200"
        status: pass
      - kind: other
        ref: "grep: zero '@/db/client' imports across quick-save-dialog.tsx, application-form-dialog.tsx, stage-change-dialog.tsx; npx tsc --noEmit; npx vitest run tests/domain/applications.test.ts tests/domain/board.test.ts (15/15 pass, unaffected by the board.ts field additions)"
        status: pass
    human_judgment: true
    rationale: "Visual/interactive adequacy (dialog open/close animation, live form validation disabling submit, the error-toast rendering, and 'edit a null field shows empty not literal null') requires a human click-through — no jsdom/RTL in this phase's Vitest env (02-VALIDATION.md), matching the same human_judgment pattern 02-03/02-04 used for their own UI deliverables. `npm run build` (part of the plan's own `<verify>` block) currently fails on a pre-existing, unrelated Turbopack build-worker crash — see Deviations/Issues below — so `npm run dev` + rendered-content checks stood in as the practical proxy this plan."
  - id: D4
    description: "Event-sourcing invariant preserved end-to-end: no write path in this plan's files sets currentStageId directly; every stage change goes through appendStatusEventTx via updateApplication (D-09)"
    requirement: CAP-02
    verification:
      - kind: unit
        ref: "tests/domain/applications.test.ts (stageId-appends-event + combined-transaction cases assert currentStageId matches the appended event's stage, never a value set outside appendStatusEventTx)"
        status: pass
      - kind: other
        ref: "grep -n 'currentStageId:' across src/domain/applications.ts, src/app/actions.ts, and the three new dialog files — every match is an interface field or a .select() read projection, zero .set({ currentStageId writes"
        status: pass
    human_judgment: false

# Metrics
duration: 45min
completed: 2026-07-29
status: complete
---

# Phase 2 Plan 5: Capture Write Slice (Quick-Save, Add/Edit, Change-Stage) Summary

**Atomic `quickSaveApplication`/`updateApplication` domain writes, four Server Actions with safeParse + revalidatePath, and three client dialogs (quick-save, shared add/edit, change-stage) wired end-to-end into the board — the board is no longer read-only.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-07-29T18:19:00Z
- **Completed:** 2026-07-29T18:38:49Z (SUMMARY finalized after a mid-run stream interruption; all 3 task commits were already in place)
- **Tasks:** 3 completed
- **Files modified:** 12 (3 created, 9 modified)

## Accomplishments

- `src/domain/applications.ts`: `quickSaveApplication(db, savedStageId, input)` — resolves/creates the company, inserts the application (including `postingUrl`), and appends exactly one `Saved` status event, all inside one `db.transaction`; if any step throws, the whole thing rolls back (proven by a dedicated rollback test using a bogus FK-violating stageId). `updateApplication(db, id, input)` — writes direct fields and/or appends a stage-change event atomically, never touching `currentStageId` directly.
- `tests/domain/applications.test.ts` extended with 8 new cases (atomic quick-save, existing-company resolution, rollback, direct-field-only update, stageId-appends-event update, combined field+stage transaction) — 10/10 pass in the plan's own test file.
- `src/app/actions.ts` (new): `quickSaveAction`, `addApplicationAction`, `updateApplicationAction`, `changeStageAction` — all `safeParse` against the 02-02 Zod schemas, return the exact UI-SPEC error copy on failure, call the event-sourcing-safe domain writes, and `revalidatePath` the board (+ `/job/[id]` for stage-affecting edits).
- Three new client dialogs — `QuickSaveDialog` (CAP-01, company+role required/URL optional), `ApplicationFormDialog` (CAP-02, shared add/edit mode, every field, null renders as empty never literal "null"), `StageChangeDialog` (D2-06, explicit control, never drag-and-drop) — none import `@/db/client`; all read lookups from props.
- `application-card.tsx` now embeds an "Edit application" trigger and the change-stage trigger outside the card's `<Link>`, each with a 44px hit target and `stopPropagation()` so neither also triggers navigation to the job detail page.
- `page.tsx` hosts "Add Application" (primary) and "Quick-Save Job" (secondary) CTAs using the exact UI-SPEC copy, present in both the empty-board and populated-board states.
- Verified end-to-end via `npm run dev DASHBOARD_MODE=demo` + `curl`: `/` renders all four new CTA/trigger strings and the DEMO badge; `/job/1` returns 200.

## Task Commits

Each task was committed atomically:

1. **Task 1: quickSaveApplication + updateApplication domain writes (with tests)** - `30a9291` (feat)
2. **Task 2: Server Actions (quick-save, add, update, change-stage) with revalidation** - `5abf6c1` (feat)
3. **Task 3: Quick-save / add-edit / change-stage dialogs, wired into the board** - `b21c5aa` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/domain/applications.ts` - added `quickSaveApplication`, `updateApplication`
- `tests/domain/applications.test.ts` - 8 new behavior cases + `seedLookups` extended with a `Saved` stage
- `src/app/actions.ts` (new) - `quickSaveAction`, `addApplicationAction`, `updateApplicationAction`, `changeStageAction`
- `src/domain/board.ts` - `BoardApplication` extended with `companyId`/`roleTypeId`/`sourceId`/`postingUrl`
- `src/components/quick-save-dialog.tsx` (new) - CAP-01 dialog
- `src/components/application-form-dialog.tsx` (new) - CAP-02 shared add/edit dialog
- `src/components/stage-change-dialog.tsx` (new) - D2-06 dialog
- `src/components/application-card.tsx` - embeds the edit + change-stage triggers
- `src/components/board-column.tsx` - threads stages/roleTypes/sources to each card
- `src/components/pipeline-board.tsx` - threads stages/roleTypes/sources to each column
- `src/app/page.tsx` - hosts the Add/Quick-Save CTAs, fetches roleTypes/sources
- `.planning/phases/02-manual-capture-core-pipeline-ui/deferred-items.md` - logged the pre-existing `npm run build` failure

## Decisions Made

- `quickSaveApplication` inserts directly against `applications` inside its own transaction rather than delegating to `createApplication`, because `createApplication` validates through `newApplicationInput` (no `postingUrl` field) and would silently strip it.
- Extended `BoardApplication` with `companyId`/`roleTypeId`/`sourceId`/`postingUrl` so the inline edit dialog can pre-fill every field from the board's own read model, avoiding a second per-card detail fetch.
- Added an edit-application trigger to `application-card.tsx` even though only the change-stage trigger was explicitly named in Task 3's action text — CAP-02 has no other UI entry point in this plan's declared scope, and the phase's own manual-verification plan (02-VALIDATION.md) explicitly expects "edit a field inline" to be exercisable.
- `updateApplicationAction` accepts an optional `companyName` (resolved/created like quick-save) instead of requiring the numeric `companyId` `updateApplicationInput` defines, since companies aren't a fixed lookup and the client can't reasonably supply an id for a free-text field.
- Edit mode only includes `stageId` in the update payload when it differs from the card's original stage — `appendStatusEventTx` has no same-stage dedup, so always sending it would append a spurious duplicate event on every unrelated field edit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `createApplication` would silently strip `postingUrl`**
- **Found during:** Task 1
- **Issue:** `createApplication` validates via `newApplicationInput.parse()`, which has no `postingUrl` field — Zod's default strip-unknown-keys behavior would silently drop it if `quickSaveApplication` delegated to `createApplication` as RESEARCH's Pattern 2 pseudocode literally shows.
- **Fix:** `quickSaveApplication` inserts directly against `applications` inside its own `db.transaction`, using the already-`quickSaveApplicationInput`-validated shape (which does carry `postingUrl`), instead of calling `createApplication`.
- **Files modified:** src/domain/applications.ts
- **Verification:** New test asserts `app.postingUrl` round-trips correctly after `quickSaveApplication`.
- **Committed in:** 30a9291

**2. [Rule 2 - Missing Critical] Extended `BoardApplication` with edit-relevant fields**
- **Found during:** Task 3
- **Issue:** The board's existing read model (`listBoardApplications`) only carried display fields (company name, role title, date, stage) — insufficient to pre-fill a full edit form (company id for resolution context, role type, source, posting URL).
- **Fix:** Added `companyId`, `roleTypeId`, `sourceId`, `postingUrl` to `BoardApplication`'s select projection (additive only; unaffected `getPipelineSummary`'s `.reduce()`, which only reads `dateApplied`/`currentStageIsTerminal`).
- **Files modified:** src/domain/board.ts
- **Verification:** `npx vitest run tests/domain/board.test.ts` (5/5, pre-existing tests unaffected since they use targeted field assertions, not exact-shape `toEqual`).
- **Committed in:** b21c5aa

**3. [Rule 2 - Missing Critical] Added an "Edit application" trigger to the board card**
- **Found during:** Task 3
- **Issue:** CAP-02 ("manually add a new application or edit any field on an existing one") is a phase requirement this plan closes, but Task 3's action text only explicitly wires the change-stage trigger onto the card — no edit entry point was named anywhere in this plan's UI wiring, and no other file in this plan's scope (e.g. the job detail page, owned by 02-06) provides one either. Without it, CAP-02's edit capability would have no way to be invoked from the UI after this plan.
- **Fix:** Embedded a second icon trigger (Pencil, 44px hit target, `aria-label="Edit application"`) on `application-card.tsx` that opens `ApplicationFormDialog` in `edit` mode, pre-filled from the (now-extended) `BoardApplication` row.
- **Files modified:** src/components/application-card.tsx, src/components/application-form-dialog.tsx
- **Verification:** `curl` content check confirms `Edit application` renders on the board; `npx tsc --noEmit` passes.
- **Committed in:** b21c5aa

**4. [Rule 3 - Blocking] Threaded lookup props through `board-column.tsx`/`pipeline-board.tsx`**
- **Found during:** Task 3
- **Issue:** Wiring the card's new edit + change-stage triggers required `stages`/`roleTypes`/`sources` lookup data to reach `application-card.tsx`, which sits two component levels below `page.tsx` (`page.tsx -> PipelineBoard -> BoardColumn -> ApplicationCard`). Neither intermediate file is in the plan's declared `files_modified`, but without threading the props through them the declared Task 3 deliverable could not compile or function.
- **Fix:** Added `stages`/`roleTypes`/`sources` props to `PipelineBoardProps` and `BoardColumnProps`, passed straight through to each `ApplicationCard`.
- **Files modified:** src/components/board-column.tsx, src/components/pipeline-board.tsx
- **Verification:** `npx tsc --noEmit` passes; `curl` confirms triggers render on every card.
- **Committed in:** b21c5aa

**5. [Rule 2 - Missing Critical] `updateApplicationAction` needed company-name resolution, not just a numeric `companyId`**
- **Found during:** Task 3
- **Issue:** `updateApplicationInput` only accepts a numeric `companyId`, but the shared add/edit dialog's company field is free text (consistent with quick-save's UX, since companies aren't a fixed lookup) — the client has no numeric id to send when editing the company field.
- **Fix:** Added a separate `editCompanyNameInput` Zod schema to `actions.ts`; `updateApplicationAction` now resolves/creates the company from an optional `companyName` (mirroring `addApplicationAction`) before calling `updateApplication` with the resolved `companyId`.
- **Files modified:** src/app/actions.ts
- **Verification:** `npx tsc --noEmit` passes; `grep -c "Couldn't save this change"` still >= 1 (validation-error path unaffected).
- **Committed in:** b21c5aa

---

**Total deviations:** 5 auto-fixed (2 blocking, 3 missing-critical)
**Impact on plan:** All five were necessary to deliver this plan's own stated CAP-01/CAP-02/D2-06 must-haves through the board — none introduced new architectural surface (no new tables, no new services); every fix stayed inside the established domain-owns-SQL / props-not-imports / event-sourcing conventions from prior plans in this phase. No scope creep beyond what was required to make Task 3's declared deliverable actually functional end-to-end.

## Issues Encountered

- **`npm run build` fails with a pre-existing, unrelated Turbopack build-worker crash** (`The "id" argument must be of type string. Received undefined`). Reproduces identically with a clean `.next` cache, with and without `DASHBOARD_MODE` set, and — confirmed via a `git apply -R` isolation test reverting every 02-05 code change back to the prior commit (02-04) — **before any 02-05 code exists at all**. This is the first plan in the phase whose `<verify>` block invokes `npm run build` (02-01 through 02-04 only ran `npx tsc --noEmit`/`npm run dev`), so this crash was never previously exercised. Logged to `deferred-items.md` under `## 02-05`; substituted `npx tsc --noEmit` (0 errors) plus `npm run dev` + `curl` content checks as this plan's practical verification. Out of this plan's scope to root-cause (pre-existing, unrelated to any file this plan touches).
- Same recurring `tsconfig.json` auto-rewrite (documented since 02-01) triggered by both `npm run build` and `npm run dev` during this plan's verification — reverted with `git checkout -- tsconfig.json` each time, no code change involved.
- Re-confirmed the stale `.claude/worktrees/hopeful-mestorf-9a8ba0/` duplicate test tree (documented in every prior plan's SUMMARY) still causes one unrelated pre-existing failure (`tests/domain/companies.test.ts`) when running the full `npx vitest run tests/domain` sweep. This plan's own scoped test files (`applications.test.ts`, `board.test.ts`) pass 15/15 cleanly.
- A mid-run API stream error interrupted the original execution right before SUMMARY.md was written; all 3 task commits were already in place and verified intact (git log, `tsc`, `vitest`) before finalizing this SUMMARY — no implementation work was redone or re-committed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The board is no longer read-only: a user can quick-save a job, add a full application, edit any field on an existing one, and change its stage — all through Server Actions calling event-sourcing-safe domain writes, with the board/KPI/detail view refreshing via `revalidatePath`.
- `quickSaveApplication`/`updateApplication` and the four Server Actions are stable, reusable inputs for `02-06` (contact/conversation logging on the job detail page), which builds the final CAP-04 write slice on a separate part of the UI (`/job/[id]`) and does not depend on anything changed here beyond the already-existing `getConversationsForApplication`/`getJobTimeline` from `02-04`.
- Recommend a human click-through pass (per the `human_judgment: true` coverage entries above) before treating CAP-01/CAP-02's UX as portfolio-ready: quick-save with company+role only, add with every field, edit a job with a null field (confirm it renders empty, not "null"), and change a stage (confirm the board + KPI counts update live).
- `npm run build`'s pre-existing failure (see Issues Encountered) should be root-caused before any phase that needs a real production build (e.g. deployment prep) — not a blocker for continuing Phase 2's remaining plan (`02-06`), which only ever ran `npm run dev`/`tsc` in prior plans too.

---
*Phase: 02-manual-capture-core-pipeline-ui*
*Completed: 2026-07-29*

## Self-Check: PASSED

All 11 key files verified present on disk (src/domain/applications.ts, tests/domain/applications.test.ts, src/app/actions.ts, src/domain/board.ts, src/components/quick-save-dialog.tsx, src/components/application-form-dialog.tsx, src/components/stage-change-dialog.tsx, src/components/application-card.tsx, src/components/board-column.tsx, src/components/pipeline-board.tsx, src/app/page.tsx). All 3 task commits (30a9291, 5abf6c1, b21c5aa) confirmed present in `git log --oneline --all`. `npx tsc --noEmit` re-run clean (0 errors). `npx vitest run tests/domain/applications.test.ts tests/domain/board.test.ts` re-run passing (15/15). Plan-level negative greps (no direct `currentStageId` writes, no `@/db/client` imports in the three dialog files) re-verified passing.
