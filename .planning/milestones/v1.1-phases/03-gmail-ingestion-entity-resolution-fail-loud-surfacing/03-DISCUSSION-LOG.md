# Phase 3: Gmail Ingestion, Entity Resolution & Fail-Loud Surfacing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-29
**Phase:** 3-Gmail Ingestion, Entity Resolution & Fail-Loud Surfacing
**Areas discussed:** Parsing & privacy (deep-dived); Senders + label (quick)

---

## Gray-area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Parsing & privacy | Regex-only vs. LLM fallback; privacy tension | ✓ |
| Unmatched email | Auto-create vs. review-to-create vs. dead-letter | (defaulted) |
| Match confidence | Conservative vs. liberal auto-attach | (defaulted) |
| First senders + label | Which senders; label name | ✓ (quick) |

**Notes:** User chose to deep-dive Parsing & privacy only, then "nail senders + label, then wrap" — accepting fail-loud-aligned defaults for unmatched-email and match-confidence (flagged in CONTEXT.md for confirmation during planning).

---

## Parsing & privacy

### Q1 — Extraction approach for mail regex can't handle
| Option | Description | Selected |
|--------|-------------|----------|
| Regex-only | Per-sender parsers; rest → review/dead-letter; zero data leaves the machine; satisfies ING-04 + privacy | ✓ |
| Local LLM fallback | Ollama on-device; keeps data local but adds install/upkeep vs. low-effort constraint | |
| Cloud LLM (Claude Haiku), gated | Best quality but sends email content to Anthropic; conflicts with #1 privacy constraint | |

**User's choice:** Regex-only.
**Notes:** Framed that ING-04 only requires 2–3 parsed senders with the rest routed visibly, so the LLM was an optional recall booster, not a requirement — privacy chosen over recall.

### Q2 — Designated-label (free-form) mail capture
| Option | Description | Selected |
|--------|-------------|----------|
| Conversation entry via review | Surfaces in review; user attaches to a job as a conversation/note (reuses Phase 2 CAP-04 logging); verbatim capture | ✓ |
| Light heuristic pre-fill + review | Best-guess sender/date/subject pre-fill; more parser code, can mislead | |
| Capture to a generic inbox list | Standalone to-process list, unlinked until acted on | |

**User's choice:** Conversation entry via review.

### Q3 — Known-sender parse failure (template drift)
| Option | Description | Selected |
|--------|-------------|----------|
| Dead-letter, raw email visible | Flagged "known sender failed to parse"; makes drift loud; strongest fail-loud fit | ✓ |
| Review queue with partial fields | Less work per message but drift is quieter, easy to rubber-stamp | |
| Try, then fall back to conversation | Nothing lost, but silently stops real status transitions from that sender | |

**User's choice:** Dead-letter, raw email visible.

### Q4 — Minimum successful-parse bar
| Option | Description | Selected |
|--------|-------------|----------|
| Company + status + date | Enough to place a dated transition; role fill-later; misses less to review | ✓ |
| All four (company + role + status + date) | Strictest; more mail to review just for a missing role | |
| Just enough to match (company + status) | Date defaults to received-time; loses event-dating accuracy (DATA-03 / analytics) | |

**User's choice:** Company + status + date.

---

## Senders + label (quick)

| Question | Answer |
|----------|--------|
| ATS senders to parse first (besides roadmap-locked Handshake) | **Workday, Ashby** (to confirm against the real inbox during planning) |
| Escape-hatch Gmail label name | **"Job Search"** (reuse existing label) |

**Follow-up (label mechanics):** Clarified that Gmail "folders" and "labels" are the same construct — the user's existing "Job Search" subfolder *is* a label, reused directly (no new label needed). User chose **"Reuse 'Job Search' + ingest the history"** — a one-time historical backfill of the label's existing contents, explicitly accepting a large first-run review-queue triage. Captured as D3-06 (incl. query↔label message-id dedup).

---

## Claude's Discretion

Defaults set (user to confirm during planning — see CONTEXT.md `<decisions>`):
- **Unmatched email** → review queue as "confirm & create" (not silent auto-create / dead-letter).
- **Match confidence** → conservative: only high-confidence matches auto-attach; ambiguous → review.
- **Ingestion health (REL-03) + REL-04** → last-sync indicator + review/dead-letter counts + a persistent "targeted search can miss unlisted senders" risk note. UI specifics → UI-SPEC.
- **CAP-03** → wire re-parse write path to respect the existing Phase 1 overrides table (integration, mechanism exists).

## Deferred Ideas

- LLM extraction fallback (cloud or local) — declined v1 (privacy/effort); revisit if triage grows burdensome (relates to v2 INGB-01).
- Daily auto-sync + catch-up (ING-05) and cursor-expiry full-resync (ING-07) — Phase 4.
- ATS senders beyond the first 3 (Greenhouse, Lever, iCIMS, …) — future / v2 INGB-01.
