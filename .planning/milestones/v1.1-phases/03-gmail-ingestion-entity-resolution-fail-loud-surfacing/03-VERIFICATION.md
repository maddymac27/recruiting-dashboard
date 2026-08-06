---
phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
verified: 2026-07-31T20:00:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 2
overrides:
  - must_have: "Manual sync reliably parses 2-3 real senders (starting with Handshake) into dated transition events (ING-02, ING-03, ING-04, ING-06)"
    reason: "Real-inbox sampling during 03-03's blocking checkpoint found ZERO Handshake mail in this account (0/51 sampled messages); Handshake was dropped and replaced with the confirmed dominant real senders (Workday 11/51, SmartRecruiters 5/51, Ashby 1/51). This is a documented, user-approved decision revision (03-CONTEXT.md 'Decision Revisions', 2026-07-31) made against real data, not a missed implementation — ING-04's underlying intent ('2-3 real ATS/board senders, everything else routes visibly') is fully met, live-validated against the real inbox (03-06 smoke test: 67 messages, 0 silently dropped)."
    accepted_by: "user (Maddy McEnery), recorded in 03-CONTEXT.md Decision Revisions + 03-03/03-04/03-06 SUMMARY.md files"
    accepted_at: "2026-07-31T00:00:00Z"
  - must_have: "src/gmail/parsers/handshake.ts / dispatchParser routes a Handshake From domain to parseHandshake"
    reason: "Same sender-set revision as above — no Handshake parser was ever built because 0/51 real messages came from Handshake; the artifact/key-link literally named in 03-04-PLAN.md's stale frontmatter never made sense to build once real-inbox sampling superseded it. Workday (03-04), then SmartRecruiters + Ashby (03-07) were built instead, completing the ING-04 3-sender requirement with the CONFIRMED real senders."
    accepted_by: "user (Maddy McEnery), recorded in 03-CONTEXT.md Decision Revisions + 03-04-SUMMARY.md 'Next Phase Readiness'"
    accepted_at: "2026-07-31T00:00:00Z"
---

# Phase 3: Gmail Ingestion, Entity Resolution & Fail-Loud Surfacing Verification Report

**Phase Goal:** "Real job-application email starts flowing into the tracker for a narrow, known sender set — matched to the right application or flagged for review — without ever silently dropping or misattributing a message, and I can tell at a glance whether ingestion is healthy."
**Verified:** 2026-07-31
**Status:** passed
**Re-verification:** No — initial verification

**Note on Mode: mvp:** ROADMAP.md marks this phase `Mode: mvp`, but its goal text is not written in `"As a X, I want Y, so that Z."` User Story form (`user-story.validate` confirms `valid: false`). Per established project precedent (Phase 1 and Phase 2 VERIFICATION.md both applied standard goal-backward verification despite the same `Mode: mvp` tag on non-User-Story goals), this report uses the standard methodology rather than the MVP User-Flow-Coverage gate.

## Goal Achievement

### Observable Truths

Mapped to ROADMAP.md's 5 Success Criteria (the authoritative contract), each also checked against every PLAN's `must_haves.truths` that maps to it.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ING-01: Gmail connects once via OAuth published to Production; no weekly re-auth | ✓ VERIFIED | `src/gmail/oauth.ts` — `getConsentUrl()` requests scope `gmail.readonly` only (line 37); `exchangeCode()` persists the refresh token to `.secrets/gmail-token.json` (mode `0o600`) and refuses to re-run once a token exists (line 174-178, T-03-06). `.gitignore` lines 17-23 exclude `.secrets/`, `token*.json`, `client_secret*.json` — confirmed no secret/token column anywhere in `src/db/schema.ts` (grep: 0 matches for token/secret/credential). Human-verified live in 03-03 (D2): the connect flow was completed signed in as the job-search account, and the connection was confirmed to survive an actual dev-server restart (`.secrets/gmail-token.json` re-read from disk, `mode:real` persists). `layout.tsx` is the sole `hasStoredToken()` caller outside the gated action/route (single-reader invariant). |
| 2 | ING-02/03/04/06: Manual sync pulls targeted-sender-query + Job Search label mail, reliably parses 2-3 real senders into dated transitions attached to the right (possibly auto-created) application | ✓ VERIFIED (see override) | `src/domain/ingestion.ts` `runGmailSync` composes: Pass 1 sender-query (`buildSenderQuery` + `KNOWN_SENDER_DOMAINS` = `myworkday.com`/`smartrecruiters.com`/`ashbyhq.com`), Pass 2 Job Search label backfill (`resolveJobSearchLabelId`, throws loud if missing), Pass 3 dead-letter reparse. `dispatchParser` (`src/gmail/parsers/index.ts`) routes all 3 confirmed senders to live parsers (`workday.ts`, `smartrecruiters.ts`, `ashby.ts`), each gated on the D3-05 minimum bar (company+status+date) via `resolveOccurredAt` (explicit-date-wins/received-time-fallback, confirmed wired in all 3 parsers). **Independently re-verified live against `data/real.sqlite`** (not just trusting the SUMMARY): `sync_runs` id=3 status=`success`, `new_count=6`/`review_count=43`/`dead_letter_count=18`; `ingested_messages` row count = 67 (matches 6+43+18 exactly); `applications` table now holds 5 rows (3 originally auto-created by the smoke test — OnePay/Visa/Pismo — plus 2 more added since, consistent with continued live use); `status_events` count = 8. `getMergedField`/`resolveCompany`/`appendStatusEventTx` are the only write paths for transitions — confirmed no direct `currentStageId` `.update()` anywhere in `ingestion.ts`. Sender set is Workday/SmartRecruiters/Ashby, not "starting with Handshake" as ROADMAP.md's literal wording states — see **override** below (documented, user-approved, live-validated real-inbox revision). |
| 3 | REL-01/02: Unmatched/low-confidence mail → review queue (confirm/reassign); unparseable mail → separate visible dead-letter queue; neither type silently dropped | ✓ VERIFIED | `src/domain/review-queue.ts`/`dead-letter.ts`: zero `.delete(` calls in either file (grep-confirmed) — rows only ever transition `pending → resolved`. `/review` (`src/app/review/page.tsx`) renders Pending/Resolved tabs over `listPendingReviewItems`/`listResolvedReviewItems`; `/dead-letter` (`src/app/dead-letter/page.tsx`) same pattern. Four review actions (`confirmReviewMatchAction`, `attachReviewToApplicationAction`, `createFromReviewAction`, `logReviewAsConversationAction`) each read server-stored parsed fields via `getReviewItemById` (not client-resubmitted values), write through an existing domain function, then `resolveReviewItem` + `revalidatePath`. `dead-letter-item.tsx`'s raw-email dialog renders `{item.rawPayload}` as a plain JSX text node inside `<pre>` — confirmed NOT `dangerouslySetInnerHTML` (the one grep hit in that file is a code comment, not usage). No `@/db/client` import in either client component (grep-confirmed). Independently confirmed live: `review_queue` pending = 42, `dead_letter` pending = 18 in `data/real.sqlite` (one fewer pending-review than the smoke test's 43, consistent with organic UI use resolving an item since). |
| 4 | REL-03/04: Dashboard shows last-sync status at a glance; REL-04 silent-recall gap surfaced as a visible, non-dismissible, unsolved risk | ✓ VERIFIED | `src/components/ingestion-health.tsx`: last-sync line branches success (`"Last synced {relative}"`, muted)/failed (`"Last sync failed — {relative}"`, persistent `text-destructive`, driven by DB-read `lastSyncStatus`, not local component state)/running (`"Syncing…"`)/never-synced; Review(N)/Dead-letter(M) `Badge` links to `/review`/`/dead-letter`, dead-letter switches `variant="destructive"` only at count > 0 (review badge stays neutral); a persistent `Alert` (no close control) carries the fixed REL-04 copy verbatim, rendered in both demo and real mode. `layout.tsx` is confirmed the sole `dashboardMode`/`db` reader — `getLatestSyncRun`/`getReviewCount`/`getDeadLetterCount` computed there and passed as a typed `syncHealth` prop; `ingestion-health.tsx` has zero `@/db/client` import (grep-confirmed). Human-verified live in 03-10 against real synced data ("Last synced 17 minutes ago", Review (43) + Dead-letter (18) badges, REL-04 note visible, neutral styling). |
| 5 | CAP-03: A field correction the parser got wrong still shows after the next sync/re-parse | ✓ VERIFIED | `src/domain/applications.ts` `getApplicationDetail` merges all six `OVERRIDABLE_FIELDS` (company, role_title, role_type, source, date_applied, current_stage) through `getMergedField` before returning (grep-confirmed at lines 107-137: `companyName`, `roleTitle`, `roleTypeLabel`, `sourceLabel`, `currentStageLabel`, `mergedDateAppliedIso` all call `getMergedField`). `tests/domain/applications.test.ts` `describe("CAP-03 override precedence in read path")` (3 tests) proves: a stage override survives a simulated re-parse (a new status event moves the underlying projection, override still wins), a company override survives an unrelated field write, and the no-override control case shows the derived value unchanged. Ingestion write path (`ingestion.ts`) never reads or writes the overrides table — read-time-only precedence preserved (no double logic). Full suite green. |

**Score:** 5/5 truths verified (0 present, behavior-unverified) — 2 overrides applied (both cover the single documented Handshake→Workday/SmartRecruiters/Ashby real-inbox sender-set revision, one at the truth level and one at the artifact/key-link level for the same root cause)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | `ingestedMessages`/`syncRuns` tables; discriminator/display columns on `reviewQueue`/`deadLetter` | ✓ VERIFIED | Lines 268-346: both new tables present, `ingested_messages_message_id_unique` unique index confirmed |
| `src/db/validation.ts` | `parsedEmailResult`, `newReviewQueueEntryInput`, `newDeadLetterEntryInput`, `newSyncRunInput` zod schemas | ✓ VERIFIED | All 4 present with inferred types |
| `drizzle/20260730193220_silent_aqueduct/` | One additive migration | ✓ VERIFIED | Only `CREATE TABLE`/`ALTER TABLE ADD` statements; prior 2 migration folders confirmed untouched by any Phase 3 commit (`git log` scoped to those paths shows only Phase 1/2 commits) |
| `src/domain/applications.ts` | `getApplicationDetail` merges `OVERRIDABLE_FIELDS` via `getMergedField` | ✓ VERIFIED | Confirmed wired (see Truth 5) |
| `src/gmail/oauth.ts` | Server-only OAuth module | ✓ VERIFIED | `import "server-only"` at line 1; scope, token path, refuse-re-exchange all confirmed |
| `src/app/api/auth/google/callback/route.ts` | GET Route Handler | ✓ VERIFIED | Present, exports `GET` |
| `src/components/ingestion-health.tsx` | Sidebar Ingestion Health block | ✓ VERIFIED | All states (connect/connected/last-sync/badges/risk note) confirmed present and correctly gated |
| `src/gmail/types.ts`/`query.ts`/`fetch.ts`/`client.ts` | GmailClient seam, query builder, fetch pipeline | ✓ VERIFIED | All present; `GmailClient` interface used throughout for test injection |
| `src/gmail/parsers/handshake.ts` | Handshake parser | ✗ MISSING (see override) | Never built — superseded by the confirmed real sender set (Workday/SmartRecruiters/Ashby); documented, user-approved deviation |
| `src/gmail/parsers/{workday,smartrecruiters,ashby}.ts` | 3 confirmed-sender parsers | ✓ VERIFIED | All present, all D3-05-gated via `resolveOccurredAt`, all live-validated (workday) or unit-tested against real-template rewrites (all 3, per 03-06's `af48e1d` fix commit) |
| `src/domain/review-queue.ts`/`dead-letter.ts`/`sync-state.ts` | Fail-loud routing/dedup domain | ✓ VERIFIED | All CRUD present, no delete anywhere, dedup ledger idempotent |
| `src/domain/ingestion.ts` | `runGmailSync` orchestrator | ✓ VERIFIED | 3-pass composition, per-message transactions, no async-inside-transaction (grep: 0 matches for `transaction(async`) |
| `src/app/review/{page,actions}.tsx` + `review-queue-item.tsx` | Review queue UI | ✓ VERIFIED | Table/tabs/pagination + 4 actions all present and wired |
| `src/app/dead-letter/{page.tsx}` + `dead-letter-item.tsx` | Dead-letter queue UI | ✓ VERIFIED | Table/tabs/pagination + read-only raw-email viewer, no delete/dismiss control |
| `src/app/layout.tsx` | Single `dashboardMode`/`db` reader | ✓ VERIFIED | Reads `hasStoredToken`/`getLatestSyncRun`/`getReviewCount`/`getDeadLetterCount`, passes typed props down |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/app/layout.tsx` | `src/gmail/oauth.ts` | `hasStoredToken()` → `isConnected` prop | ✓ WIRED | Confirmed |
| `src/app/api/auth/google/callback/route.ts` | `src/gmail/oauth.ts` | `exchangeCode` | ✓ WIRED | Confirmed |
| `src/gmail/parsers/index.ts` | `src/gmail/parsers/handshake.ts` | `dispatchParser` → `parseHandshake` | ✗ NOT WIRED (see override) | Never built — same documented sender-set revision |
| `src/gmail/parsers/index.ts` | `src/gmail/parsers/{workday,smartrecruiters,ashby}.ts` | `dispatchParser` domain-suffix table | ✓ WIRED | All 3 confirmed real senders dispatch to live parsers |
| `src/gmail/fetch.ts` | `src/gmail/types.ts` | `GmailClient` injectable interface | ✓ WIRED | Confirmed — zero live Gmail calls in the test suite |
| `src/domain/review-queue.ts`/`dead-letter.ts` | `src/db/validation.ts` | zod validation before every Drizzle write | ✓ WIRED | Confirmed |
| `src/domain/ingestion.ts` | `src/domain/events.ts` | `appendStatusEventTx` per transition | ✓ WIRED | Confirmed |
| `src/domain/ingestion.ts` | `src/domain/sync-state.ts` | `isAlreadyIngested`/`recordIngestedTx` dedup gate | ✓ WIRED | Confirmed; query-pass-wins tie-break confirmed in code (label pass skips already-ingested ids) |
| `src/app/actions.ts` | `src/domain/ingestion.ts` | `syncGmailAction` calls `runGmailSync` between `startSyncRun`/`finishSyncRun` | ✓ WIRED | Confirmed, demo-gated |
| `src/app/review/actions.ts` | `src/domain/review-queue.ts` | `resolveReviewItem` after every write | ✓ WIRED | Confirmed |
| `src/components/review-queue-item.tsx` | `src/components/contact-conversation-form.tsx` | reused field/UX contract for `label_mail` | ✓ WIRED | Documented as reuse-of-contract (same fields/types) not reuse-of-instance — action wiring differs by design (one atomic action vs 2 legacy actions), consistent with the plan's stated intent |
| `src/app/dead-letter/page.tsx` | `src/domain/dead-letter.ts` | `listPendingDeadLetter`/`listResolvedDeadLetter` | ✓ WIRED | Confirmed |
| `src/app/layout.tsx` | `src/domain/sync-state.ts` | `getLatestSyncRun`/`getReviewCount`/`getDeadLetterCount` | ✓ WIRED | Confirmed |
| `src/components/ingestion-health.tsx` | `/review`, `/dead-letter` | count-badge links | ✓ WIRED | Confirmed |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `src/app/review/page.tsx` | `pendingItems`/`resolvedItems` | `listPendingReviewItems(db)`/`listResolvedReviewItems(db)` — real Drizzle `.select()` queries, no static fallback | Yes | ✓ FLOWING (independently confirmed: 42 real pending rows in `data/real.sqlite`) |
| `src/app/dead-letter/page.tsx` | `pendingItems`/`resolvedItems` | `listPendingDeadLetter(db)`/`listResolvedDeadLetter(db)` | Yes | ✓ FLOWING (independently confirmed: 18 real pending rows) |
| `src/components/ingestion-health.tsx` | `syncHealth` | `layout.tsx` server reads → prop | Yes | ✓ FLOWING (independently confirmed: `sync_runs` row `status=success`, real counts) |
| `src/domain/ingestion.ts` | transitions | live `googleapis` Gmail fetch → real parsers → `appendStatusEventTx` | Yes | ✓ FLOWING (independently confirmed: `status_events` count = 8, real company rows OnePay/Visa/Pismo + 2 more) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full real test suite passes | `npx vitest run --exclude "**/.claude/**"` | 25 files / 141 tests, all passing | ✓ PASS |
| Typecheck clean | `npx tsc --noEmit` | No output (clean) | ✓ PASS |
| No delete/hard-remove on fail-loud queues | `grep -Ec "\.delete\(" src/domain/review-queue.ts src/domain/dead-letter.ts src/app/review/actions.ts src/app/dead-letter/page.tsx` | 0 matches across all 4 files | ✓ PASS |
| No `dangerouslySetInnerHTML` usage (only a doc-comment mention) | `grep -n dangerouslySetInnerHTML src/components/dead-letter-item.tsx` | 1 line, confirmed to be a comment, not JSX usage | ✓ PASS |
| No async work inside a `db.transaction` callback | `grep -c "transaction(async" src/domain/ingestion.ts` | 0 | ✓ PASS |
| No secret/token column in schema | `grep -i "token\|secret\|credential" src/db/schema.ts` | 0 matches | ✓ PASS |
| `.secrets/` gitignored | Read `.gitignore` | Lines 17-23 exclude `.secrets/`, `token*.json`, `client_secret*.json` | ✓ PASS |
| Live sync state independently re-verified against `data/real.sqlite` (not just SUMMARY narration) | `node -e` direct SQLite reads | `sync_runs`(success, 6/43/18), `ingested_messages`=67, `applications`=5, `review_queue` pending=42, `dead_letter` pending=18, `status_events`=8 | ✓ PASS — figures are consistent with (and organically advanced past) the documented 03-06/03-10 smoke-test numbers, proving the pipeline and queue UIs are functioning against real production data, not just fixtures |
| D3-01 no LLM/AI/third-party HTTP dependency | `package.json` dependency list | Only `googleapis`, `mailparser`, `html-to-text` added this phase; no `openai`/`anthropic`/local-LLM packages | ✓ PASS |
| Prior migrations untouched | `git log -- drizzle/20260728222830_bent_lester drizzle/20260729174433_nifty_alice` | Only Phase 1/2 commits touch these paths | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|-------------|--------|----------|
| ING-01 | 03-03 | OAuth Production, no weekly re-auth | ✓ SATISFIED | Truth 1 |
| ING-02 | 03-04, 03-07 | Targeted-sender-domain search | ✓ SATISFIED | `buildSenderQuery` unit-tested + live-validated |
| ING-03 | 03-04, 03-06 | Job Search label captures escape-hatch mail | ✓ SATISFIED | `resolveJobSearchLabelId` fail-loud; label pass live-validated (43 review items from the smoke test include label-backfill mail) |
| ING-04 | 03-04, 03-06, 03-07 | 2-3 real ATS senders parsed, rest routes visibly | ✓ SATISFIED (override) | Workday/SmartRecruiters/Ashby, not Handshake — documented revision, live-validated |
| ING-06 | 03-06 | Manual sync on demand | ✓ SATISFIED | `syncGmailAction` + Sync now button, live-validated |
| REL-01 | 03-01, 03-05, 03-08 | Low-confidence match → review queue | ✓ SATISFIED | Truth 3 |
| REL-02 | 03-01, 03-05, 03-09 | Unparseable mail → visible dead-letter queue | ✓ SATISFIED | Truth 3 |
| REL-03 | 03-01, 03-05, 03-10 | Dashboard surfaces ingestion health at a glance | ✓ SATISFIED | Truth 4 |
| REL-04 | 03-10 | Silent-recall gap surfaced as a visible open risk | ✓ SATISFIED | Truth 4 |
| CAP-03 | 03-02 | Correction survives re-sync/re-parse | ✓ SATISFIED | Truth 5 |

No orphaned requirements — REQUIREMENTS.md's Phase 3 mapping (ING-01/02/03/04/06, REL-01/02/03/04, CAP-03) exactly matches the union of `requirements:` fields declared across all 10 plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX debt markers found in any Phase 3-modified file | — | None |
| — | — | No TODO/HACK/PLACEHOLDER found | — | None |
| `src/app/review/page.tsx`, `src/app/dead-letter/page.tsx` | 133 (create input) | Plan's own `must_haves.ui_considerations` in 03-08-PLAN.md contain two mutually contradictory statements about whether role title is required or optional at "Create application" save time — one says the create dialog "still requires company + role before save," a separate `verification: backstop` item says role "keeps role optional at save." | ℹ️ Info | Not a code defect — `createFromReviewAction`'s zod schema (`roleTitle: z.string().min(1)`) implements the "requires company + role" version, which is also the more specific/testable instruction and matches CAP-01's own create-flow precedent for a brand-new application row. Flagged for awareness only; does not affect any of the 10 requirement IDs or the phase goal. |

### Human Verification Required

None. Every Step 8 candidate item (visual color/badge state, sidebar failure-persistence, REL-04 note placement, table/tabs/pagination rendering) was already completed as a documented, credible manual-procedural checkpoint during execution (03-03's OAuth consent + restart-persistence test, 03-06's live-inbox smoke test, 03-10's visual sidebar confirmation against real synced data) — and this verification independently re-confirmed the resulting live database state directly against `data/real.sqlite` rather than trusting the narration alone. The remaining UI-SPEC `verification: backstop` items in 03-08/03-09 (skeleton loaders, error-copy reuse, truncate+title-attribute behavior) were directly observed in the source (not inferred from symbol presence) during this verification.

### Gaps Summary

No blocking gaps. Two must-haves required an override, both stemming from the single documented, user-approved decision revision made against real inbox data during 03-03/03-04's execution: the roadmap's literal "starting with Handshake" sender-set wording was superseded by the confirmed real senders (Workday, SmartRecruiters, Ashby — Handshake had zero real mail in this account). The underlying requirement intent (ING-04: "2-3 real ATS senders reliably parsed, everything else routes visibly to review/dead-letter") is fully met and live-validated against 67 real messages with zero silent drops. This is exactly the kind of pre-data-vs-real-data correction the phase's own blocking checkpoints (03-03, 03-06) existed to catch and resolve safely.

---

*Verified: 2026-07-31*
*Verifier: Claude (gsd-verifier)*
