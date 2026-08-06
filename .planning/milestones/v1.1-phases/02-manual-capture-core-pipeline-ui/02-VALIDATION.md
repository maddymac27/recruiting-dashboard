---
phase: 2
slug: manual-capture-core-pipeline-ui
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-29
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `02-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (configured, `environment: "node"` — no DOM/jsdom) |
| **Config file** | `vitest.config.ts` (path alias `@/* -> src/*` wired) |
| **Quick run command** | `npm test -- tests/domain` |
| **Full suite command** | `npm test` (= `vitest run`) |
| **Estimated runtime** | ~a few seconds (domain-scoped, node env) |

**Environment note:** Vitest runs in `node` (no jsdom, no `@testing-library/react`). Automated
coverage this phase stays scoped to the **domain / read-model layer** — where the real risk lives:
event-sourcing correctness, KPI bucket categorization, timeline merge/sort order, transaction
atomicity. Visual / dialog / empty-state correctness is **manual UAT** via `/gsd-verify-work`.
Standing up a jsdom + Testing Library stack for one MVP phase is out of proportion to the
single-local-user risk profile; revisit if a later phase needs real component tests.

---

## Sampling Rate

- **After every task commit:** `vitest run tests/domain/<file being changed>.test.ts`
- **After every plan wave:** `npm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** < 10 seconds (domain-scoped run)

---

## Per-Task Verification Map

> Task IDs (`02-PP-TT`) are finalized by the planner; the requirement→behavior mapping below is
> authoritative for what each automated test must prove.

| Requirement | Behavior to prove | Test Type | Automated Command | File |
|-------------|-------------------|-----------|-------------------|------|
| CAP-01 | `quickSaveApplication` creates company (if new) + application + exactly one `Saved` status event atomically; `currentStageId` never null | unit | `vitest run tests/domain/applications.test.ts -t "quickSaveApplication"` | extend |
| CAP-01 | `quickSaveApplication` rolls back entirely if any step throws (atomicity) | unit | same file | extend |
| CAP-01 (schema) | `postingUrl` migration applies cleanly to a migrated DB; existing rows read back `null` | unit | `vitest run tests/db/migrate.test.ts` | extend |
| CAP-02 | `updateApplication` writes direct fields without touching `currentStageId` when no `stageId` given | unit | `vitest run tests/domain/applications.test.ts -t "updateApplication"` | extend |
| CAP-02 | `updateApplication` with a `stageId` appends exactly one status event + recomputes projection (never sets current-stage column directly) | unit | same file | extend |
| CAP-02 | field edit + stage change succeed in one transaction (regression for nested-transaction bug, RESEARCH Pitfall 2) | unit | same file | extend |
| CAP-04 | `getConversationsForApplication` returns only that application's conversations, ordered by `occurredAt` asc, joined to correct contact | unit | `vitest run tests/domain/contacts.test.ts -t "getConversationsForApplication"` | extend |
| DASH-02 | `listBoardApplications` returns every application with correct company/stage joins, incl. saved-not-applied (`dateApplied: null`) | unit | `vitest run tests/domain/board.test.ts` | new |
| DASH-04 | `getPipelineSummary` bucket counts match a hand-constructed fixture (saved / applied+in-progress / offer / rejected) | unit | same file | new |
| DASH-05 | `getJobTimeline` interleaves status events + conversations in the documented sort order across an app with both | unit | `vitest run tests/domain/timeline.test.ts` | new |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/domain/board.test.ts` — DASH-02, DASH-04 (new file)
- [ ] `tests/domain/timeline.test.ts` — DASH-05 (new file)
- [ ] Extend `tests/domain/applications.test.ts` — CAP-01 (`quickSaveApplication`), CAP-02 (`updateApplication` incl. combined field+stage transaction regression)
- [ ] Extend `tests/domain/contacts.test.ts` — CAP-04 (`getConversationsForApplication`)
- [ ] Extend `tests/db/migrate.test.ts` — `postingUrl` schema addition applies cleanly

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dialogs open/close; quick-save & add/edit forms submit and validate | CAP-01, CAP-02 | No jsdom/RTL in the node Vitest env this phase | `/gsd-verify-work`: Quick-Save a job with company+role only (no URL) → card lands in `Saved`; Add Application with all fields; edit a field inline |
| Empty states render UI-SPEC copy verbatim (whole-board, per-column, contacts sub-list) | DASH-02 | Visual/string correctness | Run against an empty real DB; confirm "No applications yet" / "Nothing here yet" copy |
| KPI row + board reflect a mutation after `revalidatePath` | DASH-02, DASH-04 | Server-Action + revalidation is integration-level | Change a stage → counts + column update without a manual refresh |
| Job-detail timeline interleaves status events + contacts + conversations chronologically | DASH-05 | Rendering of the composed read model | Open a demo job with history → one merged, dated stream |
| DEMO badge shows only in demo mode | D2-04 | Depends on the startup mode swap | Launch in demo → badge present; launch in real → absent |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
