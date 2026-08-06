# Phase 5: Analytics & Dashboard Completion - Context

**Gathered:** 2026-08-03
**Status:** Ready for planning

<domain>
## Phase Boundary

The final phase: make the dashboard answer **"what needs me today"** and **"what's working"** using the append-only status-event history that has accumulated since Phase 1. Three deliverables: a today-view of applications needing attention (DASH-01), first-class **auto-flagging of gone-quiet applications** against stage-appropriate silence thresholds (DASH-03), and **basic funnel/summary analytics** over the transition history (DASH-06).

**Requirements:** DASH-01, DASH-03, DASH-06.

**In this phase:** a "what needs me today" landing view; a derived (non-destructive) gone-quiet flag with per-stage thresholds; a simple funnel chart + summary metrics.

**NOT in this phase (deferred to v2):** conversion analysis / response-time metrics / self-serve slicing (ANLYT-01/02/03); date-range filtering; a settings-table override for thresholds; company logos and other 999.1 UI-polish backlog items. Redirect richer-analytics scope creep to v2.
</domain>

<decisions>
## Implementation Decisions

### Application staleness / "gone quiet" — clock + thresholds (discussed)
- **D5-01: The activity clock = the most recent of {last status transition, last logged conversation/contact}.** "Gone quiet" means nothing has happened on an application in a while, judged against BOTH a stage change and a logged recruiter exchange (even when the stage didn't move). Not status-events-only (an app with recent emails but no stage change would wrongly look stale) and not inbound-email-only (ignores the user's own actions and only works for parsed mail).
- **D5-02: Per-stage silence thresholds (the "Standard" profile), encoded as named constants** (mirroring the Phase 4 `src/lib/staleness.ts` pure-predicate pattern — see D5-03):
  - **Applied → 14 days**, **Screen → 10 days**, **Interview → 10 days** of no activity ⇒ gone quiet.
  - **Saved (not applied) → 7 days** is a *separate* "you haven't applied yet" nudge, NOT "gone quiet" (different category in the today-view).
  - **Terminal stages (Offer, Rejected, Ghosted, Withdrawn) are never flagged** — they're closed.
  - Thresholds are per-stage, "each judged against its own appropriate threshold rather than one universal timer" (ROADMAP DASH-01 success criterion).

### Today-view shape & actions (discussed)
- **D5-04: The today-view becomes the new landing page at `/`; the existing pipeline board moves to `/board`** (linked in the sidebar). Best matches the core value — open the app and immediately see what needs action, not a full board to scan. This is a routing change to the Phase 2 board (currently at `/`).
- **D5-05: Each today-view item supports two inline actions plus a click-through to job detail:**
  - **Log a follow-up / conversation** inline (reuses the Phase 2 CAP-04 contact/conversation logging) — this resets the D5-01 activity clock, so acting on an item clears it from "gone quiet."
  - **Change stage** inline (reuses the existing change-stage action) — advance or close out (e.g. set Ghosted/Withdrawn) without leaving the view.
  - **Click-through to the job detail page** for everything else (all other actions already live there).
  - **NO snooze/dismiss** — deliberately excluded to avoid a new snooze-until state store; items clear naturally when the user logs activity or changes stage.

### Claude's Discretion — DEFAULTS set for the two areas not deep-dived (user to CONFIRM during planning)

- **D5-06: "Gone quiet" is a DERIVED, non-destructive read-time overlay — NEVER an auto-written status event.** Auto-flagging computes gone-quiet at read time from the D5-01 clock + D5-02 threshold; the application stays in its real current stage (e.g. "Applied") and simply gets a ⚠ "gone quiet" badge + appears in the today-view. The system NEVER auto-writes a terminal "Ghosted" event. Rationale: (1) event-sourcing integrity — an auto-injected terminal event would corrupt the funnel/analytics; (2) fail-loud/trust — the system must never silently decide the user has been rejected. **"Ghosted" stays a MANUAL terminal outcome** the user sets when they actually give up (the stage already exists, seeded in `seed-lookups.ts`). This satisfies DASH-03's two halves: "first-class stage" (Ghosted exists) + "auto-flagged as gone quiet" (the derived overlay). ⚠️ Confirm during planning.
- **D5-07: Analytics (DASH-06) — keep it BASIC per the roadmap; recharts behind a package-legitimacy checkpoint.**
  - **Funnel = distinct-application "ever reached stage" counts** derived from the append-only status-event history: for each application, the furthest stage it ever reached (a stage counts as reached if a status event for it — or any later stage — exists), using the canonical stage order Saved < Applied < Screen < Interview < Offer. Render as a recharts funnel/bar chart. This is the natural event-sourced funnel and matches "a simple funnel."
  - **Summary metrics** beyond the existing Phase 2 KPI row, kept minimal: total applications, response rate (reached Screen+ ÷ applied), active vs closed, and outcome breakdown (offers / rejections / ghosted). Do NOT build time-to-response or self-serve slicing (ANLYT-01/02/03 — deferred).
  - **recharts** is a NEW dependency (not yet installed) — install behind a **package-legitimacy checkpoint** (mirror Phase 3's googleapis/mailparser publisher+version vetting; gate=blocking-human) before adding it.
  - Time range: all-time (this search) for v1; date-range slicing deferred to v2.
  - Placement: a dedicated `/analytics` route in the sidebar (default — confirm during planning).
  ⚠️ Confirm during planning.

- **D5-08: Reuse the Phase 4 pure-predicate pattern for application staleness.** A new pure module (e.g. `src/lib/application-staleness.ts`) exposing the per-stage thresholds as named constants and a predicate like `isGoneQuiet(stageLabel, lastActivityAt, now)` — node-testable, no server-only/DB imports, importable from both Server Components and `"use client"` components (exactly why `src/lib/staleness.ts` was extracted in Phase 4). ⚠️ Confirm during planning.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project constraints & recommended stack
- `.claude/CLAUDE.md` — §Recharts recommendation (v3.x, React-native charting; chosen over Chart.js/visx/Tremor for a custom filterable funnel) and the package-vetting posture; §core value ("what needs me today" + "what's actually converting"). Also the "low ongoing effort / presentable demo" constraints that argue for keeping analytics basic.
- `.planning/PROJECT.md` — core value ("stays accurate without me remembering") and the two questions this phase answers: "what needs me today" and "what's working."
- `.planning/REQUIREMENTS.md` §Dashboard — DASH-01 (today view), DASH-03 (ghosted first-class + auto-flag), DASH-06 (basic analytics + funnel) full definitions; note ANLYT-01/02/03 are the deferred-to-v2 richer analytics.
- `.planning/ROADMAP.md` §Phase 5 — goal + 3 success criteria (per-stage staleness thresholds, ghosted as first-class + auto-flag, summary counts + simple funnel over accumulated transitions).

### Prior-phase context this builds on
- `.planning/phases/04-incremental-sync-automatic-scheduling/04-CONTEXT.md` + `src/lib/staleness.ts` — the pure-predicate + named-constant staleness pattern to mirror for D5-08 (this is SYNC staleness; Phase 5 adds the analogous APPLICATION staleness).
- `.planning/phases/02-manual-capture-core-pipeline-ui/02-CONTEXT.md` — the Phase 2 board/KPI read-model + contact/conversation logging (CAP-04) + change-stage action that the today-view reuses.

### Existing code to reuse / extend (real relative paths)
- `src/domain/board.ts` — `listBoardApplications` / `getPipelineSummary` (BoardApplication read model: `dateApplied`, `currentStageId/Label/IsTerminal`); the today-view + analytics extend this read layer.
- `src/domain/events.ts` — append-only status events (the funnel + "ever reached stage" source of truth).
- `src/domain/timeline.ts` — chronological per-job history (has last-transition data).
- `src/domain/contacts.ts` — `addConversation` / conversation dates (the OTHER half of the D5-01 activity clock).
- `src/domain/lookups.ts` + `src/db/seed-lookups.ts` — canonical stage order (Saved, Applied, Screen, Interview, Offer, Rejected, Ghosted, Withdrawn) and `isTerminal`/`outcomeLabel`; **Ghosted already exists** (terminal, outcomeLabel "Ghosted").
- `src/app/page.tsx` (current pipeline board home — moves to `/board` per D5-04), `src/app/layout.tsx` (sidebar nav — add today/board/analytics links), `src/app/job/[id]/actions.ts` (change-stage + conversation actions reused inline per D5-05).
- `src/lib/staleness.ts` — the pattern template for `src/lib/application-staleness.ts` (D5-08).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Event-sourced transition history** already accumulates every stage change (Phase 1) — the funnel and gone-quiet clock read it directly; no new capture needed.
- **Ghosted stage already seeded** (`seed-lookups.ts`) — DASH-03's "first-class stage" is structurally done; only the derived auto-flag (D5-06) is new.
- **Contact/conversation logging (CAP-04)** and **change-stage action** already exist — the today-view's inline actions (D5-05) are wiring, not new domain logic.
- **Pure-predicate staleness pattern** (`src/lib/staleness.ts`) is the proven template for node-testable, client+server-safe threshold logic (D5-08).

### Established Patterns
- Server-only DB access, `node:sqlite` + Drizzle (Node ≥ 24), Zod-validate before writes, event-sourced (never overwrite/auto-write a terminal status), free text rendered escaped, demo/real separation. Recharts is a **client** chart lib — keep the data query server-side and pass plain serializable data to a `"use client"` chart component.
- Package-legitimacy checkpoint (Phase 3 precedent) before installing recharts.

### Integration Points
- New today-view read model + `/` route (board → `/board`); new `/analytics` route.
- New `src/lib/application-staleness.ts` (derived gone-quiet predicate) feeding both the today-view and the board's card badges.
- recharts chart component fed by a server-side funnel/summary query over `events.ts`.

</code_context>

<specifics>
## Specific Ideas

- "Standard" threshold profile is a firm user choice (D5-02): Applied 14 / Screen 10 / Interview 10 / Saved 7-day nudge; terminals never flagged.
- Today-view as the new home at `/` with the board demoted to `/board` (D5-04) is a firm user choice.
- Inline actions = log-follow-up + change-stage + click-through; explicitly NO snooze (D5-05).

</specifics>

<deferred>
## Deferred Ideas

- **Snooze / dismiss** a today-view item (hide for N days) — considered under D5-05, excluded to avoid a new state store. Revisit if the today-view proves naggy.
- **Configurable thresholds** (settings-table override instead of named constants) — v2; constants are fine for a single user.
- **Richer analytics** — conversion rates over time, response-time metrics, self-serve date/dimension slicing (ANLYT-01/02/03) — deferred to v2.
- **999.1 UI-polish backlog** (adaptive board columns, per-stage colors, collapsible sidebar, card density, editable title, sort/filter) — separate backlog, not this phase.

</deferred>

---

*Phase: 5-Analytics & Dashboard Completion*
*Context gathered: 2026-08-03*
