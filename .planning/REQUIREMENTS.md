# Requirements: Recruiting Dashboard

**Defined:** 2026-07-22
**Core Value:** The dashboard stays accurate without me remembering to update it.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Data Model (DATA)

The schema must capture, from day one, everything analytics will later need — these dimensions and history cannot be retrofitted.

- [x] **DATA-01**: Every application record stores its analysis dimensions at capture time: source, role type, company, date applied, current stage, outcome
- [x] **DATA-02**: Status changes are stored as dated, append-only transition events, not as a single overwritten status field
- [x] **DATA-03**: Current stage is derived from transition events ordered by real-world event time, so out-of-order ingestion resolves correctly
- [x] **DATA-04**: Company records support name aliases so variants (e.g. Meta/Facebook, subsidiaries) resolve to one entity
- [x] **DATA-05**: A contact can be linked to multiple jobs, and a job can have multiple contacts, with dates preserved
- [x] **DATA-06**: Each ingested message is uniquely identified so re-syncing the same email never creates a duplicate record or event
- [x] **DATA-07**: User corrections are stored separately from parser-derived values and take precedence, so a re-sync or parser change never overwrites a manual fix

### Capture (CAP)

- [x] **CAP-01**: I can save a job I haven't applied to yet by pasting its URL plus quickly typing company and role
- [x] **CAP-02**: I can manually add or edit any application and its fields directly
- [x] **CAP-03**: I can correct or override any auto-extracted field when the parser gets it wrong, and the correction persists across syncs
- [x] **CAP-04**: I can log a contact and a conversation against a job (covers self-forwarded LinkedIn notes and manual entries)

### Ingestion (ING)

- [x] **ING-01**: The system authenticates to Gmail using an OAuth setup that does not require weekly re-authentication
- [x] **ING-02**: A targeted Gmail search captures application confirmations, rejections, and status mail from known ATS sender domains
- [x] **ING-03**: A designated Gmail label captures recruiter threads from personal addresses and self-forwarded LinkedIn conversations
- [x] **ING-04**: v1 reliably parses 2–3 real ATS/board senders (starting with Handshake plus the most common ATS in my inbox); all other job mail routes visibly to the review or dead-letter queue rather than being dropped
- [x] **ING-05**: Sync runs automatically once daily with no action from me, including catch-up after a missed run (e.g. laptop asleep or off)
- [x] **ING-06**: I can trigger a manual sync on demand
- [x] **ING-07**: When the incremental sync cursor expires, the system falls back to a full re-sync rather than silently stopping

### Reliability — Fail Loudly (REL)

- [x] **REL-01**: Emails matched to an application with low confidence route to a review queue where I confirm or reassign them
- [x] **REL-02**: Job mail the system cannot parse routes to a dead-letter queue that is visible in the UI, never silently discarded
- [x] **REL-03**: The dashboard surfaces ingestion health so I can tell at a glance whether the last sync succeeded and whether anything needs my attention
- [x] **REL-04**: The system provides a way to notice job mail it likely should have captured but didn't, mitigating the silent-recall gap of targeted search

### Dashboard (DASH)

- [x] **DASH-01**: A "what needs me today" view surfaces overdue follow-ups, threads gone quiet, and applications awaiting my reply
- [x] **DASH-02**: A pipeline view shows where every active application stands across all stages
- [x] **DASH-03**: "No response / ghosted" is a first-class stage, and an application is auto-flagged as gone quiet after a silence threshold
- [x] **DASH-04**: Summary counts show at a glance: applied, saved-not-applied, in progress, and closed
- [x] **DASH-05**: A detail view for a single job shows its full history — every status transition, contact, and linked message
- [x] **DASH-06**: Basic analytics ship in v1 (at minimum counts and a simple funnel); the underlying transition data accumulates from day one to power richer charts later

### Demo Mode (DEMO)

- [x] **DEMO-01**: A toggle swaps in a realistic seed dataset so I can screen-share without exposing real data
- [x] **DEMO-02**: Demo data is structurally separated from real data (separate store/path), so real job-search data and secrets can never appear in a demo or a public repo
- [x] **DEMO-03**: Demo mode is present in the first shippable version, not retrofitted

## v1.1 Requirements — Outreach & Email Threading

Milestone v1.1. Scoped 2026-08-04. Both categories change the data model and are built as planned phases (schema → migration → write path → verification).

### Outreach (OUT)

- [x] **OUT-01**: I can manually log a cold outreach message — recipient, company, channel (LinkedIn/email), purpose, subject line, and message body
- [ ] **OUT-02**: I can self-forward an outreach message to a designated "Job search" Gmail label/folder and it is automatically captured into the Outreach tab (same escape-hatch pattern as recruiter/LinkedIn ingestion)
- [x] **OUT-03**: An "Outreach" tab lists all outreach (manual + auto-captured) in a filterable table
- [x] **OUT-04**: I can filter and sort the outreach list by company, channel, and recency
- [x] **OUT-05**: I can read the full message body of any logged outreach
- [x] **OUT-06**: I can mark whether an outreach got a response / its outcome, so I can see which messaging converts

### Email Threading (MAIL)

- [ ] **MAIL-01**: Gmail ingestion captures each message's subject line and thread id, stored with the linked application
- [ ] **MAIL-02**: Clicking "Email thread" on an application opens a list of its emails, each titled by its subject line, linking through to the email
- [ ] **MAIL-03**: I can tag/associate an email to a specific application when ingestion did not auto-link it

### Editing (EDIT)

Added 2026-08-06 (Phase 7). Make the existing record views directly editable, not just creatable. *Provisional wording — finalized in discuss-phase.*

- [ ] **EDIT-01**: I can edit every column value shown in the Pipeline view from an edit section on the company page, and the change persists back to the Pipeline
- [ ] **EDIT-02**: I can edit every Contacts Database column except Touchpoints and Outreach, which stay read-only and are populated by email→contact tagging
- [ ] **EDIT-03**: I can edit every column of any Outreach record
- [ ] **EDIT-04**: Colored-circle/enum fields (Channel, Stage, Purpose, Relationship, Source, Role type) are edited via a dropdown whose options include the existing values plus an "Other" choice editable via free text

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Analytics Depth (ANLYT)

- **ANLYT-01**: Conversion analysis by source, role type, and company — which channels produce interviews
- **ANLYT-02**: Response-time and time-in-stage metrics derived from transition history
- **ANLYT-03**: Self-serve slicing and filtering of the data across arbitrary dimensions

### Ingestion Breadth (INGB)

- **INGB-01**: Per-sender parsers for the full set of major ATS platforms (Greenhouse, Workday, Lever, Ashby, and more)
- **INGB-02**: Automatic field extraction from a pasted job URL where the source site allows it

### Access (ACC)

- **ACC-01**: Hosted deployment reachable from a phone or any browser

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Reading LinkedIn messages directly | No API exists for personal message access; self-forwarding to the Gmail label is the deliberate workaround |
| Scraping Handshake / LinkedIn saved-job lists | Same access limitation; paste-a-URL covers the need |
| Live scraping of job-posting pages in v1 | Fragile, frequently blocked, and fails silently — the exact failure mode this project fights; deferred to v2 as best-effort |
| Multi-user accounts, signup, tenancy | Single user; auth and tenancy are pure cost with no benefit |
| Automatic email sending or replying | Outbound job-search communication stays under my direct control |
| Automatic job discovery / recommendations | This tracks the search I run; it doesn't run it for me |
| Mobile app | A browser view is sufficient; hosted access is a v2 consideration |
| Resume builder, cover-letter AI, job board, networking CRM | Competitor bloat; this is a tracker, not a suite |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07 | Phase 1 | Complete |
| DEMO-01, DEMO-02, DEMO-03 | Phase 1 | Complete |
| CAP-01, CAP-02, CAP-04 | Phase 2 | Complete |
| DASH-02, DASH-04, DASH-05 | Phase 2 | Complete |
| ING-01, ING-02, ING-03, ING-04, ING-06 | Phase 3 | Complete |
| REL-01, REL-02, REL-03, REL-04 | Phase 3 | Complete |
| CAP-03 | Phase 3 | Complete |
| ING-05, ING-07 | Phase 4 | Complete |
| DASH-01, DASH-03, DASH-06 | Phase 5 | Complete |
| OUT-01, OUT-03, OUT-04, OUT-05, OUT-06 | Phase 6 | Complete |
| EDIT-01, EDIT-02, EDIT-03, EDIT-04 | Phase 7 | Pending |
| OUT-02 | Phase 8 | Pending |
| MAIL-01, MAIL-02, MAIL-03 | Phase 9 | Pending |

**Coverage:**

- v1 requirements: 31 total (7 DATA + 4 CAP + 7 ING + 4 REL + 6 DASH + 3 DEMO) — mapped to Phases 1–5, 31/31 ✓
- v1.1 requirements: 13 total (6 OUT + 3 MAIL + 4 EDIT) — mapped to Phases 6–9, 13/13 ✓
- Unmapped: 0 ✓ (no requirement double-mapped)

---
*Requirements defined: 2026-07-22*
*Last updated: 2026-08-06 — inserted Phase 7 "Editable Columns" (EDIT-01–04) before the Gmail work; Outreach auto-capture (OUT-02) → Phase 8, Email Threading (MAIL-01–03) → Phase 9*
