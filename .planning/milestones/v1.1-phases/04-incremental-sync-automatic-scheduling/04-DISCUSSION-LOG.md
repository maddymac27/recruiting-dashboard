# Phase 4: Incremental Sync & Automatic Scheduling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-03
**Phase:** 4-Incremental Sync & Automatic Scheduling
**Areas discussed:** Wake + catch-up behavior

---

## Area selection

| Area | Discussed |
|------|-----------|
| Unattended failure visibility | Deferred to Claude's discretion (default set — D4-03) |
| Wake + catch-up behavior | ✓ discussed |
| Cursor-expiry resync scope | Deferred to Claude's discretion (default set — D4-04) |
| Scheduling mechanism | Deferred to Claude's discretion (default set — D4-05) |

---

## Wake + catch-up behavior

### Question 1 — When should the daily sync actually fire?

| Option | Description | Selected |
|--------|-------------|----------|
| Catch-up only | Don't wake the machine; daily schedule + "run ASAP after missed start"; runs on next open/boot | ✓ |
| Wake + catch-up (both) | Enable wake-timer AND catch-up; laptop wakes itself to sync; requires hardware testing | |
| Wake only | Wake at scheduled time, no catch-up; risks silently skipping a day (violates fail-loud) | |

**User's choice:** Catch-up only.
**Notes:** Chosen because incremental sync makes one catch-up run cover the whole missed gap, so it produces identical data to waking — while sidestepping the Phase 3 hardware-dependent wake-timer blocker entirely. → D4-01.

### Question 2 — Also run at logon/unlock?

| Option | Description | Selected |
|--------|-------------|----------|
| Daily + at logon | Daily schedule AND at-logon trigger (throttled to skip if a sync ran in the last few hours) | ✓ |
| Daily schedule only | Just once-per-day + catch-up | |
| Let me pick a time | Daily-only at a user-specified time | |

**User's choice:** Daily + at logon (throttled).
**Notes:** Best serves "stays accurate without me remembering" — freshest data the moment the laptop is opened. → D4-02.

---

## Claude's Discretion

Defaults were set (and flagged "confirm during planning") for the three areas the user chose not to deep-dive:
- **D4-03** — Unattended failure visibility: extend existing in-app health indicator + add a >~2-day staleness alarm; scheduled script records every attempt as a `sync_runs` row; no OS notification this phase.
- **D4-04** — Cursor-expiry full-resync bounded by last successful sync (not entire label); dedup ledger keeps it correct; fallback recorded loudly.
- **D4-05** — Windows Task Scheduler + standalone `tsx scripts/sync.ts` reusing `runGmailSync`; historyId cursor on the successful `sync_runs` row (or a dedicated single-row table); real-mode only; `users.history.list` incremental.

## Deferred Ideas

- OS-level (Windows toast) notification on sync failure/staleness — deferred to keep this phase in-app and dependency-free.
- Periodic wider-net subject-keyword inbox scan for the REL-04 recall gap — roadmap-level carried-forward risk, not this phase.
