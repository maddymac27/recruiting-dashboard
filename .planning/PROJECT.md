# Recruiting Dashboard

## What This Is

A local-first job search dashboard that keeps itself accurate by reading Gmail, so the record of my search stays true even during the weeks I don't touch it. It tracks every job I've applied to or saved, what stage each one is in, who I've talked to and when, and it surfaces both what needs my attention today and what's actually converting.

Built for me (an MBA student running an active job search), with a demo mode so it can be shown as a portfolio piece without exposing real rejections or compensation conversations.

## Core Value

**The dashboard stays accurate without me remembering to update it.** Every prior attempt died at capture, not display — if this one requires discipline to stay true, it has already failed.

## Current Milestone: v1.1 Outreach & Email Threading

**Goal:** Turn the tracker into an active outreach tool — track which cold-outreach messaging actually works, and surface the real email threads behind each application.

**Target features:**
- **Outreach tracker** — a dedicated "Outreach" tab to log cold outreach I send (recipient, company, channel [LinkedIn/email], purpose, subject line, message body), so I can see which messaging converts. New data model + logging form + filterable view.
- **Email thread capture + tagging** — capture email subject/thread metadata during Gmail ingestion so each application's "Email thread" opens a dropdown of its emails titled by subject line, plus the ability to tag/associate emails to a role. Schema + ingestion change + UI.

**Note:** v1.0 shipped phases 1–5 (schema/demo, manual capture + pipeline, Gmail ingestion + fail-loud surfacing, incremental sync, analytics/today). The şişe-style visual redesign (green/light theme, pipeline table, KPI toggles, sidebar capture buttons, Contact Database read view, sortable/filterable table) shipped inline post-v1.0 and is not itself a v1.1 phase.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Ingestion — the system feeds itself**

- [ ] Targeted Gmail search automatically captures application confirmations, rejections, and ATS status mail from known sender domains (Greenhouse, Workday, Lever, Ashby, Handshake, and similar)
- [ ] A designated Gmail label acts as an escape hatch, capturing recruiter threads from personal addresses and self-forwarded LinkedIn conversations
- [ ] Sync runs automatically once daily without any action from me
- [ ] I can trigger a manual sync when I know something just happened
- [ ] Ingestion failures and unparseable messages surface visibly rather than failing silently
- [ ] I can save a job I haven't applied to yet by pasting its URL

**Data model — capture what analysis will need**

- [ ] Each application records the dimensions needed for analysis at ingestion time: source, role type, company, date applied, current stage, outcome
- [ ] Status changes are stored as dated transition events, not as a single overwritten status field
- [ ] Contacts and conversations are linked to the relevant job, with dates preserved
- [ ] I can correct or override any auto-extracted field when the parser gets it wrong

**Dashboard — answer Monday morning's questions**

- [ ] "What needs me today" — overdue follow-ups, threads gone quiet, awaiting my reply
- [ ] "Where everything stands" — complete, trustworthy pipeline view across all active applications
- [ ] Summary counts at a glance (applied, saved-not-applied, in progress, closed)
- [ ] Detail view for a single job showing its full history: every status change, contact, and message

**Analytics — what's working**

- [ ] Charts and graphs over my recruiting data (funnel, breakdowns, distributions)
- [ ] Conversion analysis by source, role type, and company — which channels actually produce interviews
- [ ] Response-time and time-in-stage metrics derived from transition history
- [ ] I can slice and filter the data myself rather than being limited to fixed views

**Demo mode**

- [ ] A toggle that swaps in realistic seed data so I can screen-share without exposing real data
- [ ] Demo mode is present from the first shippable version, not retrofitted later

### Out of Scope

- **Reading LinkedIn messages directly** — LinkedIn provides no API for personal message access. Self-forwarding to the Gmail label is the deliberate workaround.
- **Scraping Handshake or LinkedIn saved-job lists** — same access limitation. Pasting a job URL covers this need.
- **Multi-user accounts, signup, hosting** — I am the only user. Auth and tenancy are pure cost with no benefit here.
- **Automatic email sending or replying on my behalf** — outbound communication in a job search stays under my direct control.
- **Automatic job discovery or recommendations** — this tracks the search I'm running; it doesn't run it for me.
- **Mobile app** — a browser view is sufficient.

## Context

**Prior attempts and why they failed.** A manually-updated spreadsheet, then a version driven by prompting Claude Code directly. Both drifted out of accuracy. The stated root cause is forgetting to update — not tooling limitations. Symptoms included missing applications, stale or wrong statuses, lost detail about who was talked to and what was said, and formatting inconsistency. Notion was considered and rejected as too much setup work for the return.

**The reframe this project rests on.** The inbox is already a near-complete log of the search — confirmations, recruiter threads, interview invites, rejections, and sent follow-ups all land in one Gmail account. The data has existed all along; it was trapped in email rather than absent. This makes the project an extraction problem, not a data-entry problem, which is why previous display-focused attempts (spreadsheet, Notion) could not have solved it.

**Where applications originate.** Company career sites and ATS platforms (Workday, Greenhouse, Lever, Ashby), recruiter outreach and referrals, and Handshake (the MBA job board — which sends an email confirmation on application).

**Volume.** Roughly 8 job-related emails per week currently, expected to increase substantially as applications and networking ramp up. Volume is low enough that processing cost is not a design driver; correctness and recall are.

**Gmail access reality.** Google's Gmail API has no per-label OAuth scope — `gmail.readonly` grants whole-mailbox read access regardless of how the app filters afterward. Label-scoping is an application-level choice, not an enforced permission boundary. For personal use, a Google Cloud project kept in "testing" mode with myself as the sole test user avoids Google's app-verification review.

## Constraints

- **Privacy**: Email content and extracted data stay local — no third-party services receive my job search data. The information includes rejections and compensation discussions.
- **Reliability**: The system must fail loudly. A silently missed email recreates the exact forgetting problem this project exists to eliminate, while creating false confidence that the record is complete.
- **Access**: LinkedIn messages and platform saved-job lists are not machine-readable from outside those platforms. Any requirement depending on them needs a manual bridge.
- **Effort**: Setup and ongoing maintenance must stay low. Prior solutions failed partly on the ongoing-effort tax; a high-friction replacement fails the same way.
- **Presentability**: This will be demonstrated to others as evidence of shipping ability, so it needs to be shareable without exposing real personal data.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Extract from email rather than prompt for manual entry | Forgetting to update was the identified root cause of every prior failure; the inbox already holds the data | — Pending |
| Targeted Gmail search as primary ingestion, label as escape hatch | Job email senders are a predictable, finite set — high recall with low noise. The label covers what queries can't reliably infer (personal-address recruiters, forwarded LinkedIn notes) | — Pending |
| Self-forward LinkedIn conversations into the Gmail label | Collapses two ingestion paths into one pipeline to build and trust, rather than building a second capture mechanism | — Pending |
| Daily automatic sync plus manual refresh, not true real-time | Delivers the "it's correct when I open it" experience without always-on infrastructure | — Pending |
| Store status changes as dated transition events, not a single status field | Conversion and response-time analysis require history; current-state-only data cannot answer "what's working" and the loss is irreversible | — Pending |
| Capture analysis dimensions at ingestion time | A dimension not extracted when the email is parsed can never be charted later | — Pending |
| Demo mode built in from the first shippable version | Real data is rejections and compensation talk; retrofitting data masking is far more expensive than designing for it | — Pending |
| Local-first, single-user, no hosting or auth | I am the only user; charting renders client-side, so analytics needs impose no hosting requirement | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-04 — started milestone v1.1 Outreach & Email Threading*
