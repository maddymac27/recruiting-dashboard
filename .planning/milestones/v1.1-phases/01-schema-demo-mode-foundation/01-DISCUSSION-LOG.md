# Phase 1: Schema + Demo Mode Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-22
**Phase:** 1-Schema + Demo Mode Foundation
**Areas discussed:** Contacts & Conversations; Domain vocabulary defaults (reviewed)

---

## Area Selection

Presented four candidate gray areas: Pipeline stages, Source & role tags, Contact details, Demo dataset. User selected **Contact details** only, delegating the other three to Claude's judgment (then reviewed the proposed defaults — see below).

---

## Contacts & Conversations

### Q1 — How to record a conversation

| Option | Description | Selected |
|--------|-------------|----------|
| Dated entries | Each touchpoint its own timestamped record (date, channel, notes) | ✓ |
| Running notes per person | One appended notes field per contact | |
| Both | Structured dated entries plus freeform notes | |

**User's choice:** Dated entries.

### Q2 — Recruiter employer vs job's company

| Option | Description | Selected |
|--------|-------------|----------|
| Track it, keep it optional | Contact has own employer field separate from job's company | |
| Contact belongs to the job's company | Assume person is at the company applied to | ✓ |
| Just a free-text field | Store "where they work" as text | |

**User's choice:** Contact belongs to the job's company.
**Notes:** User accepted the simpler model. Claude flagged that the relationship-type tag (below) partially covers the agency-recruiter case, and recorded fuller agency-employer modeling as a deferred item for Phase 3 entity resolution.

### Q3 — Fields to capture per contact

| Option | Description | Selected |
|--------|-------------|----------|
| Core (name, role/title, channel, notes) | The essentials | ✓ |
| Contact info (email, LinkedIn URL) | For follow-ups and de-duping across jobs | ✓ |
| Relationship type | recruiter / hiring manager / referral / peer | ✓ |
| How you met / source | coffee chat, alumni, cold, mutual connection | ✓ |

**User's choice:** All four field groups.

---

## Domain Vocabulary Defaults (Claude proposed, user reviewed & approved)

Claude proposed defaults for the three un-selected areas because they are un-retrofittable. User reviewed all and selected **"All good — lock them in"** with no adjustments.

| Area | Proposed & locked value |
|------|-------------------------|
| Pipeline stages | Saved → Applied → Screen → Interview → Offer, plus Rejected, Ghosted (auto-flag in P5), Withdrawn |
| Source values | Handshake, Company site/ATS, Referral, LinkedIn, Job board/Other |
| Role-type tags | Product Management, Strategy, Chief of Staff, Other (extensible) |
| Demo dataset | ~15–20 invented-but-plausible companies across all stages, with contacts + dated conversations |

---

## Claude's Discretion

- All physical schema design: table structures, column types, indexing, event→projection derivation mechanism, alias structure, override-table shape, migration and seed-data tooling. Guided by STACK.md and ARCHITECTURE.md.

## Deferred Ideas

- Full agency/staffing-firm employer modeling for contacts → Phase 3 (entity resolution).
- Ghosted auto-flagging / staleness thresholds → Phase 5 (DASH-03).
- Override-survives-resync behavioral verification (CAP-03) → Phase 3.
