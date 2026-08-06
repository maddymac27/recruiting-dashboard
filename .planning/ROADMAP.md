# Roadmap: Recruiting Dashboard

## Overview

This roadmap builds a local-first, self-updating job-search tracker in five phases that strictly front-load the two things every prior attempt (a spreadsheet, then a Claude-Code-prompted version) actually died on: capture reliability and status history. Phase 1 lays down the event-sourced schema and structural demo/real data separation — several of these choices (transition events, message-ID uniqueness, override precedence, company aliases) cannot be retrofitted, so they must exist before anything else is built. Phase 2 proves that schema end-to-end with a fully usable manual tracker on seed data — the first genuinely usable slice, delivered before Gmail is ever touched. Phase 3 wires up real Gmail ingestion for a narrow, known sender set, and — per the project's non-negotiable fail-loudly constraint — ships the review queue and dead-letter surfacing in the *same* phase, not a later one, along with the OAuth publishing decision that prevents a 7-day token-expiry trap. Phase 4 upgrades sync from manual/full-fetch to automatic, incremental, and resilient to sleep/missed runs — the mechanism that actually delivers "stays accurate without me remembering." Phase 5 closes with the analytics and today-view layer, deliberately last, because every metric it computes only exists because the earlier phases captured it correctly at ingestion time.

One design tension is carried forward rather than resolved: targeted sender-domain search has a structurally invisible recall gap (an email from an unlisted ATS domain never enters the pipeline at all, so no dead-letter or review queue can ever catch it). This is surfaced explicitly in Phase 3's success criteria as a known, visible open risk — not quietly assumed solved.

**v1.1 — Outreach & Email Threading** extends the shipped tracker across four phases (6–9). Phase 6 stands up the Outreach feature end-to-end as a self-contained manual slice — a new outreach-messages table (additive Drizzle migration against both the real and demo stores), a logging form, and a filterable/sortable Outreach tab with response tracking — deliberately shippable and verifiable before any Gmail code is touched, exactly as Phase 2 proved the core schema before Phase 3's ingestion. Phase 7 makes the existing record views directly editable — every column across the Pipeline (via an edit section on the company page), the Contacts Database (all columns except the email-driven Touchpoints/Outreach counts), and the Outreach tab, with colored-circle/enum fields edited through a dropdown that offers an "Other" free-text escape hatch — a cross-cutting usability layer requested during Phase 6 review, and sequenced before the Gmail work. Phase 8 then layers the heavier, fail-loud half onto the Outreach foundation: self-forwarded outreach captured through the existing Gmail-label escape hatch, where a message that silently fails to become an outreach record is the precise failure mode this project exists to eliminate — so an unparseable self-forward must surface in the review/dead-letter queue rather than vanish. Phase 9 is independent of Outreach: it extends the existing Phase-3 ingestion to store each message's subject line and thread id against its application, surfaces them as a per-application "Email thread" dropdown, and adds manual email→application tagging for messages ingestion did not auto-link.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

**v1.0 — Self-Updating Tracker (complete):**

- [x] **Phase 1: Schema + Demo Mode Foundation** - Event-sourced schema, entity/alias/contact tables, overrides, dead-letter and review-queue tables, and structural demo/real data separation (completed 2026-07-28)
- [x] **Phase 2: Manual Capture + Core Pipeline UI** - A fully usable manual tracker (pipeline board, job detail, manual add/edit, contact logging) running on seed data, proving the schema end-to-end (completed 2026-07-29)
- [x] **Phase 3: Gmail Ingestion, Entity Resolution & Fail-Loud Surfacing** - Real narrow-sender ingestion with OAuth published to Production, entity resolution, review queue, dead-letter queue, ingestion health, and override persistence — all shipping together (completed 2026-07-31)
- [x] **Phase 4: Incremental Sync & Automatic Scheduling** - Daily automatic sync with missed-run catch-up and a resilient fallback when the sync cursor expires (completed 2026-08-03)
- [x] **Phase 5: Analytics & Dashboard Completion** - Today view, first-class "no response / ghosted" staleness flagging, and basic funnel/summary analytics over accumulated transition data (completed 2026-08-04)

**v1.1 — Outreach & Email Threading:**

- [x] **Phase 6: Outreach Tracker — Data Model, Manual Logging & Filterable View** - New outreach-messages table (real + demo), manual cold-outreach logging form, filterable/sortable Outreach tab, full-body read, and response/outcome tracking — a shippable manual slice before any Gmail code (completed 2026-08-06)
- [ ] **Phase 7: Editable Columns Across Pipeline, Contacts & Outreach** - Every record column becomes directly editable — Pipeline values from an edit section on the company page, all Contacts columns except the email-driven Touchpoints/Outreach, and all Outreach columns — with colored-circle/enum fields edited via a dropdown offering an "Other" free-text option
- [ ] **Phase 8: Outreach Auto-Capture via Gmail Label (Fail-Loud)** - Self-forwarded outreach captured through the existing Gmail-label escape hatch into outreach records, with unparseable self-forwards surfaced in the review/dead-letter queue rather than silently dropped
- [ ] **Phase 9: Email Thread Capture & Application Tagging** - Ingestion stores each message's subject + thread id linked to its application, surfaced as a per-application "Email thread" dropdown, plus manual email→application tagging

## Phase Details

### Phase 1: Schema + Demo Mode Foundation

**Goal**: The persistence foundation — event-sourced status history, company/contact/alias entities, correction overrides, and fail-loud queues — exists correctly, and demo/real data are structurally separated, before any UI or ingestion code is written.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DEMO-01, DEMO-02, DEMO-03
**Success Criteria** (what must be TRUE):

  1. Inserting an application captures all analysis dimensions — source, role type, company, date applied, current stage, outcome — in one record (DATA-01).
  2. Status changes are stored only as new dated event rows (no code path updates a single status field in place), and current stage is correctly derived even when events are inserted out of real-world order (DATA-02, DATA-03).
  3. Two company name variants (e.g. "Meta" vs "Facebook") can be linked as aliases resolving to one entity, and a contact can be linked to more than one job with dates preserved (DATA-04, DATA-05).
  4. Re-inserting a message with the same message ID never creates a duplicate event or record, and a manually-set field value is stored separately from and takes precedence over any parser-derived value for that field (DATA-06, DATA-07).
  5. Toggling demo mode points every query at a completely separate, seeded SQLite file with no code path capable of mixing real and demo data (DEMO-01, DEMO-02, DEMO-03).

**Plans**: 5/5 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Scaffold, full Drizzle schema (13 tables), first migration, node:sqlite driver, vitest test harness (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Server-only DB client + demo/real swap + walking-skeleton liveness page/health route (Wave 2)
- [x] 01-03-PLAN.md — Event-sourcing core: applications, append-only status events + idempotency, out-of-order stage derivation (Wave 2)
- [x] 01-04-PLAN.md — Overrides (read-time precedence), company aliases, contact graph + dated conversations (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-05-PLAN.md — Vocabulary seeder, invented-company demo dataset, structural isolation + schema-parity tests (Wave 3)

### Phase 2: Manual Capture + Core Pipeline UI

**Goal**: I have a genuinely usable, manually-operated tracker — the first shippable slice — running entirely on seed/demo data, proving the schema end-to-end before Gmail is touched.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: CAP-01, CAP-02, CAP-04, DASH-02, DASH-04, DASH-05
**Success Criteria** (what must be TRUE):

  1. I can save a job I haven't applied to yet by pasting its URL and quickly typing company and role (CAP-01).
  2. I can manually add a new application or edit any field on an existing one directly in the UI (CAP-02).
  3. I can log a contact and a conversation against a job, covering both self-forwarded LinkedIn notes and manual entries (CAP-04).
  4. I can view a pipeline board showing where every active application stands, with summary counts (applied, saved-not-applied, in progress, closed) visible at a glance (DASH-02, DASH-04).
  5. I can open a single job's detail view and see its full history — every status transition, contact, and message — reflecting the event-sourced data from Phase 1 (DASH-05).

**Plans**: 6/6 plans executed
**UI hint**: yes

Plans:

**Wave 1** *(foundations — parallel, disjoint files)*

- [x] 02-01-PLAN.md — Tailwind v4 + shadcn scaffold, persistent nav shell + DEMO badge (Wave 1)
- [x] 02-02-PLAN.md — [BLOCKING] postingUrl migration + write-path Zod schemas + appendStatusEventTx refactor (Wave 1)

**Wave 2** *(read slices — depend on 02-01)*

- [x] 02-03-PLAN.md — Pipeline board + KPI summary row read slice, DASH-02/DASH-04 (Wave 2)
- [x] 02-04-PLAN.md — Job detail + chronological timeline read slice, DASH-05 (Wave 2)

**Wave 3** *(write slices — depend on Wave 1/2)*

- [x] 02-05-PLAN.md — Quick-save + add/edit + change-stage write slice, CAP-01/CAP-02 (Wave 3)
- [x] 02-06-PLAN.md — Inline contact + conversation logging write slice, CAP-04 (Wave 3)

### Phase 3: Gmail Ingestion, Entity Resolution & Fail-Loud Surfacing

**Goal**: Real job-application email starts flowing into the tracker for a narrow, known sender set — matched to the right application or flagged for review — without ever silently dropping or misattributing a message, and I can tell at a glance whether ingestion is healthy.
**Mode:** mvp
**Depends on**: Phase 1, Phase 2
**Requirements**: ING-01, ING-02, ING-03, ING-04, ING-06, REL-01, REL-02, REL-03, REL-04, CAP-03
**Success Criteria** (what must be TRUE):

  1. I connect my Gmail account once via an OAuth consent screen published to Production (not Testing), so I never have to re-authenticate weekly (ING-01).
  2. Triggering a manual sync pulls in mail from the targeted ATS-sender query and the designated label, reliably parsing 2-3 real senders (starting with Handshake) into dated transition events attached to the right application (ING-02, ING-03, ING-04, ING-06).
  3. An email the system can't confidently match to an application appears in a review queue where I confirm or reassign it, and a message the system can't parse at all appears in a separate, visible dead-letter queue — neither type of failure is silently dropped (REL-01, REL-02).
  4. The dashboard shows whether the last sync succeeded, and explicitly flags — as a known, visible open risk rather than a hidden or assumed-solved problem — that targeted sender-domain search can silently miss mail from unlisted domains (REL-03, REL-04).
  5. Correcting a field the parser got wrong still shows my correction after the next sync or re-parse of the same message (CAP-03).

**Plans**: 10/10 plans executed
**UI hint**: yes

Plans:

**Wave 1** *(foundations — parallel, disjoint files)*

- [x] 03-01-PLAN.md — Schema foundation: extend review_queue/dead_letter, add sync_runs + ingested_messages dedup ledger, zod schemas, one additive migration; vet + install packages behind a legitimacy checkpoint (REL-01/02/03)
- [x] 03-02-PLAN.md — Wire getMergedField into getApplicationDetail so a manual override displays and survives a re-parse (CAP-03)

**Wave 2** *(depend on Wave 1)*

- [x] 03-03-PLAN.md — [BLOCKING] One-time OAuth connect + sidebar Ingestion Health shell + real-inbox label/sender confirmation (ING-01)
- [x] 03-05-PLAN.md — review-queue / dead-letter / sync-state domain CRUD + dedup-ledger helpers (REL-01/02/03)

**Wave 3** *(depend on Wave 2)*

- [x] 03-04-PLAN.md — Gmail client/query/fetch pipeline (raw decode → MIME/HTML→text) + Handshake parser (ING-02/03/04)
- [x] 03-08-PLAN.md — Review queue UI: table, Pending/Resolved tabs, per-type confirm/create/attach/log actions (REL-01)

**Wave 4** *(depend on Wave 3)*

- [x] 03-06-PLAN.md — [BLOCKING] Ingestion orchestrator (both passes, D3-05 routing, D3-06 dedup, per-message tx) + Sync now action + live smoke test (ING-03/04/06)
- [x] 03-07-PLAN.md — Workday (broad-domain) + Ashby parsers (ING-02/04)
- [x] 03-09-PLAN.md — Dead-letter queue UI + escaped raw-email viewer, never-discard (REL-02)

**Wave 5** *(depends on Wave 4)*

- [x] 03-10-PLAN.md — [BLOCKING] Ingestion-health surfacing: last-sync success/failure line, count badges, persistent REL-04 risk note (REL-03/04)

### Phase 4: Incremental Sync & Automatic Scheduling

**Goal**: The tracker keeps itself current every day without me opening my laptop or remembering to sync — including recovering gracefully from a missed run or an expired sync cursor.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: ING-05, ING-07
**Success Criteria** (what must be TRUE):

  1. A sync runs automatically once per day with zero action from me, including catching up on missed runs if my laptop was asleep or off at the scheduled time (ING-05).
  2. If the incremental sync cursor expires or becomes invalid, the system automatically falls back to a full re-sync instead of silently stopping (ING-07).
  3. Moving from full-fetch to historyId-based incremental sync produces the same correct, deduplicated event set a full sync would — no gaps or duplicates introduced by the incremental path.

**Plans**: 3/4 plans executed

Plans:

**Wave 1** *(foundation)*

- [x] 04-01-PLAN.md — Cursor schema (history_id/used_fallback) + busy_timeout pragma + Gmail history.list/getProfile transport + fetchHistoryMessageIds (ING-07)

**Wave 2** *(blocked on Wave 1)*

- [x] 04-02-PLAN.md — Incremental-first runGmailSync with cursor-expiry (404) fallback, post-work cursor seed, and cursor persistence; manual sync routed through the cursor (ING-07, criterion 3)

**Wave 3** *(blocked on Wave 2)*

- [x] 04-03-PLAN.md — Standalone tsx sync script (real-mode gate + at-logon throttle) + PowerShell task registration + fail-loud staleness alarm (ING-05, D4-03)

**Wave 4** *(blocked on Wave 3 — human checkpoint)*

- [x] 04-04-PLAN.md — Register the Windows scheduled task and confirm catch-up-only settings + dual triggers (ING-05 OS half)

### Phase 5: Analytics & Dashboard Completion

**Goal**: The dashboard answers "what needs me today" and "what's working," using the transition-event history that has been accumulating since Phase 1.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: DASH-01, DASH-03, DASH-06
**Success Criteria** (what must be TRUE):

  1. A "what needs me today" view surfaces overdue follow-ups, threads gone quiet, and applications awaiting my reply, each judged against its own appropriate staleness threshold rather than one universal timer (DASH-01).
  2. "No response / ghosted" appears as a first-class stage, and an application is auto-flagged as gone quiet after its stage-appropriate silence threshold (DASH-03).
  3. Basic analytics ship — at minimum summary counts and a simple funnel chart over the accumulated transition-event history (DASH-06).

**Plans**: 4/4 plans executed
**UI hint**: yes

Plans:

**Wave 1** *(parallel — disjoint files)*

- [x] 05-01-PLAN.md — Today view: staleness predicate + D5-01 activity clock + route move (board → /board) + inline actions (DASH-01, DASH-03) (Wave 1)
- [x] 05-02-PLAN.md — [CHECKPOINT] recharts package-legitimacy vetting + shadcn `chart` install (DASH-06 enabling) (Wave 1)

**Wave 2** *(parallel — depend on Wave 1)*

- [x] 05-03-PLAN.md — Analytics view: summary metrics + funnel bar chart (DASH-06) (Wave 2, depends 05-02)
- [x] 05-04-PLAN.md — Board card gone-quiet overlay badge (DASH-03) (Wave 2, depends 05-01)

### Phase 6: Outreach Tracker — Data Model, Manual Logging & Filterable View

**Goal**: The Outreach tracker exists as a complete, usable manual slice — a new outreach-messages data model plus a logging form and a filterable Outreach tab — so I can record cold outreach and see which messaging converts, all before any Gmail auto-capture is wired up.
**Mode:** mvp
**Depends on**: Phase 1 (schema foundation + demo/real store separation), Phase 2 (nav shell + write-path patterns)
**Requirements**: OUT-01, OUT-03, OUT-04, OUT-05, OUT-06
**Success Criteria** (what must be TRUE):

  1. A new outreach-messages table (recipient, company, channel [LinkedIn/email], purpose, subject, body, sent date, response/outcome) exists in BOTH the real and demo SQLite stores via one additive Drizzle migration, and toggling demo mode swaps in seeded outreach so real recipients and message bodies never appear in a demo (OUT-01 storage; demo/real separation).
  2. I can manually log a cold-outreach message — recipient, company, channel, purpose, subject line, and body — from a form in the Outreach tab, and it appears in the list immediately (OUT-01).
  3. An "Outreach" tab lists every logged outreach message in a table, and I can filter and sort it by company, channel, and recency (OUT-03, OUT-04).
  4. I can open any outreach entry and read its full message body (OUT-05).
  5. I can mark whether an outreach got a response and record its outcome, and the list reflects which messages converted (OUT-06).

**Plans**: 5/5 plans executed
**UI hint**: yes

Plans:

**Wave 1** *(foundation)*

- [x] 06-01-PLAN.md — [BLOCKING migration] outreach_messages schema + newOutreachInput + additive migration applied to both stores (OUT-01/06)

**Wave 2** *(blocked on Wave 1)*

- [x] 06-02-PLAN.md — outreach domain module: createOutreach / listOutreach / getOutreachCountsByContact + tests (OUT-01/03/06)

**Wave 3** *(parallel — depend on Wave 2, disjoint files)*

- [x] 06-03-PLAN.md — write path + dialogs: logOutreachAction, log-form, read-body dialog, checkbox primitive (OUT-01/05/06)
- [x] 06-05-PLAN.md — Contact-DB cross-link column + portfolio-safe demo outreach seed (OUT-01/03)

**Wave 4** *(blocked on Wave 3)*

- [x] 06-04-PLAN.md — Outreach tab: /outreach page + filterable/sortable table + nav link + loading skeleton (OUT-03/04/06)

### Phase 7: Editable Columns Across Pipeline, Contacts & Outreach

**Goal**: Every column across the three record views becomes directly editable — Pipeline values from an edit section on the company page, all Contacts Database columns except the email-driven Touchpoints/Outreach, and all Outreach columns — with colored-circle/enum fields edited through a dropdown that offers an "Other" free-text escape hatch, so I can correct any record inline instead of only through the create forms.
**Depends on**: Phase 6 (Outreach tab + tables), Phase 2 (pipeline board + contacts UI + manual edit), Phase 5 (analytics consume enum values — edits must preserve clean grouping)
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04
**Success Criteria** (what must be TRUE) — *provisional; finalized in discuss-phase*:

  1. From a company's page (reached by clicking a company name in the Pipeline), an edit section lets me change every value shown for that company's application(s) in the Pipeline view, and the change persists and is reflected back on the Pipeline (EDIT-01).
  2. On the Contacts Database I can edit every column except Touchpoints and Outreach, which remain read-only and are populated only by email→contact tagging (EDIT-02).
  3. On the Outreach tab I can edit every column of any outreach record (EDIT-03).
  4. Any colored-circle/enum field (Channel, Stage, Purpose, Relationship, Source, Role type) is edited via a dropdown whose options include the existing values plus an "Other" choice that reveals a free-text field; the chosen value persists and renders back in the table (EDIT-04).
  5. Manual edits respect the existing override/precedence model (CAP-03 / DATA-07) so a correction survives a later re-sync rather than being overwritten.

*Open questions for discuss-phase: the "Other"/enum data-model shape (free-text vs "Other"-category-plus-note), inline-cell vs edit-panel UX, and whether a Pipeline row edits the application or the company.*

**Plans**: TBD
**UI hint**: yes

### Phase 8: Outreach Auto-Capture via Gmail Label (Fail-Loud)

**Goal**: Outreach captures itself the same way recruiter mail already does — I self-forward a message to the designated "Job search" Gmail label and it becomes an outreach record — and, per the project's non-negotiable fail-loud rule, a self-forward that can't be parsed surfaces visibly instead of silently disappearing.
**Mode:** mvp
**Depends on**: Phase 6 (outreach table + Outreach tab); reuses Phase 3 Gmail-label escape-hatch ingestion (complete)
**Requirements**: OUT-02
**Success Criteria** (what must be TRUE):

  1. Self-forwarding an outreach message to the designated "Job search" Gmail label and running a sync creates a new outreach row — recipient, company, channel, subject, and body populated — that appears in the Outreach tab alongside manually logged entries (OUT-02).
  2. A self-forwarded outreach the parser cannot turn into a complete outreach record surfaces in the existing review/dead-letter queue rather than being silently dropped, so a failed capture is always visible (fail-loud constraint).
  3. Re-syncing the same self-forwarded message never creates a duplicate outreach row, reusing the existing message-ID dedup ledger.
  4. A self-forwarded outreach in the label is distinguished from an application/recruiter email in the same label and is not miscategorized as an application status event.

**Plans**: TBD

### Phase 9: Email Thread Capture & Application Tagging

**Goal**: Each application surfaces the real email threads behind it — ingestion stores every message's subject line and thread id against its application, a per-application "Email thread" dropdown lists those emails by subject, and I can hand-tag any email ingestion did not auto-link.
**Mode:** mvp
**Depends on**: Phase 3 (existing Gmail ingestion + application linkage, complete)
**Requirements**: MAIL-01, MAIL-02, MAIL-03
**Success Criteria** (what must be TRUE):

  1. Gmail ingestion captures and stores each ingested message's subject line and Gmail thread id, linked to the application it belongs to, via one additive migration applied to both the real and demo stores (MAIL-01).
  2. On an application's detail view, clicking "Email thread" opens a list of that application's emails, each titled by its subject line and linking through to the source email (MAIL-02).
  3. When ingestion did not auto-link an email to an application, I can manually tag/associate that email to the correct application, and the association persists across subsequent re-syncs (MAIL-03).
  4. In demo mode the "Email thread" dropdown shows seeded emails, so the feature is demonstrable on a screen-share without exposing real inbox contents (presentability + demo/real separation).

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Schema + Demo Mode Foundation | 5/5 | Complete    | 2026-07-28 |
| 2. Manual Capture + Core Pipeline UI | 6/6 | Complete    | 2026-07-29 |
| 3. Gmail Ingestion, Entity Resolution & Fail-Loud Surfacing | 10/10 | Complete    | 2026-07-31 |
| 4. Incremental Sync & Automatic Scheduling | 4/4 | Complete    | 2026-08-03 |
| 5. Analytics & Dashboard Completion | 4/4 | Complete    | 2026-08-04 |
| 6. Outreach Tracker — Data Model, Manual Logging & Filterable View | 5/5 | Complete    | 2026-08-06 |
| 7. Editable Columns Across Pipeline, Contacts & Outreach | TBD | Not started | - |
| 8. Outreach Auto-Capture via Gmail Label | TBD | Not started | - |
| 9. Email Thread Capture & Application Tagging | TBD | Not started | - |

## Open Design Risk (carried forward, not resolved)

**REL-04 / silent recall gap:** Targeted Gmail sender-domain search is structurally unable to catch mail from a domain that was never added to the query — this failure occurs *before* the pipeline sees the message, so no review queue or dead-letter mechanism (Phase 3) can ever surface it. Phase 3 makes this risk visible in the UI rather than solving it. No phase in this roadmap closes it completely; the best available mitigation (a periodic wider-net subject-keyword scan across the whole inbox) is a partial, ongoing-effort backstop that should be revisited once real inbox data is available — a candidate for v2 or a future phase, not assumed done here.

## Backlog

### Phase 999.1: UI polish & board organization (BACKLOG)

**Goal:** [Captured for future planning] Post-Phase-2 UI/UX polish for the pipeline board and app shell — presentation and organization improvements layered over the working manual tracker. Raised during Phase 2 UAT (2026-07-29); nothing built yet. Items 1–4 explicitly wanted; logos deferred; sort/filter is a new note.
**Requirements:** TBD (new UX requirements — not in current v1.0 milestone scope)
**Plans:** 0 plans

Scope — 6 captured items (rough effort estimates):

1. **Adaptive board columns** *(wanted)* — fit all stages on screen instead of horizontal scroll. Recommended: responsive grid + group the 3 terminal stages (Rejected/Ghosted/Withdrawn) into one collapsible "Closed" lane (mirrors the KPI "Closed" bucket). ~2–4h. Files: `pipeline-board.tsx`, `board-column.tsx`.
2. **Editable dashboard title** *(wanted)* — e.g. "Maddy's Recruiting Dashboard"; persist in a SQLite settings row, per-mode so demo vs real can differ. ~2–4h. Needs a settings-table migration + Server Action + inline edit in the shell.
3. **Collapsible sidebar** *(wanted)* — open by default, collapsible; persist preference. ~1–2h. Lowest risk. File: `nav-shell.tsx`.
4. **Per-stage column colors** *(wanted)* — proposed palette (cool→warm progression, semantic terminals, WCAG-AA + colorblind-safe): Saved `#64748B`, Applied `#2563EB`, Screen `#0891B2`, Interview `#7C3AED`, Offer `#16A34A`, Rejected `#E11D48`, Ghosted `#D97706`, Withdrawn `#71717A`. ~2–4h. Update UI-SPEC color system; apply to column headers + card badges.
5. **Company logos on cards** *(deferred — skipped for now)* — manual first (paste URL / upload, stored locally, ~3–6h). Auto-fetch (Clearbit/favicon) is a separate **opt-in** add-on with a PRIVACY tradeoff: it sends the company name/domain to a third party, conflicting with the local-first constraint on REAL data — must be gated (opt-in, demo-mode-friendly, locally cached) if ever built. ~+5–10h.
6. **Sort / filter each stage section** *(new — user note 2026-07-29)* — within each stage column, sort by date-applied or alphabetical, and filter (e.g. by company). Controls layered over the board read model. ~3–6h (est). Files: `board.ts`, `pipeline-board.tsx`.
7. **Pipeline card density + text wrap** *(new — user note 2026-07-31)* — shrink the pipeline cards and wrap text within them so the **full company name + full role title** are always visible (no ellipsis truncation). Files: `application-card.tsx`, `board-column.tsx`.
8. **Review-queue message detail (click-into contents)** *(new — user note 2026-07-31)* — in the review queue, let me click a review item to see the full message contents (analogous to the dead-letter "View raw email" viewer, but for review items). Files: `src/app/review/*`, `review-queue-item.tsx`.

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.2: Outreach & Networking tab (contact database) (BACKLOG)

**Goal:** [Captured for future planning] A dedicated Outreach/Networking view that surfaces recruiter/contact conversations as a **filterable contact database** — who you've talked to, filterable by recruiter / company / recency, independent of the per-job detail view. Raised during Phase 3 execution (2026-07-31).
**Requirements:** TBD (new — extends CAP-04 contact/conversation logging into a first-class networking surface)
**Plans:** 0 plans

Foundation already exists — **no new data model needed**: the `contacts`, `conversations`, and `contact_applications` tables + the contact graph (Phase 1, DATA-05) and inline conversation logging (Phase 2, CAP-04) already capture who + when. Primarily a new read/filter UI over existing data — a natural fit as a Phase 5 addition or its own phase.

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.3: Recorded demo walkthrough for portfolio (BACKLOG)

**Goal:** [Captured 2026-08-06] A polished screen-recorded walkthrough (video/GIF) plus screenshots of the dashboard running in demo mode, embedded in Maddy's professional portfolio site as a companion/fallback to the live hosted demo. Deferred deliberately until the dashboard is more fully fleshed out, so the recording reflects the finished product. Capture in demo mode (`DASHBOARD_MODE=demo`) so no real data is exposed.
**Requirements:** TBD (portfolio / presentability — complements the live demo hosted via Docker on Render/Railway)
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

---
*Roadmap created: 2026-07-22*
*Granularity: standard*
*v1.0 milestone: Phases 1–5 (Self-Updating Tracker), complete 2026-08-04*
*v1.1 milestone: added Phases 6–8 (Outreach & Email Threading), 2026-08-04*
