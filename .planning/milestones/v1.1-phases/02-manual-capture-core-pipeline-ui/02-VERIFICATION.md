---
phase: 02-manual-capture-core-pipeline-ui
verified: 2026-07-29T16:05:00Z
status: passed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 2: Manual Capture + Core Pipeline UI Verification Report

**Phase Goal:** "I have a genuinely usable, manually-operated tracker — the first shippable slice — running entirely on seed/demo data, proving the schema end-to-end before Gmail is touched."
**Verified:** 2026-07-29
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CAP-01: Quick-Save Job creates an application in the Saved stage with exactly one Saved status event, currentStageId never null | ✓ VERIFIED | `src/domain/applications.ts:122-152` `quickSaveApplication` runs company-resolve-or-create + insert + `appendStatusEventTx` inside one `db.transaction`. Test `tests/domain/applications.test.ts:154` "atomically creates a company + application + exactly one Saved status event; currentStageId is never null" — passes. Rollback test at line 214 also passes (no orphan row survives a mid-transaction throw). UAT test 1: user-confirmed click-through. |
| 2 | CAP-02: Add/edit any field; stage changes always go through appendStatusEventTx, never a direct currentStageId write | ✓ VERIFIED | `src/domain/applications.ts:165-189` `updateApplication` splits `stageId` from direct fields; `grep -n "currentStageId:"` in `applications.ts` shows only interface/select-projection reads, zero `.set({ currentStageId` writes. Test at line 305 "commits a combined field-edit + stage-change in one transaction with no nested-transaction error" passes. UAT test 2: user-confirmed. |
| 3 | CAP-04: Log a contact + conversation (incl. free-text LinkedIn paste) against a job without leaving the detail view; appears in timeline after revalidatePath | ✓ VERIFIED | `src/app/job/[id]/actions.ts` `logContactAction`/`logConversationAction` safeParse → domain write → `revalidatePath`. `contact-conversation-form.tsx` Textarea has no `maxLength`. UAT test 3: agent-verified end-to-end in browser — a logged conversation (multi-line note with quoted LinkedIn snippet) appeared verbatim, escaped, at the top of the timeline. |
| 4 | DASH-02/DASH-04: Pipeline board renders every application in its stage column (incl. saved-not-applied) with a derived 4-count KPI row | ✓ VERIFIED | `src/domain/board.ts` `listBoardApplications`/`getPipelineSummary`; `tests/domain/board.test.ts` 5/5 pass (saved-not-applied row present, bucket counts correct, canonical stage order). UAT test 4: agent-verified — all 8 stage columns + KPI row rendered with the 17 seeded applications. |
| 5 | DASH-05: /job/[id] renders a single application's full history — status transitions and conversations interleaved into one chronological (most-recent-first) timeline | ✓ VERIFIED | `src/domain/timeline.ts` `getJobTimeline` merges statusEvents+stages with `getConversationsForApplication`, explicit stable secondary sort key so equal-timestamp entries never reshuffle. `tests/domain/timeline.test.ts` 3/3 pass incl. the equal-occurredAt adjacency case. UAT test 5: agent-verified — interleaved transitions + conversations rendered most-recent-first. |
| 6 | Event-sourcing invariant holds end-to-end: no write path anywhere in the phase sets `applications.currentStageId` directly | ✓ VERIFIED | Grep across `src/domain/applications.ts`, `src/app/actions.ts`, `src/app/job/[id]/actions.ts`, and all client dialogs: every `currentStageId` occurrence is a type/interface field or a `.select()` read; zero `.set({ currentStageId` writes anywhere in the phase's files. |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | `applications.postingUrl` nullable column | ✓ VERIFIED | Line 80: `postingUrl: text("posting_url")`, no `.notNull()` |
| `drizzle/20260729174433_nifty_alice/` | Additive migration | ✓ VERIFIED | Present; applied to demo + real (per 02-02-SUMMARY) |
| `src/db/validation.ts` | `quickSaveApplicationInput`, `updateApplicationInput` w/ http(s)-only postingUrl | ✓ VERIFIED | Confirmed shared `postingUrlSchema` refinement rejecting non-http(s) schemes |
| `src/domain/events.ts` | `appendStatusEventTx` (non-tx-owning) + thin `appendStatusEvent` wrapper | ✓ VERIFIED | Lines 27, 46-52 match plan exactly |
| `src/domain/board.ts` | `listBoardApplications`, `getPipelineSummary` | ✓ VERIFIED | No `groupBy` usage; plain `.reduce()` KPI derivation |
| `src/domain/lookups.ts` | `listStages`, `listRoleTypes`, `listSources` | ✓ VERIFIED | File exists, used in `page.tsx` |
| `src/domain/timeline.ts` | `getJobTimeline`, `TimelineEntry` | ✓ VERIFIED | Discriminated union + stable-tiebreak sort |
| `src/domain/applications.ts` | `quickSaveApplication`, `updateApplication` | ✓ VERIFIED | Atomic transactions, event-sourcing-safe |
| `src/domain/contacts.ts` | `getConversationsForApplication` | ✓ VERIFIED | Application-scoped, contact-name joined |
| `src/app/page.tsx` | Pipeline board (replaces liveness stub) | ✓ VERIFIED | No direct `db.select`/`insert` calls; error-fallback `return null` is intentional (not a stub) |
| `src/app/job/[id]/page.tsx` | Job detail Server Component | ✓ VERIFIED | Awaits async params; same error-fallback pattern |
| `src/app/actions.ts` | 4 Server Actions | ✓ VERIFIED | `quickSaveAction`, `addApplicationAction`, `updateApplicationAction`, `changeStageAction` — all safeParse + revalidatePath |
| `src/app/job/[id]/actions.ts` | 2 Server Actions | ✓ VERIFIED | `logContactAction`, `logConversationAction` |
| `src/components/nav-shell.tsx` | Nav shell + DEMO badge (prop-driven) | ✓ VERIFIED | No `@/db/client` import (grep: 0 matches across all `src/components/*.tsx`) |
| `src/components/{pipeline-board,board-column,application-card,kpi-row}.tsx` | Board components | ✓ VERIFIED | All present, render from domain read shapes |
| `src/components/timeline.tsx` | Merged timeline component | ✓ VERIFIED | No `dangerouslySetInnerHTML` |
| `src/components/{quick-save-dialog,application-form-dialog,stage-change-dialog}.tsx` | Client dialogs | ✓ VERIFIED | All present; none import `@/db/client`; quick-save gates submit on both fields non-empty |
| `src/components/contact-conversation-form.tsx` | Inline contact/conversation form | ✓ VERIFIED | Present; no `@/db/client` import; notes Textarea has no length cap |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/app/layout.tsx` | `src/components/nav-shell.tsx` | `dashboardMode` prop | ✓ WIRED | Single-reader invariant preserved; grep confirms zero `@/db/client` imports in any client component |
| `page.tsx` | `board.ts`/`lookups.ts` | domain function calls | ✓ WIRED | No direct DB access in page.tsx |
| `getPipelineSummary` | `listBoardApplications` | `.reduce()` over its own output | ✓ WIRED | KPI counts trace to the exact rows the board renders (D2-07) |
| Server Actions (`actions.ts`) | domain writes | safeParse → call → `revalidatePath` | ✓ WIRED | Confirmed in `src/app/actions.ts` — every mutating action revalidates `/` and (for stage-affecting edits) `/job/[id]` |
| `quickSaveApplication`/`updateApplication` | `appendStatusEventTx` | passed-in `tx` inside outer `db.transaction` | ✓ WIRED | No nested-transaction error; proven by passing regression tests |
| `getJobTimeline` | `getConversationsForApplication` | composed + sorted | ✓ WIRED | Confirmed in `src/domain/timeline.ts` |
| Dialogs (`quick-save-dialog.tsx` etc.) | Server Actions | `useActionState` | ✓ WIRED | UAT click-through confirms round-trip (board updates live) |

### Behavioral Spot-Checks / Test Evidence

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full workspace test suite (excl. stray worktree) | `npx vitest run --exclude '**/.claude/**'` | 55 passed, 1 file failed on Windows file-lock (EPERM on `data/demo.sqlite`, not an assertion failure) | ✓ PASS (per environment notes, expected) |
| Type/integration signal | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Phase-scoped domain tests | `npx vitest run tests/domain/applications.test.ts tests/domain/board.test.ts tests/domain/timeline.test.ts tests/domain/contacts.test.ts tests/domain/events.test.ts tests/db/migrate.test.ts` | 40 passed | ✓ PASS |
| quickSaveApplication rollback test | named test in applications.test.ts:214 | passes (included in the above run) | ✓ PASS |
| Combined field+stage single-transaction regression | named test in applications.test.ts:305 | passes | ✓ PASS |
| appendStatusEventTx nested-transaction regression | named test in events.test.ts:132 | passes | ✓ PASS |
| Timeline equal-occurredAt adjacency | named test in timeline.test.ts:92 | passes | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| CAP-01 | 02-02, 02-05 | Quick-save a job (URL optional) | ✓ SATISFIED | `quickSaveApplication` + `quickSaveAction` + `quick-save-dialog.tsx`; UAT pass |
| CAP-02 | 02-02, 02-05 | Add/edit any application field | ✓ SATISFIED | `updateApplication` + `updateApplicationAction`/`addApplicationAction` + `application-form-dialog.tsx`; UAT pass |
| CAP-04 | 02-04, 02-06 | Log contact + conversation incl. free-text LinkedIn paste | ✓ SATISFIED | `logContactAction`/`logConversationAction` + `contact-conversation-form.tsx`; UAT agent-verified in browser |
| DASH-02 | 02-01, 02-03 | Pipeline view across all stages | ✓ SATISFIED | `listBoardApplications` + `PipelineBoard`/`BoardColumn`; UAT pass (8 columns, 17 seeded apps) |
| DASH-04 | 02-03 | Summary counts (applied/saved/in-progress/closed) | ✓ SATISFIED | `getPipelineSummary` + `KpiRow`; UAT pass |
| DASH-05 | 02-04 | Job detail with full history | ✓ SATISFIED (with documented scope note) | `getJobTimeline` + `Timeline`; UAT pass. Note: DASH-05's "linked message" clause is intentionally not rendered this phase — no messages entity exists until Phase 3 Gmail ingestion (explicitly documented in 02-04-PLAN.md and ROADMAP.md Phase 3 scope). This is a deferred, not a missing, capability. |

No orphaned requirements found — REQUIREMENTS.md traceability table maps exactly CAP-01/CAP-02/CAP-04/DASH-02/DASH-04/DASH-05 to Phase 2, and all 6 plans declare exactly these IDs in frontmatter, matching 1:1.

**Documentation note (non-blocking):** REQUIREMENTS.md's checkbox list (lines 24-27, 49-52) marks CAP-01/CAP-02/CAP-04/DASH-02/DASH-04/DASH-05 as `[x]` complete, but the Traceability table at line 103 still lists "CAP-01, CAP-02, CAP-04 | Phase 2 | Pending" (stale — DASH-02/04/05 on the next line correctly say "Complete"). This is a documentation staleness issue, not a functional gap; the underlying requirements are verified satisfied above. Recommend updating that one table cell.

### Anti-Patterns Found

None blocking. Scanned all phase-modified `src/**/*.{ts,tsx}` files for TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers, stub returns, and hardcoded-empty-data patterns:
- All `placeholder` matches are legitimate form-input `placeholder` attributes/skeleton-loading variable names — not stub markers.
- The two `return null` instances (`src/app/page.tsx:41`, `src/app/job/[id]/page.tsx:59`) are intentional read-failure fallbacks feeding the UI-SPEC "Couldn't load this page" error copy — not stubs.
- No `TBD`/`FIXME`/`XXX` debt markers found anywhere in `src/`.
- No `dangerouslySetInnerHTML`, no `@/db/client` import in any client component.

**Carried-forward, non-blocking (documented in deferred-items.md, confirmed pre-existing):**
- `npm run build` (Turbopack) crashes with a build-worker error confirmed via `git apply -R` isolation to predate all Phase 2 code — not caused by this phase, tracked for a future fix before any production deploy.
- `tsconfig.json` auto-rewrite churn on every `next dev`/`build` invocation (pre-existing Next.js 16.2.11 behavior).
- Stale `.claude/worktrees/hopeful-mestorf-9a8ba0/` duplicate test tree causes unrelated failures when running an unscoped `vitest run`; excluded per environment notes.

### Human Verification Required

None. All 6 truths verified with passing automated tests plus a completed UAT (02-UAT.md, 5/5 pass, 0 issues, agent-verified end-to-end in the browser for CAP-04/DASH-02/DASH-04/DASH-05, and user-confirmed click-through for CAP-01/CAP-02).

### Gaps Summary

No gaps found. All must-haves across the 6 plans (02-01 through 02-06) are verified present, substantive, and wired:
- Schema/migration foundations (postingUrl column, appendStatusEventTx) — landed and tested.
- Read slices (Pipeline board, job detail + timeline) — landed, tested, and UAT-confirmed.
- Write slices (quick-save, add/edit, change-stage, contact/conversation logging) — landed, tested, and UAT-confirmed, with the event-sourcing invariant (no direct currentStageId writes) enforced and verified across every write path in the phase.
- The pre-existing `npm run build` Turbopack crash is a carried-forward environmental issue confirmed (via isolation testing in 02-05's own SUMMARY) to predate this phase's code, and does not block `npm run dev`-based usage of the shipped tracker.

---

_Verified: 2026-07-29_
_Verifier: Claude (gsd-verifier)_
