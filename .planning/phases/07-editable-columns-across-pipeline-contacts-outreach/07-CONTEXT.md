# Phase 7: Editable Columns Across Pipeline, Contacts & Outreach - Context

**Gathered:** 2026-08-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Make existing record columns **editable in place** across three already-built views — the Pipeline (via an edit section on a new company page), the Contacts Database, and the Outreach tab — reusing the existing edit-dialog / Server-Action / override machinery. A shared "dropdown + Other" control lets enum-ish fields be corrected, with "Other" promoting to a real reusable category. Covers EDIT-01, EDIT-02, EDIT-03, EDIT-04.

**NOT in this phase:** Gmail outreach auto-capture (OUT-02 → Phase 8) and email threading (MAIL → Phase 9). No new analytics. No inline-cell editing. No custom/user-defined pipeline stages.
</domain>

<decisions>
## Implementation Decisions

### "Other" / enum data model (EDIT-04)
- **D-01:** On the **flat** dropdown fields — **Source, Role type, Channel** — picking "Other" and typing a value **promotes it to a new reusable lookup category** (a real row in the lookup table), so it's selectable next time and groups cleanly in analytics. Reuse the Phase 6 `outreach-log-form.tsx` "Other + free-text" UX (`OTHER_PURPOSE` / `purposeOther`), but persist the typed value as a first-class category rather than a one-off string. Rationale: protects the "see what actually converts" core value from label fragmentation.
- **D-02:** **Stage is FIXED — no "Other."** Editing stage picks only from the existing `stages` lookup; the pipeline funnel order and its analytics stay intact. Custom/user-defined stages are explicitly deferred.
- **D-01a [planner/researcher]:** `channel` is currently a hardcoded `z.enum(OUTREACH_CHANNELS)` in `validation.ts`. Supporting promote-to-category likely means migrating channel to a lookup table (or adding a channel lookup). Planner/researcher decides the exact migration; must be additive against both real + demo stores (house rule).

### Editing UX (EDIT-02, EDIT-03)
- **D-03:** **Per-row edit dialog**, extending the existing `application-form-dialog.tsx` pattern, used **consistently** across Pipeline / Contacts / Outreach. No inline-cell editing (rejected — new interaction surface, accessibility cost).
- **D-06:** Editable column sets — **Contacts:** everything **except** the derived columns Touchpoints, Outreach, and Last-outreach (all computed) → editable set is Name, Company, Role, Relationship, Channel. **Outreach:** all columns editable.

### Company page (EDIT-01)
- **D-04:** A **new `/company/[id]` route** (reached by clicking a company name in the Pipeline). Its edit section edits **both** (a) the company's application(s) — the pipeline fields: stage, role, date applied, source — **and** (b) company-level fields: name and aliases. When a company has multiple applications, list each one's editable fields.

### Edit persistence vs. re-sync (accuracy core value)
- **D-05:** Manual edits to **ingested application fields route through the existing `overrides` system** (`src/domain/overrides.ts` + `getMergedField` in `applications.ts`) so the manual value wins and survives every future Gmail sync (DATA-07 / CAP-03). Manually-created records (contacts, manually-logged outreach) may update the row directly since they are not re-synced. Keep forward-compatibility in mind for Phase 8 (auto-captured outreach may later need override-awareness).

### Claude's Discretion
- Whether `channel` migrates enum→lookup or uses a parallel channel lookup (D-01a).
- Exact edit-dialog field layouts and required/optional per field on each page.
- Multiple-applications layout on the company page.
- Extracting a **reusable "Select + Other" control** from the Phase 6 purpose logic for use by all editable promote-to-category fields (Source/Role/Channel).
- Whether Phase 7 wires override-awareness into outreach edits now or leaves it for Phase 8 (outreach is manual-only until then).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/REQUIREMENTS.md` — v1.1 **Editing (EDIT)** section: EDIT-01, EDIT-02, EDIT-03, EDIT-04 (locked for this phase). Also the foundations this builds on: **CAP-02** (manual add/edit), **CAP-03** (correction/override that persists across syncs), **DATA-07** (manual value takes precedence over parser-derived).
- `.planning/ROADMAP.md` — Phase 7 section (goal + provisional success criteria).
- `.planning/PROJECT.md` — Core Value ("stays accurate without me remembering") + local-first/demo-real constraints that gate any migration.
- `.planning/phases/06-outreach-tracker-data-model-manual-logging-filterable-view/06-CONTEXT.md` — the established "Other + free-text" dropdown pattern (D-05 there) and the table/Server-Action patterns this phase mirrors.

No external ADRs/specs — decisions are fully captured above and in REQUIREMENTS.md.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/application-form-dialog.tsx` — the add/edit application dialog; **the pattern to extend** for all per-row edit dialogs (D-03).
- `src/app/actions.ts` — `updateApplicationAction` (existing application edit Server Action) + `quickSaveAction`/`logOutreachAction` write-path pattern; add edit actions for contacts/outreach and the company page here.
- `src/domain/overrides.ts` + `getMergedField` (`src/domain/applications.ts`) — the **single enforced place** for manual-wins precedence (DATA-07); route ingested-application edits through it (D-05). `OVERRIDABLE_FIELDS` enum in `validation.ts`.
- `src/components/outreach-log-form.tsx` — `OTHER_PURPOSE` / `purposeOther` / `isOtherPurpose` free-text-"Other" logic to extract into a reusable Select+Other control (D-01).
- `src/components/ui/select.tsx` — the shadcn Select primitive for all dropdowns.
- `src/db/schema.ts` — lookup tables `stages`, `sources`, `roleTypes` (FK-referenced); `contacts.relationshipType` is a plain text column; `outreach_messages` fields. Promote-to-category (D-01) inserts into the flat lookup tables.
- `src/db/validation.ts` — `OUTREACH_CHANNELS` enum (channel), `OVERRIDABLE_FIELDS`; zod schemas to extend for edits.
- `src/components/contacts-table.tsx`, `src/components/outreach-table.tsx`, `src/components/application-table.tsx` — where the "edit" affordance per row is wired in.
- `src/db/migrate.ts` + `npm run db:generate` — additive-migration flow (both stores) for any channel enum→lookup change.

### Established Patterns
- **Server Action + zod validation**, **fail-loud** (a failed edit surfaces an error, never silently drops).
- **Single `DASHBOARD_MODE` reader** (`src/db/client.ts`); domain fns receive the resolved `db` handle.
- **Override precedence is enforced only in `getMergedField`** — never re-implement it elsewhere.
- **Additive migrations against BOTH real and demo stores**; TS reduction, never SQL GROUP BY.

### Integration Points
- New `/company/[id]` Server Component route → company + application(s) read → edit dialog(s) (D-04). Wire the Pipeline company name to link here.
- Edit dialogs on Contacts (`contacts-table.tsx`) and Outreach (`outreach-table.tsx`) rows.
- New edit Server Actions → domain writers; ingested-application edits → `overrides` insert (D-05).
- Reusable Select+Other control → promote-to-category writes into `sources`/`roleTypes`/(channel lookup).
</code_context>

<specifics>
## Specific Ideas

- User's framing: "anything with a colored circle around it (channel, etc.) should be editable via dropdown with an 'Other' option editable via text." Interpreted as: flat enum/lookup fields get promote-to-category "Other"; Stage (funnel-defining) stays fixed.
- Pipeline editing is reached by "clicking into the company name," which opens the company page — hence the new `/company/[id]` route and the both-application-and-company edit section (D-04).
- Touchpoints and Outreach on Contacts are deliberately read-only because they will be driven by email→contact tagging (Phase 8/9 territory), not hand-edited.
</specifics>

<deferred>
## Deferred Ideas

- **Custom / user-defined pipeline stages** — considered under "Other" storage; rejected this phase to protect the funnel order and analytics (D-02). Revisit only if a real need emerges.
- **Inline-cell editing** — considered for the tables; rejected in favor of the consistent per-row edit dialog (D-03).
- **Structured outcome enum + conversion analytics** — still deferred from Phase 6; unaffected here.
- **Override-awareness for auto-captured outreach** — only relevant once Phase 8 (OUT-02) exists; forward-compat noted (D-05).

None of these block Phase 7.
</deferred>

---

*Phase: 7-Editable Columns Across Pipeline, Contacts & Outreach*
*Context gathered: 2026-08-06*
