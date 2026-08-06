# Phase 2: Manual Capture + Core Pipeline UI - Context

**Gathered:** 2026-07-28
**Status:** Ready for planning

<domain>
## Phase Boundary

The first genuinely usable, shippable slice: a manually-operated recruiting tracker UI running entirely on demo/seed data, proving the Phase 1 event-sourced schema end-to-end before any Gmail code is touched.

**In scope (requirements this phase closes):**
- **CAP-01** — Quick-save a job not yet applied to (paste URL + type company + role).
- **CAP-02** — Manually add a new application or edit any field on an existing one.
- **CAP-04** — Log a contact and a conversation against a job (covers manual entries and self-forwarded LinkedIn notes).
- **DASH-02 / DASH-04** — Pipeline board showing where every active application stands, with summary counts (applied, saved-not-applied, in progress, closed) at a glance.
- **DASH-05** — Single-job detail view showing full history: every status transition, contact, and message, reflecting the Phase 1 event-sourced data.

**Explicitly NOT in this phase:**
- Any Gmail ingestion, OAuth, parsing, review queue, or dead-letter surfacing → **Phase 3**.
- Override-survives-resync behavior (CAP-03) → **Phase 3** (manual edit here just writes directly; there is no parser to override yet).
- "Today / what needs me" view, auto-ghosting/staleness thresholds, funnel/analytics charts → **Phase 5**. (The nav shell reserves labeled slots for these but does not build them.)

Runs against whichever data mode the process launched in (demo or real) — this is a startup data-source swap, not an in-UI toggle (Phase 1 D-13).
</domain>

<decisions>
## Implementation Decisions

### Visual Style & App Shell (discussed with user)
- **D2-01 — Styling stack: Tailwind CSS + shadcn/ui.** The project is currently bare Next.js with no CSS framework. shadcn/ui's copy-in, accessible components (cards, dialogs, dropdowns, tables, badges) are the fastest path to a polished, portfolio-grade look and directly serve the board, detail, and form work this phase needs. shadcn components are copied into the repo (not a heavy runtime dep) and sit on Tailwind utilities.
- **D2-02 — App shell: persistent nav shell.** A sidebar or top nav with a **Pipeline** link active now, and **labeled-but-inert slots reserved for Today and Analytics (Phase 5)**. Chosen over a bare board+detail-routes setup so later phases add views without restructuring. Do NOT build the Today/Analytics views in this phase — only reserve their place in the nav.
- **D2-03 — Aesthetic: clean minimal light theme.** Neutral, data-forward dashboard with a single accent color. Light mode only (no dark-mode toggle this phase). Optimized to read well on a screen-share as a portfolio piece.
- **D2-04 — Visible DEMO badge in the shell.** A small badge rendered when running in demo mode, driven by the existing `dashboardMode` export from `src/db/client.ts` — so demo vs real is never confused on a screen-share. Real mode shows no badge (or a neutral one). This is display-only; it must not introduce any second reader/writer of `DASHBOARD_MODE` (Phase 1 single-reader invariant — the value comes only from `dashboardMode`).

### Board Layout & Stage Changes (Claude's discretion — user accepted recommended defaults)
- **D2-05 — Kanban-style board keyed to the locked stage vocabulary (Phase 1 D-05): `Saved → Applied → Screen → Interview → Offer`, plus terminal/branch states `Rejected`, `Ghosted`, `Withdrawn`.** Columns/groupings are read from the `stages` lookup, not hard-coded.
- **D2-06 — Stage changes via an explicit "change stage" control, NOT drag-and-drop.** Simpler, mobile-safe, and unambiguous. Every stage change **appends a dated status event** and recomputes the projection (Phase 1 D-09 / `appendStatusEvent` + `recomputeCurrentStage`) — no code path overwrites a current-stage field in place. (Drag-and-drop is a deferred nicety, not a requirement.)
- **D2-07 — Summary counts as a KPI row above the board** surfacing at minimum: applied, saved-not-applied, in progress, closed (DASH-04). Derived from the board read model, not stored.

### Add & Quick-Save Flow (Claude's discretion — user accepted recommended defaults)
- **D2-08 — shadcn modal dialogs over the board, two flows:**
  - **Quick-save (CAP-01):** minimal dialog — paste URL + type company + role → creates an application in the `Saved` stage (one Saved status event so `currentStageId` is never null, matching the Phase 1 seed convention). Optimized for speed.
  - **Full add/edit (CAP-02):** dialog exposing every editable field (company, role title, role type, source, date applied, stage), backed by `createApplication` / a new update path and the Phase 1 Zod validation (`newApplicationInput`). Role-type and source dropdowns read from the extensible lookups (Phase 1 D-06 / D-07).

### Job Detail & Contact Logging (Claude's discretion — user accepted recommended defaults)
- **D2-09 — Unified chronological timeline on the job detail view (DASH-05):** status transitions, conversations, and any linked messages interleaved by date into one history stream, reflecting the event-sourced model. Backed by `getApplicationDetail` plus new read models composing status events + `getContactsForApplication` + conversations.
- **D2-10 — Inline contact + conversation logging on the detail page (CAP-04):** add/link a contact and log a dated conversation without leaving the job view, using `createContact` / `linkContactToApplication` / `addConversation`. Includes a free-text paste path so a self-forwarded LinkedIn note is captured as a conversation entry (fully manual — Gmail ingestion is Phase 3). Contact fields follow Phase 1 D-02; a contact belongs to the job's company per Phase 1 D-03.

### Claude's Discretion
User scoped their involvement to the visual style & app shell area and delegated the rest. The following are Claude's to decide, guided by the defaults above and Phase 1 patterns:
- **New read models** — the board list/aggregate query, summary-count query, and the composed job-detail timeline query do NOT exist yet (Phase 1 only shipped single-record `getApplicationDetail`). Design them in the `src/domain` layer alongside existing functions; UI must not touch raw SQL.
- Component decomposition, routing structure (App Router routes for board + `/job/[id]` detail), server vs client components, form libraries, and exact shadcn component selection.
- Update/edit write path for CAP-02 (a `updateApplication` domain function, honoring event-sourcing for any stage change).
- Empty-state and loading-state treatments within each screen.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level scope & requirements
- `.planning/PROJECT.md` — Core value (stays accurate without manual updates), fail-loudly constraint, presentability constraint (portfolio demo), and locked key decisions.
- `.planning/REQUIREMENTS.md` — CAP-01, CAP-02, CAP-04, DASH-02, DASH-04, DASH-05 requirement text and IDs; note CAP-03 is deferred to Phase 3.
- `.planning/ROADMAP.md` §"Phase 2" — phase goal and 5 success criteria.

### Phase 1 foundation (the schema and data layer this UI drives)
- `.planning/phases/01-schema-demo-mode-foundation/01-CONTEXT.md` — locked domain vocabulary and event-sourcing/override/demo decisions. Especially **D-05** (stage vocabulary → board columns), **D-06/D-07** (source & role-type lookups → form dropdowns, extensible), **D-09** (stage change = append event), **D-11** (overrides; CAP-03 is Phase 3), **D-13** (demo/real is a startup data-source swap).
- `src/domain/*.ts` — the reusable data-access surface (see Code Insights below). UI drives these; no raw SQL in the UI.
- `.planning/research/ARCHITECTURE.md` — event-projection and derived-current-state patterns the board and timeline read from.
- `.planning/research/STACK.md` — locked TS/Next.js (App Router) + Drizzle stack; note node:sqlite driver amendment (Phase 1 D-14, requires Node ≥ 24).

No external ADRs or specs beyond the above — requirements are fully captured in `.planning/` and the decisions here. Tailwind + shadcn/ui setup docs are standard and can be pulled during research/planning.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (all built in Phase 1)
- `src/domain/applications.ts` — `createApplication(db, input)`, `getApplicationDetail(db, id)` (+ `ApplicationDetail` type with derived `outcome`).
- `src/domain/events.ts` — `appendStatusEvent(...)` — the ONLY correct way to change stage (append-only, D-09).
- `src/domain/projections.ts` — `recomputeCurrentStage(tx, applicationId)`, `rebuildAllProjections(db)`.
- `src/domain/contacts.ts` — `createContact`, `linkContactToApplication`, `addConversation`, `getContactsForApplication`, `getConversationsForContact`, `getApplicationsForContact`.
- `src/domain/companies.ts` — `resolveCompany`, `createCompany`, `addAlias`, `normalizeCompanyName`.
- `src/domain/overrides.ts` — `setOverride`, `getMergedField` (present but override-persistence behavior is exercised in Phase 3, not here).
- `src/db/client.ts` — single `db` client + `dashboardMode` export (the one legitimate source for the DEMO badge, D2-04).
- `src/db/validation.ts` — `newApplicationInput` Zod schema for the add/edit forms.
- Demo seed already ships ~17 invented companies across all 8 stages (Phase 1 D-12 / 01-05) — the board will look alive on first run in demo mode with no extra seeding.

### Established Patterns (must conform)
- **Event-sourcing:** never write a current-stage column directly; append an event and recompute (D-09).
- **Single DASHBOARD_MODE reader:** only `src/db/client.ts` reads the mode; the UI consumes `dashboardMode`, never `process.env.DASHBOARD_MODE` (D2-04 must respect this).
- **Domain layer owns SQL:** every existing screen-facing operation goes through `src/domain/*`; the UI should not query Drizzle/SQLite directly.
- **Zod validation at the write boundary** before persistence.

### Integration Points / Gaps to fill
- **No board/list read model exists** — only single-record `getApplicationDetail`. A list+aggregate query for the board and a summary-count query are net-new domain functions.
- **No composed detail-timeline read** — pieces exist (events, contacts, conversations) but not a single "application → interleaved dated history" query for DASH-05.
- **No `updateApplication` write path** — CAP-02 field edits need one (with event-sourcing honored for any stage change).
- **No styling/UI scaffolding** — Tailwind + shadcn/ui must be installed and configured from scratch (globals.css, config, component primitives); `layout.tsx` currently has no shell.
</code_context>

<specifics>
## Specific Ideas

- Portfolio-grade, screen-shareable look is an explicit goal (PROJECT.md presentability constraint) — the clean-minimal-light + shadcn choice is in service of that.
- The DEMO badge exists specifically so a screen-share never ambiguously shows real vs invented data.
- Board columns and form dropdowns are data-driven from the Phase 1 lookups so adding a role type / source later needs no UI change (Phase 1 D-07 extensibility).
</specifics>

<deferred>
## Deferred Ideas

- **Drag-and-drop stage changes on the board** — nice-to-have interaction; explicit "change stage" control is sufficient for this phase (D2-06). Revisit as a polish item, not a requirement.
- **Dark-mode toggle** — light-only this phase (D2-03); could be added later cheaply since Tailwind/shadcn support it.
- **In-UI demo/real toggle** — deliberately NOT built; mode is a startup swap by design (Phase 1 D-13). The badge only *displays* the active mode.
- **Today / what-needs-me view, auto-ghosting, funnel/analytics** — Phase 5. Nav shell reserves their slots only.
- **Override-survives-resync (CAP-03) verification** — Phase 3, once a real parser exists to override.

No scope creep occurred — discussion stayed within the Phase 2 manual-tracker-UI boundary.
</deferred>

---

*Phase: 2-Manual Capture + Core Pipeline UI*
*Context gathered: 2026-07-28*
