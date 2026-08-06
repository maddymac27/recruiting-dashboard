# Phase 6: Outreach Tracker — Data Model, Manual Logging & Filterable View - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-05
**Phase:** 6-Outreach Tracker — Data Model, Manual Logging & Filterable View
**Areas discussed:** Data-model links, Purpose & channel format, Response/outcome shape, Outreach vs Contact DB

---

## Data-model links

| Option | Description | Selected |
|--------|-------------|----------|
| Link company, free-text recipient | companyId → companies; recipient free text | |
| Fully standalone | free-text recipient AND company, no links | |
| Link company + contact | resolve recipient to contacts table too | ✓ |

**User's choice:** Link company + contact.
**Notes:** Richest cross-referencing; pairs with the "separate but cross-linked" tabs choice. Friction mitigated by reusing the existing "pick existing contact or add new" picker.

---

## Purpose & channel format

| Option | Description | Selected |
|--------|-------------|----------|
| Channel enum + purpose categories | channel fixed; purpose pick-list | ✓ (modified) |
| Channel enum, purpose free-text | channel fixed; purpose free text | |
| All free text | both free text | |

**User's choice:** Channel enum + purpose categories, **with a free-text "Other" as the last dropdown option** for one-off situations.
**Notes:** Categories power convert-analysis; the free-text escape hatch keeps rare cases loggable. Subject optional (LinkedIn has none).

---

## Response/outcome shape

| Option | Description | Selected |
|--------|-------------|----------|
| Status enum | No response / Replied / Advanced / Dead | |
| Responded yes/no + note | boolean + free-text note | |
| Responded + separate outcome field | responded boolean AND free-text outcome | ✓ |

**User's choice:** Responded (boolean) + separate free-text outcome field.
**Notes:** "Converted" reads primarily off responded=true; outcome text adds detail. No structured enum this phase (deferred).

---

## Outreach vs Contact DB

| Option | Description | Selected |
|--------|-------------|----------|
| Separate tabs | Outreach distinct from Contact DB | |
| Merge into one "Networking" tab | combined view with filter | |
| Separate, but cross-link | separate tabs, linked via contact | ✓ |

**User's choice:** Separate, but cross-link.
**Notes:** Enabled by the company+contact links (data-model choice). Outreach entry links its contact; contact surfaces related outreach.

---

## Claude's Discretion

- Exact purpose category wording; read-body as dialog vs inline expand; visual form of the cross-link; precise Outreach table columns; demo seed fixtures (portfolio-safe).
- Smaller defaults accepted without discussion: user-entered sent date defaulting to today; reuse of the sortable/filterable table pattern; Server Action + zod write path.

## Deferred Ideas

- Gmail auto-capture of self-forwarded outreach (OUT-02) → Phase 7 (roadmapped).
- Structured outcome enum + conversion analytics → future, if free-text outcome proves too fuzzy.
- Merging Outreach + Contact DB into one Networking tab → considered, rejected.
