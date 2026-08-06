---
phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
plan: 06
subsystem: api
tags: [gmail, ingestion, sync-orchestrator, server-actions, drizzle, fail-loud]

# Dependency graph
requires:
  - phase: 03-04
    provides: "Gmail fetch/parse pipeline (buildSenderQuery, resolveJobSearchLabelId, listAllMessageIds, fetchParsedMessage, dispatchParser, parseWorkday)"
  - phase: 03-05
    provides: "Fail-loud routing/dedup domain (review-queue.ts, dead-letter.ts, sync-state.ts — insertReviewQueueEntryTx, insertDeadLetterEntryTx, isAlreadyIngested/recordIngestedTx, startSyncRun/finishSyncRun)"
  - phase: 03-07
    provides: "parseSmartRecruiters + parseAshby (completes the confirmed 3-sender set)"
provides:
  - "src/domain/ingestion.ts: runGmailSync(db, client, { lastSync }) — end-to-end manual sync composing the sender-query pass, Job Search label backfill, and dead-letter backlog reparse into one Sync now action"
  - "src/domain/ingestion.ts: classifyParsedResult/matchApplication — shared entity-resolution rules (transition | auto_create | review) used by both the live sync and the dead-letter reparse path"
  - "src/domain/ingestion.ts: reparseDeadLetter(db, client) — resolves pending dead_letter rows in place once a sender's parser is fixed, folded into every Sync now click as Pass 3"
  - "src/gmail/parsers/received-time-fallback.ts: resolveOccurredAt — shared explicit-date-wins/received-time-fallback helper (revised D3-05 policy)"
  - "src/app/actions.ts: syncGmailAction — demo-gated, records a sync_runs row, revalidates /, /review, /dead-letter"
  - "Wired Sync now button (src/components/ingestion-health.tsx) with in-progress state and success/failure toast"
  - "VALIDATED against the real inbox: 67 real messages processed end-to-end (6 transitions / 43 review / 18 dead-letter), 3 real applications (OnePay/Visa/Pismo) auto-created from real ATS mail"
affects: [03-08, 03-09, 03-10, Phase 4 (ING-05/ING-07 daily sync + cursor-expiry)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One transaction per message/row, never one per sync run — proven at real scale (67 messages, 3 passes) with zero silent drops"
    - "classifyParsedResult extracted as the single shared entity-resolution function so the live sync pipeline and the dead-letter reparse path can never drift into different routing rules"
    - "Received-time fallback (resolveOccurredAt) as a last-resort event date — revises the original 'never default to received-time' D3-05 policy after real-inbox inspection proved no real ATS mail in this account carries an explicit calendar date"
    - "Unmatched-company auto-create limited to Applied-status confirmations only — Rejected/Interview for an unknown company still routes to review, since that implies a missed confirmation or a genuine ambiguity needing human confirmation"

key-files:
  created:
    - src/domain/ingestion.ts
    - src/gmail/parsers/received-time-fallback.ts
    - tests/domain/ingestion.test.ts
  modified:
    - src/app/actions.ts
    - src/components/ingestion-health.tsx
    - src/gmail/parsers/workday.ts
    - src/gmail/parsers/smartrecruiters.ts
    - src/gmail/parsers/ashby.ts
    - tests/gmail/parsers/workday.test.ts
    - tests/gmail/parsers/smartrecruiters.test.ts
    - tests/gmail/parsers/ashby.test.ts

key-decisions:
  - "Conservative match confidence (03-CONTEXT discretion, unchanged): exactly one open (non-terminal-stage) application for a resolved company is a high-confidence auto-attach; more than one open application is low_confidence_match; company resolves with no open application falls through to the unmatched path."
  - "REVISED (user decision, post-smoke-test): an unmatched company with a high-confidence Applied confirmation now AUTO-CREATES the application (source 'Company site / ATS', dateApplied = resolved event date) instead of waiting on a review-queue click — real inbox data showed this is the dominant real-world case (3/3 auto-created applications in the smoke test) and forcing every first-time ATS confirmation through a manual review click would violate the project's low-effort constraint. Rejected/Interview for an unmatched company still routes to review as unmatched_confirm_create."
  - "REVISED (user decision, post-smoke-test): D3-05's original 'never default the event date to received-time' policy is unsatisfiable against real mail — direct inspection of all 33 real dead_letter rows found zero with an explicit calendar date in the body. New policy: prefer an explicit date when present and parseable; otherwise fall back to the message's own RFC822 received time (resolveOccurredAt, shared by all three parsers) as a faithful proxy for the real event date."
  - "runGmailSync gained a third pass (reparseDeadLetter) that re-fetches and re-parses every PENDING dead_letter row on every Sync now click — this is what let the parser rewrite (af48e1d) and date-policy revision (73fe165) resolve the pre-existing dead-letter backlog without a separate UI/action, and is now a permanent part of the sync contract."
  - "Real Workday/SmartRecruiters/Ashby templates required rewriting all three parsers (af48e1d) — the synthetic-fixture regexes from 03-04/03-07 matched zero real messages on the first live smoke test (0 transitions from 67 messages). Sender set itself was already correctly Workday/SmartRecruiters/Ashby (Handshake dropped, 03-03/03-04/03-07) — only the extraction patterns needed correction."
  - "Auto-created applications use the existing locked D-06 'Company site / ATS' source value, never a new per-vendor source row (e.g. 'Workday') — every currently-dispatched sender IS a company's own hiring ATS, and the sources vocabulary is a curated 'how did you find this job' list, not a technical-vendor list."

requirements-completed: [ING-03, ING-04, ING-06]

coverage:
  - id: D1
    description: "runGmailSync orchestrates the sender-query pass, Job Search label backfill, and dead-letter reparse into one Sync now action, with per-message transactions and no async inside any db.transaction callback"
    requirement: "ING-06"
    verification:
      - kind: unit
        ref: "tests/domain/ingestion.test.ts (routing/dedup/idempotency/reparse suite)"
        status: pass
      - kind: other
        ref: "grep -Ec \"transaction\\(async\" src/domain/ingestion.ts -> 0; grep -Ec \"update\\(applications\\)[^)]*currentStageId\" src/domain/ingestion.ts -> 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every fetched message routes to exactly one of transition/auto_create/review/dead_letter and is recorded once in the ingested_messages ledger — nothing silently dropped or double-counted, query-pass wins query<->label overlap"
    requirement: "ING-03"
    verification:
      - kind: unit
        ref: "tests/domain/ingestion.test.ts (exactly-one-of routing, query/label dedup, re-run idempotency tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "syncGmailAction is demo-gated, records a sync_runs row for every attempt, and revalidates /, /review, /dead-letter on success; Sync now button shows the in-progress state and a success/failure toast"
    requirement: "ING-06"
    verification:
      - kind: other
        ref: "npx tsc --noEmit; grep -c syncGmailAction src/app/actions.ts; grep -c dashboardMode src/app/actions.ts; grep -c revalidatePath src/app/actions.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live sync against the real Gmail inbox (DASHBOARD_MODE=real): a full fresh sync processes all real ATS/label mail, correctly parses real Workday/SmartRecruiters/Ashby confirmations into dated transitions on the right (possibly auto-created) application, and routes everything else visibly to review/dead-letter with nothing silently dropped"
    requirement: "ING-04"
    verification:
      - kind: manual_procedural
        ref: "User-run live smoke test against DASHBOARD_MODE=real, DB state independently re-verified by the executor against data/real.sqlite (sync_runs, ingested_messages, applications, status_events) after the fact — see Live Sync Smoke Test section below"
        status: pass
    human_judgment: true
    rationale: "Only a human with the real inbox can judge whether the parsed company/status/date for a REAL email is actually correct — mocked unit tests can prove routing/dedup logic but cannot prove the real-world sender-template assumptions (A1/A2/A3). This is exactly what 03-06's blocking checkpoint existed to gate."

# Metrics
duration: ~90min (2 executor tasks ~30min + checkpoint pause + user-driven smoke test/refinement pass ~60min, all committed on top of Tasks 1-2)
completed: 2026-07-31
status: complete
---

# Phase 3 Plan 06: Gmail Sync Orchestrator (ING-06) — VALIDATED on the real inbox Summary

**runGmailSync composes the fetch/parse pipeline with fail-loud routing into one Sync now action (query pass + label backfill + dead-letter reparse), wired to a demo-gated Server Action — VALIDATED end-to-end against the real Gmail inbox: 67 real messages processed with zero silent drops, 3 real applications (OnePay/Visa/Pismo) correctly auto-created from real Workday/SmartRecruiters/Ashby confirmations.**

## Performance

- **Duration:** ~90 min total (Tasks 1-2 ~30 min autonomous execution; blocking live-sync checkpoint pause; user-driven smoke test + 4 refinement commits ~60 min)
- **Started:** 2026-07-31 (Task 1)
- **Completed:** 2026-07-31
- **Tasks:** 3/3 (Task 3 = the blocking live-sync smoke test, now approved)
- **Files modified:** 11 (3 created, 8 modified — see Files Created/Modified)

## Accomplishments

- `src/domain/ingestion.ts` — `runGmailSync(db, client, { lastSync })`: sender-query pass (ING-02/04) → Job Search label backfill (ING-03, D3-06 dedup, query-pass wins) → dead-letter backlog reparse (new third pass), one transaction per message/row, all async fetch/parse completed before any transaction opens
- `classifyParsedResult`/`matchApplication` extracted as the single shared entity-resolution function used identically by the live sync path and the dead-letter reparse path — routing can never drift between the two
- `src/app/actions.ts` — `syncGmailAction()`: demo-gated (`dashboardMode !== "real"`), gated on a stored Gmail token, records a `sync_runs` row for every attempt (running → success|failed), revalidates `/`, `/review`, `/dead-letter`
- `src/components/ingestion-health.tsx` — Sync now button wired with its own `useTransition` (disabled + "Syncing…" + `Loader2` spin while pending), success/failure toast on completion
- **Live sync VALIDATED against the real inbox** (DASHBOARD_MODE=real): a full fresh sync processed 67 real messages in ~12s, status `success`, with zero silently dropped (6 transitions + 43 review + 18 dead-letter = 67)
- **3 real applications auto-created** from real ATS confirmations — OnePay, Visa, Pismo — proving ING-02/03/04/06 end-to-end on real mail, not just synthetic fixtures. Visa alone recorded 4 status events (a real multi-stage progression); OnePay and Pismo recorded 1 each. All independently re-verified against `data/real.sqlite`'s `sync_runs`/`ingested_messages`/`applications`/`status_events` tables after the fact.
- 18 admin/notification emails (OTP codes, reminders, referral notices from known-sender domains that don't match any status-confirmation template) correctly stayed in dead-letter — fail-loud, never force-parsed into a fabricated transition
- 43 items landed in review (label-backfill conversation mail + ambiguous/low-confidence matches) — the escape hatch working as designed

## Task Commits

Each task was committed atomically. Tasks 1-2 were executed autonomously; Task 3 (the blocking live-sync checkpoint) required a real human-run smoke test, which surfaced 4 follow-up fixes — all committed on top of Tasks 1-2, all independently re-verified by this executor before this summary was written:

1. **Task 1: runGmailSync orchestrator — both passes, D3-05 routing, D3-06 dedup, per-message tx** - `b4794c2` (feat)
2. **Task 2: syncGmailAction + wire the Sync now button** - `fbef46f` (feat)
3. **Task 3: Live sync smoke test against the real inbox** — human-run, approved (see Live Sync Smoke Test section below)

**Refinements made during the Task 3 checkpoint** (all committed on top of Tasks 1-2, referenced here — not re-done by this executor):
4. **Rewrite ATS parsers to match real Workday/SmartRecruiters/Ashby templates** - `af48e1d` (fix)
5. **Add reparseDeadLetter to resolve dead-letter rows after a parser fix** - `4d529ce` (fix)
6. **Revise D3-05 date policy — fall back to received-time, resolve backlog via Sync now** - `73fe165` (fix)
7. **Auto-create applications for unmatched Applied confirmations** - `d930f35` (fix)

**Plan metadata:** (this commit, following SUMMARY write)

## Live Sync Smoke Test (Task 3 — VALIDATED)

Run against the real Gmail inbox with `DASHBOARD_MODE=real`. Results as reported by the user and **independently re-verified by this executor directly against `data/real.sqlite`** before writing this summary (no email content pasted, per instruction — counts and company names only, all already corroborated against the live DB):

| Metric | Reported | Independently verified against `data/real.sqlite` |
|---|---|---|
| Total messages processed | 67 | `ingested_messages` row count = 67 (dead_letter 18 + review 43 + transition 6) |
| Sync run status / duration | success, ~10s | `sync_runs` id=3: status `success`, started/finished 12s apart |
| Status transitions | 6 | 6 `status_events` rows (1 OnePay + 4 Visa + 1 Pismo) |
| Applications auto-created | 3 (OnePay, Visa, Pismo) | 3 `applications` rows, each joined to a distinct `companies` row |
| Routed to review | 43 | `review_queue` table count = 43 |
| Routed to dead-letter | 18 | `dead_letter` table count = 18 |

**What this proves:** ING-02 (targeted sender query), ING-03 (label backfill), ING-04 (real-template parsing into dated transitions on the matched/auto-created application), and ING-06 (the manual Sync now action end-to-end) all work against this user's real inbox, not just synthetic fixtures. The 18 dead-lettered admin emails (OTP/reminder/referral notices) staying in dead-letter rather than being force-parsed is itself a positive fail-loud result — the pipeline correctly distinguishes a real status-confirmation template from adjacent-but-different mail from the same domain.

**Note on real-DB state:** the real ingestion state was reset and re-synced by the user during validation, so `data/real.sqlite` currently holds exactly the 3 auto-created applications and their associated events/queue rows described above — this is the authoritative post-smoke-test state, not a cumulative count across multiple test runs.

## Files Created/Modified

- `src/domain/ingestion.ts` - `runGmailSync` orchestrator (3 passes), `classifyParsedResult`/`matchApplication` shared entity resolution, `autoCreateApplicationTx`, `reparseDeadLetter`
- `src/gmail/parsers/received-time-fallback.ts` - `resolveOccurredAt`: explicit-date-wins/received-time-fallback shared by all three parsers (revised D3-05 policy)
- `src/gmail/parsers/{workday,smartrecruiters,ashby}.ts` - rewritten extraction patterns matching real ATS templates (company name position varies by tenant/vendor; status classification decoupled from date extraction; whitespace-normalized matching for html-to-text word-wrapping); all three now call `resolveOccurredAt`
- `src/app/actions.ts` - `syncGmailAction`: demo-gated, token-gated, records `sync_runs`, revalidates `/`, `/review`, `/dead-letter`
- `src/components/ingestion-health.tsx` - Sync now button wired: separate `useTransition` from Connect Gmail, disabled + "Syncing…" + `Loader2` spin, success/failure toast
- `tests/domain/ingestion.test.ts` - routing/dedup/idempotency suite (Tasks 1-2) plus reparse/auto-create/received-time-fallback coverage (checkpoint refinements)
- `tests/gmail/parsers/{workday,smartrecruiters,ashby}.test.ts` - updated to real-template fixtures; explicit-date-wins and received-time-fallback cases added

## Decisions Made

See `key-decisions` in frontmatter — summarized: conservative match confidence retained from 03-CONTEXT unchanged; unmatched-company Applied confirmations now auto-create instead of waiting on review (user decision, post-smoke-test); D3-05 date policy revised to prefer-explicit/fallback-to-received-time (user decision, post-smoke-test, since zero real ATS mail in this inbox carries an explicit calendar date); `runGmailSync` gained a permanent third pass (`reparseDeadLetter`) so every Sync now click also resolves the pending dead-letter backlog against the current parsers.

## Deviations from Plan

### Auto-fixed / User-directed Issues (all discovered by and resolved during the Task 3 live-sync checkpoint)

**1. [Rule 4 - Architectural, user-approved] Synthetic-fixture parser regexes did not match any real mail**
- **Found during:** Task 3 (live smoke test) — first full sync produced 0 transitions from 67 messages, all real ATS confirmations dead-lettered
- **Issue:** The Workday/SmartRecruiters/Ashby parsers built in 03-04/03-07 were authored against synthetic fixtures (explicitly flagged LOW-confidence in those plans' own SUMMARY files); real templates place the company name differently per sender/tenant and use different phrasing than the synthetic fixtures assumed
- **Fix:** Rewrote all three parsers' extraction patterns against real templates (structural shapes only, inspected via `data/real.sqlite`'s dead_letter table — no real content pasted into source or tests)
- **Files modified:** `src/gmail/parsers/{workday,smartrecruiters,ashby}.ts`, corresponding test files
- **Commit:** `af48e1d`

**2. [Rule 4 - Architectural, user-approved] D3-05 "never default to received-time" policy proved unsatisfiable against real mail**
- **Found during:** Task 3 (live smoke test) — after fix #1, company+status extracted correctly but zero real messages had an explicit calendar date, so D3-05's original policy correctly (per its own rule) routed everything to dead-letter as "no explicit date"
- **Issue:** The original D3-05 minimum-bar policy (event date required, never defaulted to received-time) is architecturally sound but does not match this user's real inbox's actual ATS templates
- **Fix:** User revised the policy: explicit date wins when present and parseable, otherwise fall back to the message's own RFC822 received time (`resolveOccurredAt`, shared by all three parsers). Added `reparseDeadLetter` as a permanent third `runGmailSync` pass so the pre-existing dead-letter backlog resolves automatically on the next Sync now click, with no separate action needed.
- **Files modified:** `src/domain/ingestion.ts`, `src/gmail/parsers/received-time-fallback.ts`, all three parser files, `tests/domain/ingestion.test.ts`
- **Commits:** `4d529ce`, `73fe165`

**3. [Rule 4 - Architectural, user-approved] Unmatched-company default revised from review-only to conditional auto-create**
- **Found during:** Task 3 (live smoke test) — real data showed the unmatched-company case is dominant (3/3 real applications this run originated as unmatched-company Applied confirmations) and routing every one through a manual review click contradicts the project's low-effort constraint
- **Issue:** 03-CONTEXT's original discretion default routed every unmatched company to review as `unmatched_confirm_create`
- **Fix:** User revised the default: an unmatched company with a high-confidence **Applied** confirmation now auto-creates the application directly (source "Company site / ATS", dated by the resolved event date); any other status (Rejected/Interview) for an unmatched company still routes to review, since that implies a possibly-missed original confirmation or a genuine ambiguity
- **Files modified:** `src/domain/ingestion.ts`, `tests/domain/ingestion.test.ts`
- **Commit:** `d930f35`

---

**Total deviations:** 3 architectural (Rule 4), all explicitly user-decided during the Task 3 blocking checkpoint — exactly the scenario that checkpoint existed to gate. No scope creep: every change is a direct, necessary response to what the live inbox proved about real ATS templates, real date availability, and real unmatched-company frequency. None of the three could have been discovered by mocked unit tests alone (RESEARCH's own stated rationale for the blocking checkpoint).
**Impact on plan:** ING-02/ING-03/ING-04/ING-06 are now proven end-to-end against real mail, not just synthetic fixtures — a materially stronger verification bar than the plan's original mocked-test-only scope.

## Issues Encountered

None beyond the three deviations documented above, all resolved and re-verified before this summary was written.

## User Setup Required

None — Gmail OAuth was already completed in 03-03; no new external service configuration required by this plan.

## Next Phase Readiness

- `runGmailSync` and `syncGmailAction` are proven end-to-end against the real inbox — ING-02/ING-03/ING-04/ING-06 are all validated, not just unit-tested.
- The dead-letter reparse pass (`reparseDeadLetter`) is now a permanent part of every Sync now click — a future parser fix (e.g. a 4th ATS sender) automatically resolves its backlog on the next sync with no new UI/action required.
- CAP-03 override-survives-resync is unaffected by this plan's changes — `getMergedField` wiring (03-02) still governs the read path; nothing here writes `applications` columns outside `appendStatusEventTx`/`autoCreateApplicationTx`'s own initial insert.
- REL-04 (silent recall gap — unlisted ATS sender domains never enter the pipeline) remains an open, visible risk exactly as scoped in 03-CONTEXT; not addressed by this plan and not claimed to be.
- 03-08/03-09 (review/dead-letter queue UIs) and 03-10 (ingestion-health surfacing) can now build against a sync pipeline that has processed real production-shaped data (67 real messages, 3 real applications) rather than only synthetic fixtures.
- No blockers for the remainder of Phase 3.

---
*Phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing*
*Completed: 2026-07-31*

## Self-Check: PASSED

All claimed files verified present on disk: `src/domain/ingestion.ts`, `src/gmail/parsers/received-time-fallback.ts`, `tests/domain/ingestion.test.ts` (created); `src/app/actions.ts`, `src/components/ingestion-health.tsx`, `src/gmail/parsers/{workday,smartrecruiters,ashby}.ts`, `tests/gmail/parsers/{workday,smartrecruiters,ashby}.test.ts` (modified). All 7 referenced commits (`b4794c2`, `fbef46f`, `af48e1d`, `4d529ce`, `73fe165`, `d930f35`) verified present in `git log` and confirmed ancestors of `HEAD`. Full test suite (`npx vitest run tests --exclude "**/.claude/**"`) passes: 25 files / 141 tests. `npx tsc --noEmit` passes clean. Live-sync smoke-test counts independently re-verified against `data/real.sqlite`'s `sync_runs`/`ingested_messages`/`applications`/`status_events` tables — all figures match the reported outcome exactly (67 total = 6+43+18; 3 applications; 6 status events split 1/4/1).
