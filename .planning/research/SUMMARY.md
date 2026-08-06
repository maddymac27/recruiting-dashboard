# Project Research Summary

**Project:** Recruiting Dashboard
**Domain:** Local-first, single-user job-application tracking dashboard with Gmail-based ETL ingestion
**Researched:** 2026-07-21
**Confidence:** MEDIUM-HIGH

## Executive Summary

This is an email-native job-application tracker, a category that exists (JobFlow AI, G-Track, Prowl, SkillStory) but is thin and immature, giving this project real room to differentiate on trustworthiness rather than novelty. The four research streams converge on a single architecture: a Next.js/TypeScript app over a local SQLite file (better-sqlite3 + Drizzle), with Gmail ingestion built as a proper ETL pipeline (classify, extract, resolve, append-only event log, recomputed projection) rather than a script that overwrites a status field. The single most important design commitment, repeated independently across STACK, FEATURES, ARCHITECTURE, and PITFALLS, is that status must be stored as dated transition events, never a single mutable field, because every differentiator this project has over its competitors is mathematically impossible to compute after the fact from current-state-only data.

The recommended approach sequences work to front-load exactly what killed the two prior attempts: capture reliability first, display second, analytics last. Schema and demo mode come before any UI; a manual-entry vertical slice proves the schema before Gmail is ever touched; ingestion comes before entity resolution is tuned; the review queue and dead-letter store ship in the same phase as ingestion, not after; and full analytics is explicitly the last phase.

The key risk is not a single bug but the abandonment pattern itself, since this projects own history (spreadsheet, then Claude-Code-prompted version) shows it dies at capture discipline, not from technical impossibility. Two of the biggest threats are structural rather than obviously buggy: (1) a Google OAuth decision made during setup, since Testing-status apps have refresh tokens that expire 7 days after consent, must be resolved by publishing to In Production, not deferred as a spike; and (2) targeted sender-domain search has an invisible recall gap (unlisted ATS domains never enter the pipeline at all), which cannot be caught by any dead-letter or review queue because the mail was never fetched. This is flagged as an unresolved design tension the roadmap must explicitly carry forward, not a solved problem.

## Key Findings

### Recommended Stack

Node.js/TypeScript with Next.js (App Router) as a single full-stack framework avoids running two languages or two processes for a one-person, local-first tool. Persistence is better-sqlite3 + Drizzle ORM: STACKs independent recommendation and ARCHITECTUREs independent assumption agree exactly, a single embedded SQLite file with a thin, typed schema-as-code layer. Gmail access goes through googleapis + google-auth-library (not IMAP); mailparser + html-to-text turn raw MIME into clean text; a hybrid regex-per-ATS-sender + Claude Haiku fallback handles extraction; recharts handles charting; zod validates parsed output. Windows Task Scheduler (not node-cron) runs the daily sync, since the OS already solves sleep/wake/missed-trigger semantics.

**Core technologies:**
- Next.js (App Router) + TypeScript: one process serves both UI and Gmail sync/parser/DB API routes, no separate backend
- better-sqlite3 + Drizzle ORM: embedded, typed, file-based; both STACK and ARCHITECTURE arrived at this independently and agree fully
- googleapis + google-auth-library: Gmails official, best-maintained Node SDK; OAuth token persistence is the apps own responsibility
- mailparser + html-to-text: turns raw MIME into structured, clean-text fields before regex/LLM extraction runs
- Claude Haiku 4.5 (via @anthropic-ai/sdk): structured-extraction fallback only, for label-inbox mail and template-parser misses

### Expected Features

The competitive landscape splits into manual trackers-with-extras (Teal, Huntr), autofill-driven capture (Simplify Copilot), and a thin, immature email-native category this project sits closest to. No reviewed competitor exposes per-user, self-serve, time-based conversion analytics or a visible confidence/correction workflow for uncertain email parsing, both are genuine, buildable differentiators.

**Must have (table stakes):**
- Pipeline/stage board, one record per application, manual add-a-job (URL paste), manual field override
- Detail view with full event history (status changes, contacts, messages)
- Company/role/source/date-applied captured at minimum
- Summary counts and a basic funnel/aggregate chart
- Follow-up/staleness (needs attention) flag
- Contacts attached to a job with dates

**Should have (competitive differentiators):**
- Automatic ingestion with a visible confidence/ambiguity review queue
- Status-change history exposed in the UI, not just used internally
- Time-based conversion analytics (response rate, time-to-first-response, time-in-stage, by source/role/company)
- User-driven slicing/filtering of analytics
- Contact-as-entity spanning multiple jobs
- Demo mode (unusual in this landscape since competitors are multi-tenant SaaS)

**Defer (v2+):**
- Full conversion analytics suite and self-serve slicing: wait until enough real transition-event data exists
- Contact-as-independent-entity join-table modeling: wait until repeat contacts actually appear
- Rich confidence-scored review UX: start with a simple needs review flag
- Push/real-time sync, cross-milestone historical benchmarking: explicitly out of scope

**Anti-features (do not build):** resume builder, AI cover letter generator, job board aggregation, browser-extension autofill, full networking CRM, multi-user/sharing, real-time push notifications, automatic outbound email, calendar/interview scheduling integration.

### Architecture Approach

The system is a four-layer ETL-plus-projection pipeline: an ingestion layer (Gmail fetcher + sync cursor + classifier + per-ATS extractor, plus a manual URL-capture path feeding the same intermediate shape) hands off to a reconciliation layer (entity resolver using blocking + fuzzy scoring + confidence thresholds) which writes into a persistence layer built around an append-only status_events log with a separately recomputed applications current-state projection, a dead_letter table, a review_queue table, and an overrides table that always wins over derived values. A presentation layer reads only through this stack, never writing directly to the event log.

**Major components:**
1. Gmail Fetcher + Sync Cursor Store: targeted search + label query, historyId-based incremental fetch with a mandatory 404-fallback to full re-sync
2. Classifier + per-ATS Extractor: sender/label rules decide message type; per-sender template parsers extract fields, each tagged with a confidence score
3. Entity Resolver: three-tier blocking (thread ID, then domain+company key, then fuzzy company name) with auto-merge only above a high confidence threshold
4. Event Writer + Projection: idempotent, unique-on-message-id inserts into an append-only event log
5. Review Queue + Dead-Letter Store: two structurally distinct concepts, both first-class from the first ingestion pass
6. Correction/Override Store: user corrections live outside the extraction pipelines write path entirely
7. Demo Mode Switch: a structural data-source swap (separate SQLite file), not a runtime flag

### Critical Pitfalls

1. 7-day refresh token expiry (Testing-status OAuth): Verified directly against Googles own support docs, test-user refresh tokens expire 7 days after consent, and gmail.readonly does not qualify for the profile-scope exception. This supersedes STACKs unverified, spike it framing, the resolved recommendation is to publish the OAuth consent screen to In Production during setup, before the first scheduled sync ships.

2. Over-narrow sender-domain search is invisibly incomplete: Targeted, high-precision Gmail search has a structurally invisible recall failure, an unlisted ATS domain never enters the pipeline at all. This is flagged as an unresolved design tension, not a solved pitfall. The partial mitigation proposed is a periodic wider-net subject-keyword search across the whole inbox, with the label escape hatch foregrounded as the general the automated query did not catch this bucket.

3. historyId expiry silently truncating incremental sync: history.list can 404 on a stale cursor; a pipeline that does not explicitly branch on this into a bounded full re-sync will silently lose a gap.

4. Swallowed exceptions in the per-message loop: The most common cause of sync reported success but a record is missing. Every caught exception must write to a visible review/dead-letter queue with a per-run failure counter.

5. Entity resolution errors (false merge / false split) and parser drift producing wrong-not-missing data: Never auto-merge without one-click human confirmation; maintain a small user-editable alias table distinguishing agency from employer; give every extracted field a confidence score plus sanity bounds.

6. Sleeping-laptop scheduler silently stalling and abandonment via accumulating remember to steps are the two overarching risks: Task Scheduler must have both missed-run catch-up and wake-to-run enabled, backed by an app-open freshness check. The roadmap must sequence ingestion + review queue to ship and be used for real weeks before analytics is built.

## Implications for Roadmap

Based on combined research, the build order in ARCHITECTURE (9 steps) is affirmed as the reconciled sequence, FEATURES and PITFALLS both independently argue for exactly this ordering, so no conflict exists to resolve, only reinforcement. Suggested phase structure:

### Phase 1: Schema + Demo Mode Foundation
Rationale: Nothing above the persistence layer can be meaningfully built or demoed before the schema exists. Several schema items cannot be retrofitted.
Delivers: status_events, applications (projection), companies (+ alias table), contacts, overrides, dead_letter, review_queue, sync-cursor table, and the demo/real data-source abstraction (separate SQLite files).
Addresses: Demo mode required from v1; transition-event history and source/role capture as hard prerequisites; overrides + message-ID uniqueness; agency-vs-employer distinction + alias table.
Avoids: Retrofitting data-capture dimensions that can never be reconstructed later; demo mode built as an afterthought flag.

### Phase 2: Manual Capture + Core UI on Seed Data
Rationale: Smallest vertical slice that proves the schema end-to-end before any email-parsing complexity exists, and delivers the manual paste-a-URL requirement independently of Gmail.
Delivers: Pipeline board, Job Detail/timeline view, manual add-a-job, manual field override, all against seeded demo data.
Addresses: Table-stakes pipeline board, detail view, manual override.
Implements: Current-state projection pattern, overrides read-path precedence.

### Phase 3: Gmail Ingestion (Cold-Start, Narrow Sender Set)
Rationale: Prove OAuth, the targeted query, and the label escape hatch work before adding sync-state or entity-resolution complexity. This is where the OAuth publishing decision must land.
Delivers: Full-fetch ingestion into raw_messages for 1-2 highest-volume ATS senders, each field tagged with a confidence score.
Avoids: 7-day refresh-token trap (publish OAuth consent to In Production here); over-engineering (no Pub/Sub, no plugin framework, polling only).
Research flag: OAuth publishing status and Gmail scope behavior should be verified directly against a real registered client early in this phase.

### Phase 4: Entity Resolution + Event Writer
Rationale: Build the resolver once the shape of real extracted data is known, so thresholds are tuned against real messages.
Delivers: Three-tier resolver, idempotent event writer, projection recompute triggered per event.
Avoids: Silent false-merge/false-split, auto-merge only above a high confidence bar.

### Phase 5: Review Queue + Dead-Letter UI
Rationale: Ingestion must never go live without a visible place for what it could not handle, this ships in the same phase or immediately after Phase 4.
Delivers: Two distinct UI surfaces (ambiguous-match review queue vs genuine-failure dead-letter store).
Avoids: Swallowed exceptions, parser drift with no error, abandonment via accumulating manual-check steps.

### Phase 6: Correction/Override API Wired to Job Detail
Rationale: Needs the projection + resolver in place so there is something to correct.
Delivers: Inline field correction on the Job Detail view, backed by the overrides table with read/write-time precedence.
Avoids: Corrections silently reclobbered by re-sync or parser bugfix.

### Phase 7: Incremental Sync + Remaining Parsers + Scheduling
Rationale: Layer in once the core loop is proven correct on a narrow slice; expanding sender coverage and moving to incremental sync is additive, not a redesign.
Delivers: historyId-based incremental sync with mandatory 404-fallback, Lever/Ashby/Handshake parsers, recruiter-thread fallback extractor, Windows Task Scheduler wiring plus an app-open freshness check with a visible last-synced indicator.
Avoids: historyId expiry silently truncating sync, sleeping-laptop scheduler stall.
Design tension carried forward, not resolved here: the over-narrow sender-domain recall gap, consider adding the periodic wider-net subject-keyword scan in this phase or flagging explicitly for a future phase.

### Phase 8: Analytics/Dashboard Layer
Rationale: Explicitly the last layer to build, every metric it needs only exists because Phases 1-7 captured it correctly at ingestion time.
Delivers: Today view (needs-attention/staleness logic), funnel/summary counts, conversion-by-source/role/company, response-time and time-in-stage metrics, user-driven slicing/filtering.
Addresses: The projects stated what is working differentiator requirements.

### Phase Ordering Rationale

- Capture-before-display-before-analytics is a hard data dependency: transition-event history and source/role capture cannot be retrofitted, so building analytics before ingestion is proven risks building against incomplete or wrong data.
- Review queue and dead-letter surfacing are pulled forward into the ingestion phases themselves because the projects own reliability constraint has no meaning without them.
- The OAuth publishing decision is placed at the start of Phase 3, before any auth code is written, because it becomes much more expensive to discover after a week of successful syncing suddenly breaks.

### Unresolved Design Problem to Flag Explicitly

Silent recall failure from over-narrow sender-domain queries is fundamentally different from every other reliability gap this project addresses: it cannot be caught by a dead-letter queue, a review queue, or any fail-loudly mechanism, because the failure occurs before the pipeline ever sees the message. This is in direct tension with the projects stated hard constraint that the system must fail loudly. No fix in this research fully closes this gap, the best available mitigation (a periodic wider-net keyword scan) is a partial, ongoing-effort backstop, not a structural solution. The roadmap should surface this explicitly as an open risk to revisit once real inbox data is available, rather than treating Phase 3/7 ingestion as done once it passes tests against known sender domains.

### The No-Response-Ever State

FEATURES found no competitor models the most common real outcome, silence with no rejection, no interview, nothing, as a first-class status. This has two implications the roadmap should carry: (1) the status/stage model (Phase 1 schema) needs a way to represent no signal received since applying, distinct from any active stage; (2) the staleness/needs-attention logic cannot use a single days-since-last-event threshold for every case, gone quiet after a screen and never heard back after applying are different situations requiring different thresholds, not one universal timer.

### Research Flags

Phases likely needing deeper research during planning:
- Phase 3 (Gmail Ingestion): OAuth publishing-status behavior and Gmail scope/token lifetime should be verified empirically against a real registered client.
- Phase 7 (Incremental Sync + Scheduling): historyId expiry behavior in practice, and Windows wake-timer reliability across the specific laptop hardware, benefit from direct testing.
- Phase 4 (Entity Resolution): Fuzzy-matching thresholds need tuning against real extracted data from Phase 3, biased toward more human review, not confident auto-merge.

Phases with standard, well-documented patterns (skip research-phase):
- Phase 1 (Schema): Event sourcing + dead-letter + review-queue table design are established patterns.
- Phase 2 (Manual Capture + Core UI): Standard CRUD/UI patterns over Next.js + Drizzle, no novel domain risk.
- Phase 6 (Correction/Override API): Straightforward precedence-layer implementation once the projection exists.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Core libraries verified against npm/official pages; OAuth token-lifetime behavior corroborated across multiple sources and confirmed authoritative by PITFALLS direct check against Googles own support docs |
| Features | MEDIUM-HIGH | Competitor feature sets verified against multiple current reviews/help docs; internal mechanics of proprietary confidence-scoring/staleness algorithms are inferred |
| Architecture | MEDIUM-HIGH | Individual patterns are well-established industry practice cross-checked against Microsoft/AWS/Google docs; the specific combination is original synthesis |
| Pitfalls | MEDIUM-HIGH | Gmail API and OAuth behavior verified directly against Googles own documentation; abandonment/entity-resolution findings drawn from cross-referenced sources |

Overall confidence: MEDIUM-HIGH

### Gaps to Address

- Silent recall failure from narrow sender-domain queries: No research-stage fix fully closes this; carry forward as an explicitly flagged, unresolved design risk revisited once real inbox data exists.
- Fuzzy-matching / entity-resolution thresholds: Cannot be set correctly from research alone; must be tuned iteratively starting in Phase 4, biased toward more human review early.
- Exact ATS sending-domain list: Known domains today are likely incomplete on day one; expected to grow from direct observation of the users own inbox.
- Task Scheduler wake-timer reliability: BIOS/UEFI wake-timer support is inconsistent across laptop hardware; must be confirmed directly on the users own machine during Phase 7.

## Sources

### Primary (HIGH confidence)
- support.google.com/cloud/answer/15549945, official Google documentation confirming 7-day refresh token expiry for Testing-status apps
- developers.google.com/workspace/gmail/api (users.history.list, list-messages, threads, quota reference)
- Anthropic claude-api skill (first-party, version-controlled), current model pricing and structured-outputs guidance

### Secondary (MEDIUM confidence)
- npmjs.com package pages (googleapis, better-sqlite3, drizzle-orm, mailparser, html-to-text, node-cron)
- Microsoft Learn / Windows Support, Task Scheduler missed-run and wake-computer behavior
- Microsoft Azure Architecture Center, Enterprise Integration Patterns, Dataiku, VLDB record-linkage papers
- Competitor product pages/help docs and comparison articles (Huntr, Teal, Careerflow, Simplify, JobFlow AI, G-Track, Prowl, SkillStory)

### Tertiary (LOW-MEDIUM confidence)
- Third-party 2026 framework/charting-library comparison articles
- Open-source abandonment studies (arXiv, dev.to)

---
Research completed: 2026-07-21
Ready for roadmap: yes
