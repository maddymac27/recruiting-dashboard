# Feature Research

**Domain:** Personal job-application tracking dashboard (single-user, email-ingestion-driven)
**Researched:** 2026-07-21
**Confidence:** MEDIUM-HIGH (product feature sets verified against multiple current reviews/help docs; internal mechanics of proprietary parsing — confidence scoring, staleness thresholds — are inferred/LOW since vendors don't publish algorithms)

## Landscape Overview

Two distinct product generations exist, and this project sits deliberately between them:

1. **Manual trackers with extras bolted on** — Teal, Huntr, Careerflow. Core mechanic: a kanban/table board you update by hand, wrapped in a resume builder, AI cover letter generator, job board aggregator, and (for Careerflow) a networking CRM. Tracking is a side feature of a broader "job search suite."
2. **Autofill-driven "capture as a side effect" trackers** — Simplify Copilot, Huntr's autofill extension. The application gets logged automatically *because* you used their Chrome extension to fill out the form on Workday/Greenhouse/etc. This solves data entry at the point of applying, but does nothing once the application leaves your hands — status changes (screens, rejections, ghosting) still require the user to notice an email and go update the board.
3. **Email-native trackers** — JobFlow AI, G-Track, Gmail Job Application Tracker, SkillStory, Prowl, plus various one-off Apps Script/GPT projects on GitHub/Medium. These are the closest analogues to this project: they read Gmail/Outlook via OAuth and classify emails (Applied, Interview, Offer, Rejected) using an LLM or rules, updating the board without user action. This category is thin, mostly indie/early-stage, and none of the reviewed products publish detail on how they surface parsing confidence or let users correct misclassification — this is a genuine gap this project can fill and differentiate on.

Spreadsheet templates (the de facto standard before any of these products existed, and still what many job seekers actually use) converge on a small, consistent stage set and a small set of conditional-formatting tricks that any tracker should treat as the baseline UX to beat.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Pipeline/stage board (Saved → Applied → Screen → Interview → Offer → Rejected) | Every product and every spreadsheet template uses some variant of this; it's the mental model of a job search | LOW | Huntr's default is Wishlist/Applied/Interview/Offer/Rejected; spreadsheet templates commonly add Applied/Followed Up/Rejected/Ghosted. See PITFALLS.md for why a naive 5-stage model breaks on the most common real outcome (silence). |
| One row/card per job application | Basic unit of the domain — a job seeker thinks "per application," not "per email" | LOW | Must be the entity that emails, contacts, and status events all attach to. |
| Manual add-a-job (paste URL or fill a form) | Not every job comes through automatable channels (LinkedIn, Handshake) — users need a manual escape hatch even in an ingestion-first tool | LOW | Explicitly required in PROJECT.md ("save a job by pasting its URL"). |
| Manual edit/override of any field | Parsers get company names, stages, and dates wrong; every automated tracker in this space (and every spreadsheet) implicitly assumes hand-editing is always available | LOW | This is non-negotiable for an extraction-driven tool — see PROJECT.md requirement and PITFALLS.md on silent misclassification. |
| Detail view per job (full history: status changes, contacts, notes/messages) | Users want to reconstruct "what happened with this one" before a follow-up or interview | MEDIUM | Requires transition-event storage, not a single overwritten status column (already decided in PROJECT.md). |
| Company + role + source + date-applied fields at minimum | These are the columns every spreadsheet template has; also the minimum dimensions needed for later "what's working" analysis | LOW | PROJECT.md already specifies these as ingestion-time capture fields. |
| Summary counts (applied / saved / in progress / closed) | Every tracker (Huntr board, Teal table, spreadsheet totals row) surfaces this as the at-a-glance number | LOW | Cheap to compute from current-state aggregation. |
| Follow-up / staleness flag ("needs attention") | The #1 complaint about spreadsheets is that nothing tells you when to act; templates try to solve this with manual date formulas and conditional formatting | MEDIUM | See PITFALLS.md for concrete threshold conventions (14 days post-apply, 7-10 days post-interview) and why "needs attention" logic is subtler than a single days-since-applied number. |
| Contacts attached to a job (recruiter name, note, last contacted) | Careerflow, Huntr, and spreadsheet "notes" columns all have some place to record who you talked to | LOW-MEDIUM | Table stakes at the "attach a name and note" level; becomes a differentiator once contacts are modeled as their own entity spanning multiple jobs (see below). |
| Basic funnel/count-based chart (applied vs. interviewing vs. offers) | Teal and Huntr both surface aggregate stage counts; Huntr publishes its own aggregate trend reports built on exactly this kind of stage-count data | LOW-MEDIUM | The static "how many are in each bucket right now" view — distinct from the historical/time-based analytics below. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|--------------------|------------|-------|
| Automatic email ingestion with visible confidence/ambiguity handling | This is the core mechanic and the biggest gap in the current market — reviewed email-native competitors (JobFlow AI, G-Track, SkillStory, Prowl) advertise "auto-detects rejections/interviews" but none publish how they handle uncertain classifications or expose a correction workflow. A visible "I'm not sure about this one, confirm?" queue for low-confidence extractions is a genuine differentiator, not just a nice-to-have | HIGH | Needs: a confidence/ambiguity signal at parse time, an inbox-style review queue for uncertain items, and a one-click correct/reject path that also improves future parsing (or at minimum doesn't repeat the same mistake). Directly serves PROJECT.md's "fail loudly, never silently miss" reliability constraint. |
| Status-change history as first-class data (not just current state) | Nearly every competitor stores current stage only; Huntr's own trend reports had to reconstruct funnel/conversion analysis from raw event logs because that's not normally exposed to the end user. Surfacing full transition history in the UI (not just internally) is rare | MEDIUM | Already an architectural decision in PROJECT.md. The differentiator is *exposing* this (timeline view per job) rather than just using it for internal analytics. |
| Time-based conversion analytics (response rate, time-to-first-response, time-in-stage, conversion by source/role/company) | This is exactly the kind of analysis job-search-metrics guides tell people to do manually in a spreadsheet with formulas ("time to response = first response date − date applied"; "response rate = responses ÷ applications") — no reviewed consumer tracker exposes this per-user, self-service, and sliceable. Huntr publishes *aggregate* trend reports from this data but doesn't expose a personal equivalent dashboard to each user | HIGH | Requires transition-event history (dependency, see below) plus source/role dimensions captured at ingestion time (already planned). This is the single highest-value differentiator relative to every competitor reviewed. |
| User-driven slicing/filtering of analytics (not fixed dashboard widgets) | Every competitor dashboard (Teal, Huntr) ships fixed, pre-defined charts. A self-serve filter (by source, role type, company, date range) turns the tool into an actual analysis surface instead of a vanity-metrics page | MEDIUM | Depends on the analytics data model being dimensional (source, role type, stage-transition dates) rather than a handful of hardcoded aggregates. |
| Contact-spans-multiple-jobs modeling | Competitors (Careerflow's networking CRM, Huntr's lightweight contact fields) attach contacts to a single job/board card. Recruiters at agencies and repeat referrals routinely span multiple applications/companies over time — a contact-as-its-own-entity model (many-to-many with jobs) is more accurate to how a real search plays out and enables "who has helped me across my whole search" queries | MEDIUM | Needs its own contact table with a join table to jobs, distinct from the job-level "notes" field competitors use. |
| Demo mode with realistic seed data | No competitor needs this (they're multi-tenant SaaS with other people's data as the demo); for a single-user local-first portfolio project, this is a real differentiator that makes the project shareable at all | LOW-MEDIUM | Already a PROJECT.md requirement; note it here because it's genuinely unusual in this feature landscape — most personal trackers are never built to be shown to anyone else. |
| Escape-hatch ingestion path (Gmail label) for non-automatable sources | Competitors either give up on non-ATS sources (Simplify/Huntr autofill only works on portals they've built forms for) or require full manual entry. A designed "forward to this label" pattern for recruiter DMs and self-forwarded LinkedIn messages is a pragmatic middle path not offered by any reviewed competitor | LOW-MEDIUM | Already specified in PROJECT.md; worth flagging as differentiator because it directly targets what competitors treat as unsolvable (LinkedIn/Handshake access). |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|----------------|------------------|-------------|
| Resume builder / resume version management (Teal's core feature) | "Since I'm tracking applications, why not manage the resumes I sent too?" | Entirely separate problem domain (document editing/versioning), massive scope creep, and not the stated failure mode (PROJECT.md: prior attempts died at capture/accuracy, not at resume management). Adds a whole content-editing surface for a single user who already has a resume workflow | Keep a plain "resume version used" text/link field on the application record if traceability is wanted — do not build an editor |
| AI cover letter generator | "Everyone else has one, feels incomplete without it" | Outbound content generation is explicitly out of scope per PROJECT.md ("automatic email sending or replying on my behalf" stays under direct control) — a cover-letter generator is the same category of overreach into the applicant's voice/judgment, just pre-send instead of post-send | None needed; this tool tracks the search, it doesn't write the application |
| Job board aggregation / "40+ job boards in one feed" (Teal, Simplify) | Feels natural to pair "where I found jobs" with "jobs I'm tracking" | Explicitly out of scope in PROJECT.md ("automatic job discovery or recommendations") — this is a discovery/search product, a fundamentally different job than tracking an existing pipeline, and it invites scope creep into scraping and licensing concerns | Manual "paste a job URL" capture only, which PROJECT.md already specifies |
| Browser extension for autofilling application forms (Simplify Copilot, Huntr, Teal) | This is literally how two of the four reference competitors capture data at all, so it looks load-bearing | Build/maintenance cost of a cross-site DOM-scraping extension is disproportionate for a single user's own applications, and it doesn't address the actual identified failure (post-submission status drift) — email ingestion covers the same "auto-capture on application" case without a browser extension, since ATS platforms (Workday, Greenhouse, Lever, Ashby) already send a confirmation email | Rely on the targeted Gmail search to capture the application-confirmation email instead of intercepting the form submission itself |
| Networking CRM (Careerflow): tagging/scoring contacts, outreach campaigns, LinkedIn contact import at scale | "Contacts are part of the job search too" | A full CRM (pipelines of *people* independent of jobs, campaign-style outreach tracking, contact scoring) is a different product aimed at professional networking broadly, not a job-application tracker; for one user's active search, most contacts are 1-3 people per job | Lightweight contact records scoped to (and joinable across) actual job applications — no independent contact "pipeline," no outreach campaign tooling |
| Multi-user / team hiring-manager view, sharing, permissions | Common in ATS-adjacent tooling and sometimes requested "in case I want to share with a mentor/coach" | PROJECT.md is explicit: single user, no auth/tenancy needed, pure cost with no benefit. Demo mode already solves the "show it to someone" need without real multi-user infrastructure | Demo mode toggle with seeded fake data; no accounts, no sharing permissions model |
| Real-time push notifications / always-on background sync | Feels like the "modern SaaS" thing to have; automated email trackers imply real-time monitoring | PROJECT.md explicitly chose daily automatic sync + manual refresh over true real-time to avoid always-on infrastructure; real-time inbox watching (push notifications via Gmail watch/pub-sub) adds infra complexity (webhook endpoint, renewal logic) disproportionate to a personal, low-volume (~8 emails/week) use case | Daily scheduled sync job plus an on-demand "sync now" button |
| Automatic outbound follow-up email sending/scheduling | "If it can read my email, why can't it also send the follow-up nudge?" | PROJECT.md explicitly keeps outbound communication under direct user control — this is a job search, not marketing automation; auto-sending on someone's behalf risks tone-deaf or duplicate outreach | Surface "this needs a follow-up" as a to-do; let the user write and send it themselves |
| Interview scheduling / calendar integration | Interview tools (Careerflow, some ATS-linked products) offer calendar sync for interview dates | Out of scope for this milestone; calendar data isn't part of the stated failure mode (status drift, not scheduling), and it's a second OAuth surface (Google Calendar) beyond the one already justified (Gmail) | Interview date can live as a plain field/event derived from the email itself (interview invite email → interview stage transition + date), no calendar API needed |

## Feature Dependencies

```
Transition-event history (status changes as dated events, not overwritten field)
    └──requires──> Conversion/response-time analytics (response rate, time-to-first-response, time-in-stage)
                       └──enhances──> Slicing/filtering by source, role, company
    └──requires──> Per-job timeline/detail view (differentiator UX on top of the same data)

Email ingestion (targeted Gmail search + label escape hatch)
    └──requires──> Confidence/ambiguity signal at parse time
                       └──requires──> Correction/review queue UI
                                          └──enhances──> Trust in "needs attention" flags (users won't trust staleness logic if they don't trust the underlying data)

Contact-as-entity model (spans multiple jobs)
    └──requires──> Job-to-contact join table (not a single "notes" field on the job)
    └──enhances──> Per-job detail view (shows contacts across time)

Source/role-type capture at ingestion time
    └──requires──> Conversion analytics by source/role (cannot backfill a dimension not captured at parse time)

Staleness/"needs attention" logic
    └──requires──> Transition-event history (need "days since last status change," not just "days since applied")
    └──conflicts with──> Naive single-timer models (see PITFALLS.md — one threshold cannot represent both "no response ever" and "gone quiet after a screen")

Anti-feature: browser extension autofill ──conflicts──> Core value prop (email ingestion should make an extension unnecessary; building both is redundant capture paths)
Anti-feature: resume builder ──conflicts──> Scope discipline (PROJECT.md's stated failure mode is capture accuracy, not resume tooling)
```

### Dependency Notes

- **Analytics requires transition-event history:** This is already decided in PROJECT.md, but it's worth restating as a hard dependency — every differentiator metric (response rate, time-to-first-response, funnel drop-off, time-in-stage) is mathematically impossible to compute from a current-state-only data model. If this phase is deferred or under-built, no later phase can retroactively produce historical accuracy; the analytics phase must come after (or be co-designed with) the ingestion/data-model phase, never before.
- **The confidence/ambiguity review queue enhances trust in staleness logic:** If users can't trust that ingestion caught everything correctly, they won't trust a "this thread's gone quiet" flag either — they'll suspect it's a parsing miss instead of real silence from the employer. Building the correction UI early (even minimally) protects the credibility of every downstream feature.
- **Source/role capture at ingestion time is irreversible if skipped:** Unlike UI features, this is a data-capture decision — a dimension not extracted when an email is parsed cannot be reconstructed later without re-parsing (and even then, older emails may already be archived/deleted or the source signal may not be re-derivable). This has to be right from the first ingestion pass.
- **Browser-extension autofill conflicts with the core value prop:** Simplify/Huntr's whole model is "capture at the point of applying, via an extension." This project's model is "capture from the confirmation email the ATS already sends." Building both would mean two capture pipelines to maintain and trust for the same event — pick one (email) and let manual URL-paste cover what email can't.

## MVP Definition

### Launch With (v1)

- [ ] Job record with company, role, source, date-applied, current stage, outcome — table stakes, and the analysis dimensions PROJECT.md requires captured at ingestion time
- [ ] Status stored as dated transition events — required for every differentiator; cannot be retrofitted without losing history
- [ ] Targeted Gmail search ingestion (known ATS sender domains) + label-based escape hatch — the core value prop
- [ ] Manual add-a-job via URL paste — covers what ingestion can't reach (LinkedIn, Handshake)
- [ ] Manual correction/override of any field — non-negotiable once auto-extraction exists
- [ ] "What needs me today" view (overdue follow-ups, quiet threads, awaiting-my-reply) — the Monday-morning question PROJECT.md names explicitly
- [ ] Full pipeline view + per-job detail/timeline — table stakes for trustworthy at-a-glance status
- [ ] Contacts linked to jobs with dates — table stakes at the minimum "attach a name" level
- [ ] Basic funnel/summary counts and one or two aggregate charts — table stakes baseline before deeper analytics
- [ ] Demo mode with seed data — required from v1 per PROJECT.md, not retrofittable cheaply

### Add After Validation (v1.x)

- [ ] Full conversion analytics suite (response rate, time-to-first-response, time-in-stage, by source/role/company) — add once enough real transition-event data has accumulated to make the charts meaningful (a handful of applications won't produce a useful funnel)
- [ ] Self-serve slicing/filtering UI on analytics — add once the fixed charts prove which slices are actually useful to look at
- [ ] Contact-as-independent-entity spanning multiple jobs (join table, "who's helped across my search" view) — add once enough repeat contacts (agency recruiters, multi-touch referrals) actually appear in the data to justify the model
- [ ] Visible confidence/ambiguity queue for uncertain email parses — start with "flag as unparsed / needs review" in v1 if needed for reliability, but the richer confidence-scored UX can mature after observing real parsing failure modes

### Future Consideration (v2+)

- [ ] Any push/real-time sync — defer indefinitely per PROJECT.md's deliberate choice of daily batch sync; revisit only if daily cadence proves insufficient in practice
- [ ] Cross-milestone historical benchmarking (e.g., "this search vs. my last search") — defer until there's more than one full search's worth of data to compare

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Email ingestion (targeted search + label) | HIGH | HIGH | P1 |
| Transition-event data model | HIGH | MEDIUM | P1 |
| Manual override/correction | HIGH | LOW | P1 |
| "Needs attention" / staleness view | HIGH | MEDIUM | P1 |
| Pipeline + detail view | HIGH | MEDIUM | P1 |
| Demo mode | MEDIUM (HIGH for portfolio use) | LOW-MEDIUM | P1 |
| Basic contact linkage | MEDIUM | LOW | P1 |
| Basic funnel/summary counts | MEDIUM | LOW | P1 |
| Conversion/time-based analytics | HIGH | HIGH | P2 |
| Self-serve analytics slicing | MEDIUM-HIGH | MEDIUM | P2 |
| Contact-as-entity across jobs | MEDIUM | MEDIUM | P2 |
| Confidence/ambiguity review queue (rich version) | MEDIUM-HIGH | HIGH | P2 |
| Resume builder / cover letter AI / job boards / extension / CRM / real-time sync | LOW (for this user) | HIGH | Do not build |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- Do not build: anti-features, excluded deliberately

## Competitor Feature Analysis

| Feature | Teal | Huntr | Simplify Copilot | Careerflow | This Project |
|---------|------|-------|-------------------|------------|--------------|
| Capture mechanism | Manual + extension scrape from job boards | Manual + autofill extension | Autofill extension (auto-saves on submit) | Manual + extension | Automated Gmail ingestion (targeted search + label), manual URL-paste fallback |
| Pipeline model | Table view, spreadsheet-like | Kanban board (Wishlist/Applied/Interview/Offer/Rejected) | Dashboard list, tied to autofill history | Kanban-style CRM board | Stage model with explicit dated transitions, designed to represent "no response" distinctly (see PITFALLS.md) |
| Status updates after submission | Manual | Manual | Manual (autofill only covers the apply step) | Manual | Automatic via ongoing email ingestion — the actual gap this project targets |
| Analytics | Aggregate stage counts only (no time-based metrics exposed) | Aggregate stage counts; internal event logs power Huntr's own published *aggregate* trend reports, not exposed per-user | None substantive | Basic progress tracking | Response rate, time-to-first-response, time-in-stage, conversion by source/role/company, user-sliceable |
| Contacts | Basic notes field | Basic contact fields per job | Minimal | Full networking CRM (LinkedIn import, outreach tracking) | Contacts as their own entity, joinable to multiple jobs, without a full CRM/outreach layer |
| Resume/cover letter tools | Core feature (builder + AI cover letter) | Secondary feature | Autofill-adjacent AI assist | Secondary feature | Explicitly excluded |
| Job discovery/boards | Aggregates 40+ boards | Job board browsing | Autofill works across 100+ ATS portals | Job board browsing | Explicitly excluded (paste-a-URL only) |
| Demo/shareable mode | N/A (multi-tenant SaaS) | N/A | N/A | N/A | Required from v1 (portfolio-piece requirement) |
| Single-user/local-first | No (cloud SaaS, accounts) | No | No | No | Yes — no auth/tenancy needed |

## Sources

- [Huntr Vs Teal Vs Careerflow: Which Is Right For You?](https://www.careerflow.ai/blog/huntr-vs-teal-vs-careerflow)
- [JobShinobi vs Huntr vs Teal vs Careerflow Job Tracker (2026): Honest Comparison](https://www.jobshinobi.com/compare/huntr-vs-teal-vs-careerflow-job-tracker)
- [Teal vs Huntr (2026): Which Job Tracker App Is Actually Worth Using?](https://cloudcolleague.com/blogs/job-hunting/teal-vs-huntr/)
- [Using Copilot to Autofill Applications - Simplify](https://help.simplify.jobs/en/articles/2415391-using-copilot-to-autofill-applications)
- [Simplify Copilot | Autofill Job Applications and Track Jobs](https://simplify.jobs/copilot)
- [Job Tracking Stages (Applied, Interview, Offer, Rejected): Complete Guide for 2026](https://www.jobshinobi.com/blog/job-tracking-stages-applied-interview-offer-rejected)
- [The Job Tracker Template That Keeps Your Search Under Control](https://spreadsheetpoint.com/templates/job-tracker-spreadsheet/)
- [Huntr — Job Search Trends Q1 2026 Report](https://huntr.co/research/job-search-trends-q1-2026)
- [Huntr 2025 Annual Job Search Trends Report](https://huntr.co/research/2025-annual-job-search-trends-report)
- [Job Application Tracker & CRM | Huntr](https://huntr.co/product/job-tracker)
- [Getting Started with Careerflow.ai](https://help.careerflow.ai/en/articles/10723830-getting-started-with-careerflow-ai)
- [How to Keep Track of Job Applications The Easy Way | Careerflow](https://www.careerflow.ai/blog/how-to-track-job-applications)
- [The Job Board | Huntr Help Center](https://help.huntr.co/en/articles/10042685-the-job-board)
- [JobFlow AI — Automatic Job Application Tracker for Gmail & Outlook](https://jobflow-ai.com/)
- [Gmail Job Tracker – Auto-Sync Job Applications from Email | G-Track](https://jobtrack-ai.com/gmail-job-tracker)
- [Application Tracker for Gmail - Chrome Web Store](https://chromewebstore.google.com/detail/application-tracker-for-g/ejknjnphfnlhhalfagogfejcifleeglk)
- [Prowl - Job Application Tracker App | Automatic Email Tracking](https://prowljobtracker.app/)
- [Email Status Sync - Auto-Track Application Updates | SkillStory](https://www.ourskillstory.com/features/email-sync)
- [Teal Review: I Tested Its Autofill Feature for Job Applications](https://jobcopilot.com/teal-review/)
- [Job Application Tracker — Track & Organize Your Job Search | Teal](https://www.tealhq.com/tools/job-tracker)
- [How to Track Job Search Metrics (Applications to Interviews): Complete Guide for 2026](https://www.jobshinobi.com/blog/how-to-track-job-search-metrics-applications-to-interviews)
- [A Data-Driven Job Search System (2026): The Metrics That Decide Whether You Get Interviews](https://www.jobhuntr.fyi/blog/data-driven-job-search-system-2026)
- `.planning/PROJECT.md` (project requirements and constraints, read directly)

---
*Feature research for: personal job-application tracking dashboard*
*Researched: 2026-07-21*
