# Phase 5: Analytics & Dashboard Completion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-03
**Phase:** 5-Analytics & Dashboard Completion
**Areas discussed:** Staleness thresholds; Today-view shape & actions

---

## Area selection

| Area | Discussed |
|------|-----------|
| Staleness thresholds | ✓ discussed |
| Gone-quiet: flag vs Ghosted stage | Deferred to Claude's discretion (default set — D5-06) |
| Today-view shape & actions | ✓ discussed |
| Analytics & funnel scope | Deferred to Claude's discretion (default set — D5-07) |

---

## Staleness thresholds

### Question 1 — What resets the "last activity" clock?

| Option | Description | Selected |
|--------|-------------|----------|
| Any activity | Most recent of {status transition, logged conversation/contact} | ✓ |
| Status transitions only | Only last status-event date | |
| Last inbound email only | Clock = last received message | |

**User's choice:** Any activity → D5-01.
**Notes:** Covers both a stage change and a logged recruiter exchange even when the stage didn't move.

### Question 2 — Per-stage silence thresholds?

| Option | Description | Selected |
|--------|-------------|----------|
| Standard | Applied 14 / Screen 10 / Interview 10 / Saved 7-day nudge; terminals never | ✓ |
| Aggressive | Applied 10 / Screen 7 / Interview 7 / Saved 5 | |
| Relaxed | Applied 21 / Screen 14 / Interview 14 / Saved none | |
| Exact numbers | User specifies | |

**User's choice:** Standard → D5-02.

---

## Today-view shape & actions

### Question 1 — Where does the today-view live?

| Option | Description | Selected |
|--------|-------------|----------|
| New landing at / | Today-view is home; board moves to /board | ✓ |
| Separate /today tab | Board stays home; today is a tab | |
| Panel on top of board | Summary strip above the board columns | |

**User's choice:** New landing at / → D5-04.

### Question 2 — What actions per today-view item? (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Log a follow-up / conversation | Inline CAP-04 logging; resets the clock | ✓ |
| Change stage | Inline change-stage (advance or close out) | ✓ |
| Snooze / dismiss | Hide for N days (needs snooze store) | |
| Just link to job detail | Read-only + click-through | ✓ |

**User's choice:** Log follow-up + Change stage + click-through to detail; **NO snooze** → D5-05.
**Notes:** Items clear naturally when activity is logged or stage changes — no snooze-state store needed.

---

## Claude's Discretion

Defaults set (flagged "confirm during planning") for the two undiscussed areas:
- **D5-06** — Gone-quiet is a DERIVED read-time overlay, never an auto-written status event; Ghosted stays a manual terminal outcome (keeps funnel/analytics clean + fail-loud/trust).
- **D5-07** — Analytics kept basic: funnel = distinct-app "ever reached stage" over the event history; minimal summary metrics; recharts behind a package-legitimacy checkpoint; all-time range; dedicated /analytics route.
- **D5-08** — Reuse the Phase 4 pure-predicate pattern in a new `src/lib/application-staleness.ts`.

## Deferred Ideas

- Snooze/dismiss a today-view item (v2).
- Configurable thresholds via settings table (v2; constants fine for one user).
- Richer analytics: conversion-over-time, response-time, self-serve slicing (ANLYT-01/02/03, v2).
- 999.1 UI-polish backlog (board columns, colors, sidebar, card density, sort/filter).
