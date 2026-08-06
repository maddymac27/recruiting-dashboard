# Phase 7: Editable Columns Across Pipeline, Contacts & Outreach - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-06
**Phase:** 7-editable-columns-across-pipeline-contacts-outreach
**Areas discussed:** "Other" storage model, Editing UX per page, Company-page edit semantics, Edit vs. re-sync persistence, Stage-specific behavior

---

## "Other" storage model (EDIT-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Promote to reusable category | New value creates a real lookup entry — selectable next time, groups cleanly in analytics | ✓ |
| One-off free text | Store the typed string as a loose label — simplest, but fragments analytics | |
| You decide per field | Claude picks per field by role | |

**User's choice:** Promote to reusable category (for flat fields: Source, Role type, Channel).
**Notes:** Channel is a hardcoded enum today; promote-to-category likely needs an enum→lookup migration (planner's call). Reuses the Phase 6 outreach `purpose` "Other" UI.

## Stage-specific behavior (follow-up to "Other" storage)

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Stage fixed (no "Other") | Stage stays an ordered, closed set; protects the funnel + analytics | ✓ |
| Allow custom stages | Add stages via "Other" with a funnel-position prompt | |
| You decide | Claude decides during planning | |

**User's choice:** Keep Stage fixed — no custom stages this phase.
**Notes:** Stage defines the pipeline funnel order; arbitrary values would break board layout and conversion analytics.

## Editing UX per page (EDIT-02, EDIT-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse per-row edit dialog | Extend the existing application-form-dialog.tsx pattern everywhere | ✓ |
| Inline-cell editing | Click a cell, edit in place — new interaction pattern | |
| Mix of both | Inline for single-field, dialog for multi-field | |

**User's choice:** Reuse per-row edit dialog, consistent across all three views.
**Notes:** Least new UI; leverages existing edit machinery.

## Company-page edit semantics (EDIT-01)

| Option | Description | Selected |
|--------|-------------|----------|
| The application(s) | Edit pipeline fields (stage/role/date/source) only | |
| Application + company fields | Edit application fields AND company-level fields (name/aliases) | ✓ |
| Company fields only | Edit only company name/aliases | |

**User's choice:** Application + company fields, in one edit section on a new `/company/[id]` page.
**Notes:** Reached by clicking the company name in the Pipeline; list each application when a company has several.

## Edit vs. re-sync persistence (accuracy core value)

| Option | Description | Selected |
|--------|-------------|----------|
| Route through overrides | Manual edit wins and survives future Gmail syncs (DATA-07) | ✓ |
| Direct record update | Write the value onto the record; a later sync could overwrite it | |

**User's choice:** Route through the existing overrides system for ingested application fields.
**Notes:** Manually-created contacts/outreach can update directly (not re-synced).

---

## Claude's Discretion

- Whether `channel` migrates enum→lookup or uses a parallel channel lookup.
- Exact edit-dialog field layouts; multiple-applications layout on the company page.
- Extracting a reusable "Select + Other" control from the Phase 6 purpose logic.
- Whether outreach edits wire override-awareness now or defer to Phase 8.

## Deferred Ideas

- Custom / user-defined pipeline stages (rejected — Stage stays fixed).
- Inline-cell editing (rejected — dialog only).
- Structured outcome enum + conversion analytics (still deferred from Phase 6).
- Override-awareness for auto-captured outreach (relevant once Phase 8 exists).
