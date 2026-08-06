# Phase 5: Analytics & Dashboard Completion - Research

**Researched:** 2026-08-03
**Domain:** Read-model aggregation over an existing event-sourced SQLite schema (Next.js App Router Server Components), a new client-side charting dependency (recharts v3 via shadcn), and a pure derived-staleness predicate.
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D5-01**: The activity clock = the most recent of {last status transition, last logged conversation/contact}. "Gone quiet" means nothing has happened on an application in a while, judged against BOTH a stage change and a logged recruiter exchange (even when the stage didn't move).
- **D5-02**: Per-stage silence thresholds (the "Standard" profile), encoded as named constants (mirroring the Phase 4 `src/lib/staleness.ts` pure-predicate pattern):
  - Applied → 14 days, Screen → 10 days, Interview → 10 days of no activity ⇒ gone quiet.
  - Saved (not applied) → 7 days is a *separate* "you haven't applied yet" nudge, NOT "gone quiet" (different category in the today-view).
  - Terminal stages (Offer, Rejected, Ghosted, Withdrawn) are never flagged — they're closed.
  - Thresholds are per-stage, "each judged against its own appropriate threshold rather than one universal timer" (ROADMAP DASH-01 success criterion).
- **D5-04**: The today-view becomes the new landing page at `/`; the existing pipeline board moves to `/board` (linked in the sidebar). This is a routing change to the Phase 2 board (currently at `/`).
- **D5-05**: Each today-view item supports two inline actions plus a click-through to job detail: Log a follow-up/conversation inline (reuses CAP-04, resets the D5-01 clock); Change stage inline (reuses the existing change-stage action); click-through to job detail for everything else. NO snooze/dismiss (deliberately excluded — no new snooze-until state store).

### Claude's Discretion — DEFAULTS set for the two areas not deep-dived (CONFIRM during planning)

- **D5-06**: "Gone quiet" is a DERIVED, non-destructive read-time overlay — NEVER an auto-written status event. The application stays in its real current stage and gets a ⚠ "gone quiet" badge + appears in the today-view. The system NEVER auto-writes a terminal "Ghosted" event (event-sourcing integrity + fail-loud/trust). "Ghosted" stays a MANUAL terminal outcome the user sets when they actually give up (stage already exists, seeded in `seed-lookups.ts`).
- **D5-07**: Analytics (DASH-06) — keep it BASIC per the roadmap; recharts behind a package-legitimacy checkpoint.
  - Funnel = distinct-application "ever reached stage" counts from the append-only status-event history: for each application, the furthest stage it ever reached (a stage counts as reached if a status event for it — or any later stage — exists), canonical order Saved < Applied < Screen < Interview < Offer. Render as a recharts funnel/bar chart.
  - Summary metrics beyond the existing Phase 2 KPI row, kept minimal: total applications, response rate (reached Screen+ ÷ applied), active vs closed, outcome breakdown (offers/rejections/ghosted). Do NOT build time-to-response or self-serve slicing (ANLYT-01/02/03 — deferred).
  - recharts is a NEW dependency — install behind a package-legitimacy checkpoint (gate=blocking-human), mirroring Phase 3's googleapis/mailparser vetting.
  - Time range: all-time only for v1; date-range slicing deferred to v2.
  - Placement: a dedicated `/analytics` route in the sidebar (default — confirm during planning).
- **D5-08**: Reuse the Phase 4 pure-predicate pattern for application staleness. A new pure module (e.g. `src/lib/application-staleness.ts`) exposing per-stage thresholds as named constants and a predicate like `isGoneQuiet(stageLabel, lastActivityAt, now)` — node-testable, no server-only/DB imports, importable from both Server Components and `"use client"` components.

### Deferred Ideas (OUT OF SCOPE)

- Snooze/dismiss a today-view item (hide for N days) — excluded to avoid a new state store. Revisit if the today-view proves naggy.
- Configurable thresholds (settings-table override instead of named constants) — v2; constants are fine for a single user.
- Richer analytics — conversion rates over time, response-time metrics, self-serve date/dimension slicing (ANLYT-01/02/03) — deferred to v2.
- 999.1 UI-polish backlog (adaptive board columns, per-stage colors, collapsible sidebar, card density, editable title, sort/filter) — separate backlog, not this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | A "what needs me today" view surfaces overdue follow-ups, threads gone quiet, and applications awaiting my reply, each judged against its own appropriate staleness threshold | `src/lib/application-staleness.ts` pure predicate design (per-stage `Record<string, number>` threshold map, mirroring `isSyncStale`); new `src/domain/today.ts` read model composing `listBoardApplications` + `currentStageSince` + a new latest-conversation-per-application aggregate — see Architecture Patterns §1–2 |
| DASH-03 | "No response/ghosted" is a first-class stage, and an application is auto-flagged as gone quiet after its stage-appropriate silence threshold | Ghosted already seeded (`src/db/seed-lookups.ts:30`, terminal, `outcomeLabel: "Ghosted"`) — structurally done. The "auto-flagged" half is the same `application-staleness.ts` predicate as DASH-01, gated to exclude `isTerminal` stages — see Common Pitfalls §1 |
| DASH-06 | Basic analytics ship — summary counts and a simple funnel chart over the accumulated transition-event history | New `src/domain/analytics.ts` computing furthest-reached-stage counts and summary metrics by scanning `statusEvents` in TypeScript (NOT SQL `GROUP BY` — see Architecture Patterns §3), rendered via the shadcn `chart` block wrapping a recharts horizontal `BarChart` — see Code Examples |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stack is locked**: Next.js App Router (Server Components for reads, Server Actions for writes), `better-sqlite3`/Drizzle equivalent (this codebase actually uses `node:sqlite` + `drizzle-orm/node-sqlite`, not `better-sqlite3` — verified against `src/db/client.ts` imports), Zod validation at every write boundary, `recharts` v3.x for charting (explicitly named as the CLAUDE.md-recommended library, chosen over Chart.js/Tremor/visx).
- **Fail-loud reliability constraint**: a silently missed/incorrect signal is treated as a project-ending failure mode. Applies here as: the gone-quiet computation must never silently exclude an application it should flag, and must never silently auto-write a status event.
- **No second backend framework** — all reads go through `src/domain/*`, all writes through Server Actions (`src/app/actions.ts` / `src/app/job/[id]/actions.ts`). This phase must not introduce an API route.
- **Package-legitimacy checkpoint required before any new npm install** (explicit precedent: Phase 3's `googleapis`/`mailparser`/`html-to-text` vetting, `gate=blocking-human`). Applies to `recharts` this phase (see Package Legitimacy Audit).
- **Privacy**: email content and extracted data stay local — no third-party services. Analytics/today-view are pure local reads; no new network calls are introduced by this phase besides the one-time `npx shadcn add chart progress` (dev-time only, not runtime).

## Summary

Phase 5 is a **pure read-model + presentation phase** — every piece of underlying data it needs (status-event history, conversations, the Ghosted stage) already exists and has existed since Phase 1/2. Nothing in `src/db/schema.ts` needs to change. The work is: (1) a new pure predicate module for "gone quiet"/"saved nudge" staleness, mirroring the exact pattern already proven in `src/lib/staleness.ts` (Phase 4's sync-staleness predicate); (2) two new domain read-model modules — one composing the Today view's flagged-application list, one computing the funnel/summary analytics — both of which must follow this codebase's established convention of aggregating in TypeScript rather than SQL `GROUP BY` (see Architecture Patterns §3, a **hard constraint** discovered directly in `src/domain/board.ts`'s code comments, not a stylistic preference); (3) a route restructure moving the pipeline board from `/` to `/board` and introducing `/` (Today) and `/analytics` as real pages, activating two already-reserved-but-inert nav-shell slots; (4) a brand-new client-side dependency, `recharts` v3.10.1 (confirmed on npm registry, 10+ years old, 54.8M weekly downloads, official `recharts/recharts` GitHub repo), installed via the shadcn `chart` block behind the mandatory package-legitimacy checkpoint.

The two "confirm during planning" defaults (D5-06 derived-overlay gone-quiet, D5-07 basic recharts funnel) are both directly supported by the existing schema and require no new columns — `applications.currentStageId`/`currentStageSince` already track "current, non-overwritten stage" exactly as D5-06 requires, and `statusEvents` already contains every event needed for D5-07's "ever reached stage" funnel definition.

**Primary recommendation:** Build two new domain modules (`src/domain/today.ts`, `src/domain/analytics.ts`) plus one new pure-lib module (`src/lib/application-staleness.ts`), extend `BoardApplication`/add a `contacts.ts` aggregate for `currentStageSince` + latest-conversation-date, move `src/app/page.tsx` → `src/app/board/page.tsx`, write a new Today-view `src/app/page.tsx`, add `src/app/analytics/page.tsx`, and wire the shadcn `chart` block (recharts, package-legitimacy-gated) into a horizontal `BarChart` for the funnel — all following patterns already proven in Phases 2–4 of this exact codebase.

## Architectural Responsibility Map

This project has no separate API/backend tier — Next.js Server Components read directly from `src/domain/*`, and Server Actions (`src/app/actions.ts` et al.) are the mutation tier. The map below adapts the standard 5-tier model to that reality.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Gone-quiet / saved-nudge staleness predicate | API/Backend (`src/lib/`, pure) | — | Pure business logic over already-fetched timestamps; must be importable from both a Server Component (Today view, board) and any future client component with zero DB/server-only imports — exact precedent: `src/lib/staleness.ts` (D4-03) |
| Today-view read aggregation | Frontend Server (SSR, `src/app/page.tsx`) | API/Backend (`src/domain/today.ts`) | Server Component calls domain-layer read functions synchronously at request time — same shape as the existing `src/app/page.tsx`'s `readPipelineData()` |
| Funnel / summary analytics computation | API/Backend (`src/domain/analytics.ts`) | Frontend Server (SSR, `src/app/analytics/page.tsx`) | Domain-owns-SQL invariant — aggregation over `statusEvents` belongs in `src/domain`; the page component only formats/serializes the result for the client chart |
| Funnel chart rendering | Browser/Client (`"use client"`) | — | Recharts requires client-side JS for interactivity/tooltips; only pre-computed plain serializable data (numbers/strings) crosses the server→client boundary, never the DB handle |
| Inline "Log a follow-up" / "Change stage" actions from Today view | API/Backend (Server Actions) | Browser/Client (dialog UI) | Reuses the existing `changeStageAction` (`src/app/actions.ts`) and `logConversationAction` (`src/app/job/[id]/actions.ts`) mutation tier verbatim — zero new backend logic |
| Nav routing (Today at `/`, Pipeline at `/board`, Analytics at `/analytics`) | Frontend Server (SSR routing) | Browser/Client (active-link styling) | Next.js App Router file-based routing is server-resolved; `nav-shell.tsx`'s active-state highlighting uses `usePathname()` client-side |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `recharts` | 3.10.1 [VERIFIED: npm registry — `npm view recharts version`, published 2026-07-25] | Charting library for the funnel bar chart | CLAUDE.md-mandated (see Alternatives Considered in that doc); official `recharts/recharts` GitHub repo, 54.8M weekly downloads, package first published 2015-08-07 (10+ years) [VERIFIED: npm registry — `npm view recharts time.created`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn `chart` block | current (official shadcn registry, not third-party) | `ChartContainer`/`ChartConfig`/`ChartTooltip` theming wrapper around recharts | Installed via `npx shadcn add chart` — pulls in `recharts` as a transitive dependency; this is the mechanism by which `recharts` enters `package.json` [CITED: ui.shadcn.com/docs/components/base/chart] |
| shadcn `progress` block | current (official shadcn registry) | Optional response-rate visual bar on the analytics summary row | UI-SPEC marks this optional — "use only if the planner wants a visual beyond the bare numeral" |

### Alternatives Considered

Already resolved by CLAUDE.md and D5-07 — no re-litigation needed. CLAUDE.md's own Alternatives Considered table (Recharts vs Tremor vs visx) applies verbatim; this phase adds no new alternatives analysis.

**Installation:**
```bash
npx shadcn add chart progress
# installs recharts (+ its own deps: clsx, immer, reselect, es-toolkit,
# eventemitter3, tiny-invariant, victory-vendor, decimal.js-light,
# use-sync-external-store — react-redux/@reduxjs/toolkit are peer-optional,
# not required for basic Bar/BarChart usage) as a new package.json dependency
```

**Version verification:** `npm view recharts version` → `3.10.1`, `npm view recharts peerDependencies` → `react`/`react-dom` `^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0` [VERIFIED: npm registry] — compatible with this project's installed `react@19.2.8`/`react-dom@19.2.8`.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `recharts` | npm | 10+ years (created 2015-08-07) | 54.8M/week | `github.com/recharts/recharts` | Automated seam verdict: **SUS** (`"too-new"` signal) — see note below | **Approved**, standard blocking-human checkpoint still required per D5-07 |

**Note on the automated `SUS` verdict:** `gsd-tools query package-legitimacy check --ecosystem npm recharts` returned `SUS` with reason `"too-new"`. Manual verification shows this is a **false-positive pattern in the heuristic itself**: the signal is keyed off the *latest published version's* timestamp (`v3.10.1` published 2026-07-25 — a normal, recent minor/patch release), not the package's actual age. `npm view recharts time.created` returns `2015-08-07T07:04:41.432Z` (10+ years), weekly downloads are 54.8M, the repo resolves to the official `recharts/recharts` GitHub org, `deprecated: false`, and there is no `postinstall` script (`npm view recharts scripts.postinstall` → empty) [VERIFIED: npm registry]. This is one of the most widely-used React charting libraries and is explicitly named in this project's own CLAUDE.md stack recommendation — it is not a supply-chain risk. The planner must still insert the **blocking-human checkpoint task** before `npx shadcn add chart` per D5-07's explicit instruction (this is a project policy gate independent of the automated verdict, not conditioned on the seam's output), but should note in that checkpoint's description that the `SUS`/`"too-new"` signal is a known heuristic false-positive on this package, so the human reviewer isn't misled into treating it as a real red flag.

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `recharts` — flagged by the automated heuristic on a stale-latest-version-date signal, not a genuine legitimacy concern (see note above). Checkpoint still required per project policy (D5-07), not because of the verdict.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser                                                          │
│                                                                    │
│  Today view (/)          Analytics (/analytics)   Board (/board)  │
│  ┌──────────────┐        ┌──────────────────┐     ┌────────────┐ │
│  │ Section A:   │        │ KpiRow-style      │     │ (existing, │ │
│  │ Needs a      │        │ summary tiles     │     │  moved     │ │
│  │ follow-up    │        │ (Server Component)│     │  verbatim) │ │
│  │              │        ├──────────────────┤     └────────────┘ │
│  │ Section B:   │        │ "use client"      │                    │
│  │ Not yet      │        │ FunnelChart       │◄── plain numbers   │
│  │ applied      │        │ (ChartContainer   │    only, no DB     │
│  │              │        │  + recharts       │    handle crosses  │
│  │ [Log follow- │        │  BarChart)        │    this boundary   │
│  │  up] [Change │        └──────────────────┘                    │
│  │  stage]      │                                                 │
│  └──────┬───────┘                                                 │
└─────────┼──────────────────────────────────────────────────────── │
          │ Server Action (existing, reused verbatim)                │
          ▼                                                          │
┌─────────────────────────────────────────────────────────────────┐
│ Next.js Server (Server Components + Server Actions, same process) │
│                                                                    │
│  src/app/page.tsx (NEW — Today)      src/app/analytics/page.tsx   │
│         │                                      │ (NEW)             │
│         ▼                                      ▼                  │
│  src/domain/today.ts (NEW)          src/domain/analytics.ts (NEW) │
│    - listBoardApplications()          - reads statusEvents joined │
│      (extended w/ currentStageSince)    to stages                 │
│    - NEW: latest-conversation-per-      - TypeScript reduction:   │
│      application aggregate              furthest-reached-stage    │
│      (src/domain/contacts.ts)           per application (NOT SQL  │
│    - src/lib/application-staleness.ts   GROUP BY — see Pattern 3) │
│      (NEW, pure predicate)                                        │
│         │                                                          │
│  changeStageAction / logConversationAction (EXISTING, reused)     │
└─────────┼──────────────────────────────────────────────────────── │
          ▼                                                          │
┌─────────────────────────────────────────────────────────────────┐
│ SQLite (node:sqlite + Drizzle) — applications, statusEvents,      │
│ conversations, contacts, stages — ALL PRE-EXISTING, no schema     │
│ changes this phase                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── app/
│   ├── page.tsx              # REPLACED: was Pipeline board, becomes Today view (D5-04)
│   ├── board/
│   │   └── page.tsx           # NEW: Pipeline board moved here verbatim (same JSX, new file)
│   ├── analytics/
│   │   └── page.tsx           # NEW: DASH-06 summary + funnel chart
│   └── actions.ts             # UNCHANGED — changeStageAction reused verbatim
│   └── job/[id]/actions.ts    # UNCHANGED — logConversationAction reused verbatim
├── domain/
│   ├── today.ts                # NEW: Today-view read model (flagged sections A/B)
│   ├── analytics.ts            # NEW: funnel + summary metrics
│   ├── board.ts                # EXTENDED: BoardApplication gains currentStageSince
│   └── contacts.ts             # EXTENDED: new latest-conversation-per-application aggregate
├── lib/
│   ├── staleness.ts            # UNCHANGED (Phase 4 sync staleness — do not confuse/merge)
│   └── application-staleness.ts # NEW (D5-08) — application gone-quiet/saved-nudge predicate
└── components/
    ├── ui/
    │   ├── chart.tsx           # NEW (shadcn `chart` block)
    │   └── progress.tsx        # NEW, optional (shadcn `progress` block)
    ├── today-list.tsx          # NEW — Section A/B row rendering
    ├── funnel-chart.tsx         # NEW — "use client" recharts wrapper
    └── application-card.tsx    # EXTENDED — gone-quiet badge overlay (Surface 3)
```

### Pattern 1: Pure staleness predicate mirroring `src/lib/staleness.ts`

**What:** A DB-free, server/client-safe module exposing named threshold constants and a pure function.
**When to use:** Any "is X stale/overdue" computation that both a Server Component and a `"use client"` component need (D5-08 explicitly requires this shape).
**Example — the exact template already proven in this codebase:**
```typescript
// src/lib/staleness.ts (EXISTING — Phase 4, the template to mirror)
export const STALE_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // D4-A2

export function isSyncStale(
  lastSuccessAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!lastSuccessAt) return false;
  return now.getTime() - lastSuccessAt.getTime() > STALE_THRESHOLD_MS;
}
```
The new `src/lib/application-staleness.ts` should follow this exact shape but with a **per-stage** threshold map (D5-02) instead of a single constant, plus a days-since accessor (the UI-SPEC badge copy is `"Gone quiet · {N} days"`, which needs a numeric days value, not just a boolean):

```typescript
// src/lib/application-staleness.ts (NEW, D5-08)
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const GONE_QUIET_THRESHOLDS_DAYS: Record<string, number> = {
  Applied: 14,
  Screen: 10,
  Interview: 10,
};
export const SAVED_NUDGE_THRESHOLD_DAYS = 7;

export type StalenessStatus =
  | { kind: "gone-quiet"; daysSince: number }
  | { kind: "saved-nudge"; daysSince: number }
  | { kind: "none" };

/**
 * `stageLabel` and `isTerminal` come from the same stages join every other
 * read model already uses (src/domain/board.ts `currentStageLabel` /
 * `currentStageIsTerminal`). `lastActivityAt` is the D5-01 clock —
 * max(currentStageSince, latest conversation date) — computed by the
 * caller (src/domain/today.ts), NOT inside this pure module.
 */
export function getStalenessStatus(
  stageLabel: string | null,
  isTerminal: boolean | null,
  lastActivityAt: Date | null,
  now: Date = new Date(),
): StalenessStatus {
  if (!stageLabel || isTerminal) return { kind: "none" };

  if (stageLabel === "Saved") {
    if (!lastActivityAt) return { kind: "none" };
    const daysSince = Math.floor((now.getTime() - lastActivityAt.getTime()) / MS_PER_DAY);
    return daysSince >= SAVED_NUDGE_THRESHOLD_DAYS
      ? { kind: "saved-nudge", daysSince }
      : { kind: "none" };
  }

  const threshold = GONE_QUIET_THRESHOLDS_DAYS[stageLabel];
  if (threshold === undefined || !lastActivityAt) return { kind: "none" };

  const daysSince = Math.floor((now.getTime() - lastActivityAt.getTime()) / MS_PER_DAY);
  return daysSince >= threshold
    ? { kind: "gone-quiet", daysSince }
    : { kind: "none" };
}
```

### Pattern 2: `currentStageSince` is already the "last status transition" half of the D5-01 clock

**What:** `applications.currentStageSince` (schema.ts:89) is written by `recomputeCurrentStage` (`src/domain/projections.ts:31-38`) to the `occurredAt` of the most recent `statusEvents` row for that application — this IS "last status transition," already maintained, zero new queries needed for that half of the clock.
**When to use:** Computing the D5-01 activity clock's first input. Extend `BoardApplication` (`src/domain/board.ts`) to select `applications.currentStageSince` (it is currently NOT selected — see Common Pitfalls §2) rather than re-deriving it from `statusEvents`.
**Example:**
```typescript
// src/domain/board.ts — EXTEND the existing select (mirrors the precedent
// set by the 02-05 decision log entry: "Extended BoardApplication with
// companyId/roleTypeId/sourceId/postingUrl... avoiding a second per-card fetch")
.select({
  // ...existing fields...
  currentStageSince: applications.currentStageSince, // ADD
})
```

### Pattern 3: TypeScript-side aggregation, NOT SQL `GROUP BY` — a hard codebase constraint

**What:** Every aggregate computation in this codebase (KPI counts, and now the funnel + gone-quiet-per-application scan) is derived by fetching a flat row set and reducing it in TypeScript, never via a SQL `GROUP BY`/`COUNT`/`MAX` aggregate query.
**When to use:** Both new domain modules this phase (`analytics.ts`'s funnel/summary counts, and the new latest-conversation-per-application lookup in `contacts.ts`).
**Why this is a hard constraint, not a style preference** [VERIFIED: `src/domain/board.ts:63-66`, direct codebase read]:
```typescript
// src/domain/board.ts — the EXISTING, load-bearing precedent comment:
/**
 * Derived entirely from `listBoardApplications()` in TypeScript (D2-07:
 * "derived from the board read model, not stored") — deliberately avoids a
 * second grouped-aggregate SQL query against the unverified
 * drizzle-orm 1.0.0-rc.4 group-by/count surface.
 */
export function getPipelineSummary(db: NodeSQLiteDatabase): PipelineSummary { ... }
```
A repo-wide grep for `groupBy|MAX(|\.max(` across `src/` returns **zero** matches outside `zod`'s own `.max()` validator calls — every existing aggregate (KPI counts, dead-letter/review counts, sync-run stats) is computed by fetching rows and reducing/counting in TypeScript. `drizzle-orm` is pinned at `1.0.0-rc.4` (a release candidate) in this project [VERIFIED: `package.json`], and the codebase has explicitly and consistently avoided its `GROUP BY` surface. The planner must follow this same pattern for both the funnel counts and the summary metrics — do not introduce the first `GROUP BY` query in this codebase without first re-verifying `drizzle-orm@1.0.0-rc.4`'s SQLite group-by support (out of scope for "basic" analytics; the TS-reduction approach is proven and sufficient at this project's data volume — single user, low hundreds of rows at most).

**Example — funnel computation:**
```typescript
// src/domain/analytics.ts (NEW)
import { asc, eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { applications, statusEvents, stages } from "@/db/schema";

// D5-07's explicit canonical funnel order — a fixed subset of the full
// 8-stage vocabulary (excludes Rejected/Ghosted/Withdrawn, which are
// terminal OUTCOMES, not funnel steps).
const FUNNEL_STAGE_ORDER = ["Saved", "Applied", "Screen", "Interview", "Offer"] as const;

export interface FunnelBucket {
  stageLabel: (typeof FUNNEL_STAGE_ORDER)[number];
  count: number;
}

export function getFunnelCounts(db: NodeSQLiteDatabase): FunnelBucket[] {
  const rows = db
    .select({
      applicationId: statusEvents.applicationId,
      stageLabel: stages.label,
    })
    .from(statusEvents)
    .innerJoin(stages, eq(statusEvents.stageId, stages.id))
    .orderBy(asc(statusEvents.applicationId))
    .all();

  // For each application, the highest FUNNEL_STAGE_ORDER index it ever
  // reached (rows for Rejected/Ghosted/Withdrawn events are simply not in
  // FUNNEL_STAGE_ORDER and contribute nothing — they don't need excluding,
  // .indexOf returns -1 and is skipped).
  const furthestRankByApplication = new Map<number, number>();
  for (const row of rows) {
    const rank = FUNNEL_STAGE_ORDER.indexOf(row.stageLabel as (typeof FUNNEL_STAGE_ORDER)[number]);
    if (rank === -1) continue;
    const current = furthestRankByApplication.get(row.applicationId) ?? -1;
    if (rank > current) furthestRankByApplication.set(row.applicationId, rank);
  }

  return FUNNEL_STAGE_ORDER.map((stageLabel, rank) => ({
    stageLabel,
    count: [...furthestRankByApplication.values()].filter((r) => r >= rank).length,
  }));
}
```

### Pattern 4: recharts `"use client"` boundary — pass only plain serializable data

**What:** Recharts components require `"use client"` and cannot run in a Server Component. The Server Component computes the funnel data and passes it as a plain prop.
**When to use:** `src/app/analytics/page.tsx` (Server Component) → `src/components/funnel-chart.tsx` (`"use client"`).
**Example** [CITED: ui.shadcn.com/docs/components/base/chart; standard recharts `layout="vertical"` horizontal-bar convention]:
```typescript
// src/components/funnel-chart.tsx
"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

interface FunnelChartProps {
  data: Array<{ stageLabel: string; count: number }>;
}

const chartConfig = {
  count: { label: "Applications", color: "#2563eb" }, // Accent — UI-SPEC's one chart-fill exception
} satisfies ChartConfig;

export function FunnelChart({ data }: FunnelChartProps) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[240px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="stageLabel" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
```
```typescript
// src/app/analytics/page.tsx (Server Component)
import { getFunnelCounts } from "@/domain/analytics";
import { FunnelChart } from "@/components/funnel-chart";
// ...
const funnel = getFunnelCounts(db); // plain array of {stageLabel, count} — safe to pass as a prop
```

### Anti-Patterns to Avoid

- **A SQL `GROUP BY`/`COUNT(*)` query for the funnel or summary metrics:** breaks the established codebase convention (Pattern 3) and re-introduces the exact "unverified drizzle-orm 1.0.0-rc.4 group-by surface" risk `board.ts` was explicitly written to avoid.
- **Auto-writing a `Ghosted` status event from the staleness predicate:** explicitly forbidden by D5-06 — "gone quiet" is read-time-derived only; the *only* writer of a terminal status event is the user via the existing `changeStageAction`.
- **Recomputing "last status transition" from `statusEvents` inside the Today-view read model:** `applications.currentStageSince` already holds this value (Pattern 2) — querying `statusEvents` again duplicates `recomputeCurrentStage`'s work for no reason.
- **A native recharts `<Funnel>` shape:** UI-SPEC explicitly calls for a horizontal `BarChart` with monotonically non-increasing bars, not recharts' dedicated (and heavier) `Funnel`/`FunnelChart` component — "This is the natural event-sourced funnel and matches 'a simple funnel.'"

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Funnel/bar chart rendering (axes, tooltips, responsive sizing) | A custom SVG funnel component | shadcn `chart` block (`ChartContainer`/`ChartTooltip`) + recharts `BarChart` | Recharts already handles responsive sizing, accessible tooltips, and axis rendering; a hand-rolled SVG funnel would need to reinvent all of that for a "basic" analytics scope that explicitly does not need custom visuals |
| Days-since-date arithmetic across a per-stage threshold map | A one-off `Date` diff scattered across today-view and board-card components | The single `src/lib/application-staleness.ts` pure predicate | Two independent hand-rolled diff implementations (today-view + board badge) are exactly the kind of duplicated-logic drift D5-08 exists to prevent — one module, imported everywhere |

**Key insight:** This phase's actual "hand-roll" risk is not charting (recharts solves that) but the temptation to compute staleness or funnel logic inline inside a page component instead of in the shared pure/domain modules — that duplication is what D5-08 and the domain-owns-SQL invariant both exist to prevent.

## Common Pitfalls

### Pitfall 1: Flagging a terminal stage as "gone quiet"

**What goes wrong:** A naive predicate keyed only on stage label (`Applied`/`Screen`/`Interview`) without also checking `isTerminal` could accidentally flag `Rejected`/`Offer`/`Withdrawn` if a bug elsewhere ever puts one of those labels through the same code path, or if `Ghosted` (also non-Saved, non-funnel) somehow reaches the predicate.
**Why it happens:** `stages.isTerminal` and `stageLabel` are two separate columns joined from the same table; forgetting to pass/check `isTerminal` is an easy omission.
**How to avoid:** The predicate signature MUST take `isTerminal` as an explicit parameter and short-circuit to `{ kind: "none" }` when true (see Pattern 1's example) — never infer terminality from the stage label string.
**Warning signs:** A gone-quiet badge appearing on a card whose stage badge reads "Offer" or "Rejected."

### Pitfall 2: `BoardApplication` doesn't currently expose `currentStageSince` — this WILL need extending

**What goes wrong:** The UI-SPEC assumes the board card gone-quiet overlay (Surface 3) and the Today view both have access to "how long has this application been in its current stage" — but `src/domain/board.ts`'s `BoardApplication` interface [VERIFIED: `src/domain/board.ts:5-17`, direct codebase read] does NOT currently select `currentStageSince`, only `currentStageId`/`currentStageLabel`/`currentStageIsTerminal`.
**Why it happens:** `currentStageSince` wasn't needed by any Phase 2–4 feature (the board only needed to *display* the current stage, not measure its age).
**How to avoid:** Extend the `BoardApplication` interface and its `.select()` in `listBoardApplications` to include `currentStageSince` — this exact extension pattern (adding fields to `BoardApplication` for a new feature's needs) has a direct precedent already recorded in STATE.md: *"02-05: Extended BoardApplication (board.ts) with companyId/roleTypeId/sourceId/postingUrl so the inline edit dialog can pre-fill every field... avoiding a second per-card detail fetch."*
**Warning signs:** A TypeScript error trying to read `.currentStageSince` off a `BoardApplication` row, or a plan that re-queries `statusEvents` per-application instead of extending the existing read model.

### Pitfall 3: No existing "latest conversation per application" aggregate — must be added to `contacts.ts`

**What goes wrong:** `src/domain/contacts.ts`'s existing `getConversationsForApplication` [VERIFIED: `src/domain/contacts.ts:121-137`] takes a single `applicationId` and returns that one application's conversations — there is no function that returns, across ALL applications at once, each one's most recent conversation date. The Today-view / board-badge computation needs this for every application in a single page render, not one at a time (an N+1 query per board card would be both slow and a departure from the existing one-flat-query-per-page-load pattern used by `listBoardApplications`).
**Why it happens:** No prior phase needed a cross-application aggregate on `conversations` — CAP-04 (Phase 2) only ever needed per-application/per-contact conversation lists.
**How to avoid:** Add a new function to `src/domain/contacts.ts`, e.g. `getLatestConversationDateByApplication(db): Map<number, Date>`, that selects `{applicationId, occurredAt}` from `conversations` (a single flat query, no `WHERE applicationId = ?`) and reduces it to a `Map` of max date per application in TypeScript — same Pattern 3 convention as the funnel counts.
**Warning signs:** A plan proposing a per-card/per-row database call inside a loop, or a `MAX(occurred_at) ... GROUP BY application_id` SQL query.

### Pitfall 4: Confusing `src/lib/staleness.ts` (Phase 4, sync staleness) with the new `src/lib/application-staleness.ts` (Phase 5, application staleness)

**What goes wrong:** Both modules concern "is X stale," live in the same directory, and follow the identical pure-predicate pattern — a plan or an executor could accidentally edit the wrong file, or merge the two concepts into one module.
**Why it happens:** The names are close (`staleness.ts` vs `application-staleness.ts`) and the pattern is intentionally identical by design (D5-08 explicitly says "mirror the pattern").
**How to avoid:** Treat them as two structurally similar but functionally unrelated modules — `staleness.ts` answers "is the Gmail sync stale" (a single global 2-day threshold, feeds `IngestionHealth`), `application-staleness.ts` answers "is THIS application gone quiet" (a per-stage threshold map, feeds the Today view and board card). Never import one from the other; never add application-level logic to `staleness.ts`.
**Warning signs:** A diff touching `src/lib/staleness.ts` during Phase 5 work at all — that file should have zero changes this phase.

### Pitfall 5: `lastInboundEventAt` is NOT a distinct signal from `currentStageSince` — don't build logic assuming it is

**What goes wrong:** The schema comment on `applications.lastInboundEventAt` reads "feeds Phase 5 staleness/'ghosted' computation (D-08)" [VERIFIED: `src/db/schema.ts:91`], which could be read as "this is the raw last-email-received timestamp, distinct from stage-change timestamp." It is not: `recomputeCurrentStage` (`src/domain/projections.ts:31-38`) sets BOTH `currentStageSince` AND `lastInboundEventAt` to the exact same value (`latest.occurredAt`, the most recent `statusEvents` row) on every write — there is no code path that updates one without the other, and no code path that records an inbound email that didn't also produce a stage-change event.
**Why it happens:** The column was seeded in Phase 1 with speculative Phase-5-facing intent, but the Phase 1/2 write path never differentiated "email that changed the stage" from "email that didn't" (there is no such distinct signal in this schema — an email either produces a status event or it doesn't reach `applications` at all).
**How to avoid:** Use `currentStageSince` (the unambiguous, actually-differentiated column name) for the "last status transition" half of the D5-01 clock. Either column returns the identical value today, so this is not a correctness bug — but a plan referencing `lastInboundEventAt` by name to imply "raw email activity distinct from stage changes" would be documenting a distinction that doesn't exist in the current write path.
**Warning signs:** A plan or comment claiming `lastInboundEventAt` captures something `currentStageSince` doesn't.

### Pitfall 6: `src/app/page.tsx` is a full file *replacement*, not an edit — the move must be sequenced correctly

**What goes wrong:** D5-04 requires the CURRENT `src/app/page.tsx` (Pipeline board, 161 lines) to become `src/app/board/page.tsx` verbatim, while a brand-new Today view becomes the new `src/app/page.tsx`. If a plan treats this as "edit page.tsx" it will conflate the two surfaces into one file or lose the pipeline board's existing empty-state/error-state handling in the move.
**Why it happens:** Most other Phase 5 changes are additive (new files, extended interfaces); this one is a genuine file relocation plus a full content replacement at the old path.
**How to avoid:** Sequence as two explicit steps: (1) create `src/app/board/page.tsx` with the CURRENT `src/app/page.tsx` content unchanged (`<h1>` text stays "Pipeline" per UI-SPEC — only the route changes), (2) replace `src/app/page.tsx` with the new Today-view implementation. `nav-shell.tsx`'s `pipelineActive` check (`pathname === "/"`) must simultaneously change to `pathname.startsWith("/board")`, and a new `pathname === "/"` check must drive the Today link's active state — these three changes are interdependent and should land in the same task/commit to avoid a broken intermediate state where two nav items are simultaneously active or neither is.
**Warning signs:** A plan with only one file-touch for this change, or a state where both "Today" and "Pipeline" nav links appear active at `/`.

## Code Examples

### Extending the latest-conversation-per-application aggregate (Pattern 3 applied to `contacts.ts`)
```typescript
// src/domain/contacts.ts — ADD this function alongside the existing ones
export function getLatestConversationDateByApplication(
  db: NodeSQLiteDatabase,
): Map<number, Date> {
  const rows = db
    .select({
      applicationId: conversations.applicationId,
      occurredAt: conversations.occurredAt,
    })
    .from(conversations)
    .all();

  const latestByApplication = new Map<number, Date>();
  for (const row of rows) {
    if (row.applicationId === null) continue; // nullable FK (D-01) — a
    // conversation not yet tied to a specific job doesn't feed any
    // application's activity clock.
    const current = latestByApplication.get(row.applicationId);
    if (!current || row.occurredAt.getTime() > current.getTime()) {
      latestByApplication.set(row.applicationId, row.occurredAt);
    }
  }
  return latestByApplication;
}
```

### Today-view read model composing both halves of the D5-01 clock
```typescript
// src/domain/today.ts (NEW)
import { db } from "@/db/client"; // (illustrative import path — actual call sites pass db in)
import { listBoardApplications, type BoardApplication } from "./board";
import { getLatestConversationDateByApplication } from "./contacts";
import { getStalenessStatus, type StalenessStatus } from "@/lib/application-staleness";

export interface TodayItem {
  application: BoardApplication;
  status: StalenessStatus;
}

export function getTodayItems(dbHandle: typeof db, now: Date = new Date()): TodayItem[] {
  const boardApplications = listBoardApplications(dbHandle); // extended w/ currentStageSince (Pitfall 2)
  const latestConversationByApplication = getLatestConversationDateByApplication(dbHandle);

  return boardApplications
    .map((application) => {
      const lastConversation = latestConversationByApplication.get(application.id) ?? null;
      const lastStageChange = application.currentStageSince; // may be null pre-first-event
      const lastActivityAt =
        lastConversation && lastStageChange
          ? new Date(Math.max(lastConversation.getTime(), lastStageChange.getTime()))
          : (lastConversation ?? lastStageChange);

      const status = getStalenessStatus(
        application.currentStageLabel,
        application.currentStageIsTerminal,
        lastActivityAt,
        now,
      );

      return { application, status };
    })
    .filter((item) => item.status.kind !== "none");
}
```

## State of the Art

No prior-approach-to-current-approach shift applies here — this is greenfield work on top of an already-current stack (Next.js 16.2.11, React 19.2.8, recharts 3.10.1, drizzle-orm 1.0.0-rc.4). No deprecated patterns to migrate away from.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact interface shape of `getStalenessStatus` (a single function returning a discriminated `{kind: ...}` union covering both "gone-quiet" and "saved-nudge") is the right split, vs. two separate functions (`isGoneQuiet` + `isSavedNudge`) as D5-08's own wording literally suggests ("a predicate like `isGoneQuiet(...)`") | Architecture Patterns §1, Code Examples | Low — either shape satisfies D5-08's substantive requirement (pure, node-testable, no DB imports); this is a naming/API-surface choice the planner should make explicitly, not a correctness risk |
| A2 | `Math.floor` (not `Math.round` or `Math.ceil`) is the right day-rounding rule for "days since" badge copy and threshold comparisons | Architecture Patterns §1 | Low — affects whether an application crosses a threshold a few hours earlier/later than expected; not specified by CONTEXT.md, should be confirmed during planning or left as an implementation detail with a pinned unit test (mirroring `isSyncStale`'s exact-boundary test pattern in `tests/lib/staleness.test.ts`) |
| A3 | Placing `getTodayItems`/`getFunnelCounts` in new top-level files `src/domain/today.ts` / `src/domain/analytics.ts` (rather than, e.g., extending `board.ts` further) is the right module boundary | Recommended Project Structure | Low — CONTEXT's canonical_refs doesn't name exact new file paths for these two functions (only for `src/lib/application-staleness.ts`, which IS pinned); this is a reasonable inference from the existing one-concern-per-domain-file convention (`board.ts`, `timeline.ts`, `contacts.ts`, `applications.ts` are each single-purpose), not a verified requirement |

## Open Questions (RESOLVED)

1. **Exact placement of the "Log a follow-up" trigger relative to `ContactConversationForm`'s existing UI copy**
   - What we know: UI-SPEC names the Today-view button "Log a follow-up" (D5-05/Copywriting Contract), but the existing reused dialog trigger button (`src/components/contact-conversation-form.tsx:164-166`) is currently labeled "Log Contact" [VERIFIED: direct codebase read].
   - What's unclear: whether "Log a follow-up" is a *new* trigger label wrapping the same `ContactConversationForm` component (i.e., the Today-view row renders its own button that opens the existing dialog, whose own internal "Log Contact" trigger button is never shown/used in that context), or whether the existing component's trigger label itself needs a copy change.
   - Recommendation: the Today view should render its OWN trigger button labeled "Log a follow-up" (per UI-SPEC's accent-filled/primary-action styling for that row) that opens `ContactConversationForm`'s dialog directly (e.g. by lifting the `open`/`onOpenChange` state, or wrapping the component to accept an external trigger) — do not change `contact-conversation-form.tsx`'s own "Log Contact" label, which is still correct in its Phase 2 job-detail-page context.
   - **RESOLVED:** Adopted the recommendation — plan `05-01` (Task 3) renders a dedicated Today-view "Log a follow-up" trigger wrapping the existing `ContactConversationForm`; `contact-conversation-form.tsx`'s own "Log Contact" label is left unchanged.

2. **Whether `Progress` (shadcn block) ships this phase or is skipped**
   - What we know: UI-SPEC marks it optional ("planner's call").
   - What's unclear: nothing blocking — this is an explicit discretion point already resolved by UI-SPEC, listed here only so the planner doesn't treat it as an open research gap.
   - Recommendation: skip it for the initial plan (the bare numeral already satisfies DASH-06's "basic" bar per UI-SPEC's own note) unless the planner has a specific reason to add it.
   - **RESOLVED:** Skipped — plans `05-02`/`05-03` install and use only the `chart` block; the bare numeral satisfies DASH-06's "basic" summary per UI-SPEC.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| npm registry access | `npx shadcn add chart progress` (installs `recharts` + transitive deps) | ✓ | — | — |
| Node.js | Project runtime | ✓ | Project requires `>=24` [VERIFIED: `package.json` engines field] | — |
| `recharts` peer deps (`react`, `react-dom` `^19.0.0`) | Chart rendering | ✓ | `react@19.2.8`/`react-dom@19.2.8` already installed, satisfies recharts' `^19.0.0` peer range [VERIFIED: npm registry `peerDependencies`] | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — all dependencies for this phase are either already installed or a straightforward `npx shadcn add` away, with no network/service dependency beyond the one-time install.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 [VERIFIED: `package.json`] |
| Config file | `vitest.config.ts` — `environment: "node"`, `@` alias → `src/` [VERIFIED: direct codebase read] |
| **Test file location — NON-OBVIOUS convention** | Tests live in a **top-level `tests/` directory mirroring `src/`**, e.g. `src/lib/staleness.ts` → `tests/lib/staleness.test.ts`, `src/domain/events.ts` → `tests/domain/events.test.ts`. There are **zero** `*.test.ts` files co-located inside `src/` [VERIFIED: `find . -iname "*.test.*" -not -path "./node_modules/*"` — full result list confirms this]. New tests for `src/lib/application-staleness.ts`, `src/domain/today.ts`, and `src/domain/analytics.ts` MUST go in `tests/lib/application-staleness.test.ts`, `tests/domain/today.test.ts`, `tests/domain/analytics.test.ts` respectively — NOT next to the source files. |
| Quick run command | `npx vitest run tests/lib/application-staleness.test.ts tests/domain/today.test.ts tests/domain/analytics.test.ts` |
| Full suite command | `npm test` (= `vitest run`) |
| Shared DB fixture | `tests/helpers/db.ts` — `createTestDb()` spins up an isolated in-memory `node:sqlite` DB with all migrations applied [VERIFIED: direct codebase read]. Use this for any `src/domain/*` integration test (mirrors `tests/domain/board.test.ts`'s pattern of manually inserting `stages`/`companies`/`applications` rows, since `seedLookups` is a separate opt-in helper). |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Per-stage threshold boundary correctness (Applied 14d, Screen 10d, Interview 10d — not-stale-at-exactly-threshold, stale-just-past) | unit | `npx vitest run tests/lib/application-staleness.test.ts` | ❌ Wave 0 |
| DASH-01 | Today-view read model correctly composes both clock halves (stage-transition-only, conversation-only, both, neither) and returns the right section (A vs B vs excluded) | integration | `npx vitest run tests/domain/today.test.ts` | ❌ Wave 0 |
| DASH-03 | Ghosted (and every other terminal stage) is NEVER flagged regardless of how old `currentStageSince` is | unit | `npx vitest run tests/lib/application-staleness.test.ts` | ❌ Wave 0 |
| DASH-03 | "Gone quiet" is read-time-derived only — asserting a `getStalenessStatus`/`getTodayItems` call never writes to `statusEvents` (no `db.insert` calls in the read path) | integration | `npx vitest run tests/domain/today.test.ts` | ❌ Wave 0 |
| DASH-06 | Funnel counts are correct "ever reached stage" distinct-application counts, monotonically non-increasing, and unaffected by later Rejected/Ghosted events on an app that already reached a funnel stage | integration | `npx vitest run tests/domain/analytics.test.ts` | ❌ Wave 0 |
| DASH-06 | Summary metrics (total, response rate = reached Screen+ ÷ applied, active/closed, outcome breakdown) match hand-computed expectations against seeded fixture data | integration | `npx vitest run tests/domain/analytics.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the relevant single test file (`npx vitest run tests/lib/application-staleness.test.ts` etc.)
- **Per wave merge:** `npm test` (full suite — 25 existing test files plus new ones, all currently green per STATE.md's phase-completion history)
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/application-staleness.test.ts` — covers DASH-01/DASH-03 threshold + terminal-exclusion behavior (mirror `tests/lib/staleness.test.ts`'s exact-boundary test style)
- [ ] `tests/domain/today.test.ts` — covers DASH-01 read-model composition (new file; can reuse `tests/domain/board.test.ts`'s manual-seed helper pattern)
- [ ] `tests/domain/analytics.test.ts` — covers DASH-06 funnel + summary metrics (new file)
- Framework install: none — Vitest, `createTestDb`, and the `tests/` convention are all already in place; no new test-infrastructure setup needed, only new test files.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Single-user local app, no auth system exists or is planned (explicitly out of scope per REQUIREMENTS.md "Out of Scope: Multi-user accounts, signup, tenancy") |
| V3 Session Management | No | Same as above — no session/auth layer in this project |
| V4 Access Control | No | Single local user, no roles/permissions model |
| V5 Input Validation | Partial — reused only | This phase introduces no NEW Server Action input surface — `changeStageAction` and `logConversationAction` are reused verbatim, both already `zod.safeParse`-gated at their existing call sites (`src/app/actions.ts`, `src/app/job/[id]/actions.ts`). If the planner adds any new mutation (not indicated by CONTEXT — D5-05 explicitly reuses existing actions), it must follow the same `safeParse`-before-domain-write convention (Zod 4.4.3, already the project standard) |
| V6 Cryptography | No | No new secrets, tokens, or crypto operations this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Supply-chain compromise via a malicious/typosquatted npm package | Tampering | Package-legitimacy checkpoint (blocking-human gate) before `npx shadcn add chart` installs `recharts` — see Package Legitimacy Audit. This is the primary NEW attack surface this phase introduces. |
| Stored XSS via free-text fields rendered in a new surface | Tampering / Information Disclosure | Not a new risk this phase: the Today view's company/role text reuses `application-card.tsx`'s existing escaped-JSX rendering pattern (React's default text-node escaping, no `dangerouslySetInnerHTML` anywhere in this codebase), and the funnel/summary analytics render only numeric aggregates + a fixed, seed-controlled vocabulary of 5 stage labels (`Saved`/`Applied`/`Screen`/`Interview`/`Offer`) as chart axis categories — never user-supplied free text. |
| Demo/real data leakage across the `DASHBOARD_MODE` boundary | Information Disclosure | Not a new risk: `src/domain/today.ts` and `src/domain/analytics.ts` both receive the already-mode-resolved `db` handle from the single-reader `src/db/client.ts` (per the existing single-DASHBOARD_MODE-reader invariant, PROJECT.md D-13) — neither new module needs to know or check the mode itself, exactly like every other `src/domain/*` module. |

No new blocking-severity (`security_block_on: "high"`) findings — the one genuine new attack surface (a new npm dependency) is already gated by the required package-legitimacy checkpoint.

## Sources

### Primary (HIGH confidence — direct codebase reads via Read/Grep/Glob/Bash, this session)
- `src/domain/board.ts`, `src/domain/events.ts`, `src/domain/timeline.ts`, `src/domain/contacts.ts`, `src/domain/lookups.ts`, `src/domain/applications.ts`, `src/domain/projections.ts` — read models, event-append pattern, aggregate-avoidance precedent
- `src/db/schema.ts`, `src/db/seed-lookups.ts` — full schema, canonical stage vocabulary (Ghosted already seeded)
- `src/lib/staleness.ts`, `tests/lib/staleness.test.ts` — the exact pure-predicate template to mirror (D5-08)
- `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/nav-shell.tsx` — current routing, the two reserved-but-inert "Today"/"Analytics" nav slots
- `src/components/kpi-row.tsx`, `src/components/application-card.tsx`, `src/components/stage-change-dialog.tsx`, `src/components/contact-conversation-form.tsx`, `src/app/job/[id]/actions.ts`, `src/app/actions.ts` — reused UI/action patterns for D5-05
- `tests/helpers/db.ts`, `tests/domain/board.test.ts`, `tests/domain/events.test.ts` — test infrastructure and `tests/` directory convention
- `package.json`, `components.json`, `vitest.config.ts` — installed versions, shadcn config, test config
- `npm view recharts version / time.created / peerDependencies / scripts.postinstall / repository.url` — recharts registry facts (version 3.10.1, created 2015, no postinstall, official repo)
- `gsd-tools query package-legitimacy check --ecosystem npm recharts` — automated legitimacy verdict (SUS/too-new, manually cross-verified as a false positive above)

### Secondary (MEDIUM confidence — WebSearch/WebFetch, verified against an official source)
- ui.shadcn.com/docs/components/base/chart — `ChartConfig`/`ChartContainer`/`ChartTooltip` API shape, `"use client"` requirement, install command
- shadcn.io/charts/bar-chart/bar-chart-03 — horizontal bar chart via `layout="vertical"` (page's own full code sample was truncated in fetch; the `layout="vertical"` + category `YAxis` convention is standard, well-established recharts usage, cross-checked against the shadcn docs' own vertical-bar example)

### Tertiary (LOW confidence)
- None — every non-codebase claim in this document was either verified against the npm registry directly or cited against official shadcn docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — recharts version/age/downloads/peer-deps all verified directly against the npm registry this session; shadcn `chart`/`progress` blocks are official-registry, already-in-use tooling (shadcn CLI already initialized in this project)
- Architecture: HIGH — every pattern recommended (pure predicate, TS-side aggregation, domain-owns-SQL, Server/Client boundary) is a DIRECT precedent already implemented and code-commented in this exact codebase, not a general best practice pulled from training data
- Pitfalls: HIGH — all six pitfalls are grounded in specific, cited line numbers of the actual current source (not hypothetical); Pitfall 2/3/5/6 in particular were discovered by directly diffing what UI-SPEC/CONTEXT assume against what `board.ts`/`contacts.ts`/`schema.ts`/`page.tsx` actually contain today

**Research date:** 2026-08-03
**Valid until:** 30 days (stable stack, no fast-moving dependencies other than `recharts` itself, which is pinned by exact verified version at install time)
