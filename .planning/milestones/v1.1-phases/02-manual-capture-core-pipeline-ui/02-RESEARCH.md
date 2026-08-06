# Phase 2: Manual Capture + Core Pipeline UI - Research

**Researched:** 2026-07-29
**Domain:** Next.js 16 App Router UI (Tailwind v4 + shadcn/ui) driving an event-sourced Drizzle/node:sqlite domain layer
**Confidence:** MEDIUM (stack mechanics HIGH via installed-version verification; shadcn CLI v4 non-interactive setup MEDIUM — this CLI generation changed substantially and is evolving fast; domain read-model design HIGH — grounded in the actual source files)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Visual Style & App Shell (discussed with user)**
- **D2-01 — Styling stack: Tailwind CSS + shadcn/ui.** The project is currently bare Next.js with no CSS framework. shadcn/ui's copy-in, accessible components (cards, dialogs, dropdowns, tables, badges) are the fastest path to a polished, portfolio-grade look and directly serve the board, detail, and form work this phase needs. shadcn components are copied into the repo (not a heavy runtime dep) and sit on Tailwind utilities.
- **D2-02 — App shell: persistent nav shell.** A sidebar or top nav with a **Pipeline** link active now, and **labeled-but-inert slots reserved for Today and Analytics (Phase 5)**. Chosen over a bare board+detail-routes setup so later phases add views without restructuring. Do NOT build the Today/Analytics views in this phase — only reserve their place in the nav.
- **D2-03 — Aesthetic: clean minimal light theme.** Neutral, data-forward dashboard with a single accent color. Light mode only (no dark-mode toggle this phase). Optimized to read well on a screen-share as a portfolio piece.
- **D2-04 — Visible DEMO badge in the shell.** A small badge rendered when running in demo mode, driven by the existing `dashboardMode` export from `src/db/client.ts` — so demo vs real is never confused on a screen-share. Real mode shows no badge (or a neutral one). This is display-only; it must not introduce any second reader/writer of `DASHBOARD_MODE` (Phase 1 single-reader invariant — the value comes only from `dashboardMode`).

**Board Layout & Stage Changes (Claude's discretion — user accepted recommended defaults)**
- **D2-05 — Kanban-style board keyed to the locked stage vocabulary (Phase 1 D-05): `Saved → Applied → Screen → Interview → Offer`, plus terminal/branch states `Rejected`, `Ghosted`, `Withdrawn`.** Columns/groupings are read from the `stages` lookup, not hard-coded.
- **D2-06 — Stage changes via an explicit "change stage" control, NOT drag-and-drop.** Simpler, mobile-safe, and unambiguous. Every stage change **appends a dated status event** and recomputes the projection (Phase 1 D-09 / `appendStatusEvent` + `recomputeCurrentStage`) — no code path overwrites a current-stage field in place. (Drag-and-drop is a deferred nicety, not a requirement.)
- **D2-07 — Summary counts as a KPI row above the board** surfacing at minimum: applied, saved-not-applied, in progress, closed (DASH-04). Derived from the board read model, not stored.

**Add & Quick-Save Flow (Claude's discretion — user accepted recommended defaults)**
- **D2-08 — shadcn modal dialogs over the board, two flows:**
  - **Quick-save (CAP-01):** minimal dialog — paste URL + type company + role → creates an application in the `Saved` stage (one Saved status event so `currentStageId` is never null, matching the Phase 1 seed convention). Optimized for speed.
  - **Full add/edit (CAP-02):** dialog exposing every editable field (company, role title, role type, source, date applied, stage), backed by `createApplication` / a new update path and the Phase 1 Zod validation (`newApplicationInput`). Role-type and source dropdowns read from the extensible lookups (Phase 1 D-06 / D-07).

**Job Detail & Contact Logging (Claude's discretion — user accepted recommended defaults)**
- **D2-09 — Unified chronological timeline on the job detail view (DASH-05):** status transitions, conversations, and any linked messages interleaved by date into one history stream, reflecting the event-sourced model. Backed by `getApplicationDetail` plus new read models composing status events + `getContactsForApplication` + conversations.
- **D2-10 — Inline contact + conversation logging on the detail page (CAP-04):** add/link a contact and log a dated conversation without leaving the job view, using `createContact` / `linkContactToApplication` / `addConversation`. Includes a free-text paste path so a self-forwarded LinkedIn note is captured as a conversation entry (fully manual — Gmail ingestion is Phase 3). Contact fields follow Phase 1 D-02; a contact belongs to the job's company per Phase 1 D-03.

### Claude's Discretion
User scoped their involvement to the visual style & app shell area and delegated the rest. The following are Claude's to decide, guided by the defaults above and Phase 1 patterns:
- **New read models** — the board list/aggregate query, summary-count query, and the composed job-detail timeline query do NOT exist yet (Phase 1 only shipped single-record `getApplicationDetail`). Design them in the `src/domain` layer alongside existing functions; UI must not touch raw SQL.
- Component decomposition, routing structure (App Router routes for board + `/job/[id]` detail), server vs client components, form libraries, and exact shadcn component selection.
- Update/edit write path for CAP-02 (a `updateApplication` domain function, honoring event-sourcing for any stage change).
- Empty-state and loading-state treatments within each screen.

### Deferred Ideas (OUT OF SCOPE)
- **Drag-and-drop stage changes on the board** — nice-to-have interaction; explicit "change stage" control is sufficient for this phase (D2-06). Revisit as a polish item, not a requirement.
- **Dark-mode toggle** — light-only this phase (D2-03); could be added later cheaply since Tailwind/shadcn support it.
- **In-UI demo/real toggle** — deliberately NOT built; mode is a startup swap by design (Phase 1 D-13). The badge only *displays* the active mode.
- **Today / what-needs-me view, auto-ghosting, funnel/analytics** — Phase 5. Nav shell reserves their slots only.
- **Override-survives-resync (CAP-03) verification** — Phase 3, once a real parser exists to override.

**UI-SPEC.md is an additional locked contract** (design system, spacing/type/color scales, copywriting, and UI-consideration state coverage) — see canonical reference at `.planning/phases/02-manual-capture-core-pipeline-ui/02-UI-SPEC.md`. Its key numbers are repeated inline throughout this document where they affect implementation.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAP-01 | Save a job not yet applied to by pasting its URL + typing company and role | Quick-save flow (Architecture Patterns → Pattern 2), `quickSaveApplication` domain composition (Don't Hand-Roll), **schema gap: no posting-URL column exists yet** (Common Pitfalls → Pitfall 1) |
| CAP-02 | Manually add or edit any application and its fields directly | `updateApplication` domain function design (Architecture Patterns → Pattern 3), event-sourcing-safe transaction refactor (Common Pitfalls → Pitfall 2) |
| CAP-04 | Log a contact and a conversation against a job (manual entries + self-forwarded LinkedIn notes) | Existing `createContact`/`linkContactToApplication`/`addConversation` reused as-is; new `getConversationsForApplication` read helper (Architecture Patterns → Pattern 4) |
| DASH-02 | Pipeline view shows where every active application stands across all stages | `listBoardApplications` + `listStages` read models (Architecture Patterns → Pattern 1) |
| DASH-04 | Summary counts: applied, saved-not-applied, in progress, closed | `getPipelineSummary` bucket derivation (Architecture Patterns → Pattern 1, bucket-logic subsection) |
| DASH-05 | Single-job detail view shows full history — every status transition, contact, and linked message | `getJobTimeline` composed read model (Architecture Patterns → Pattern 4) — note: no separate "message" entity exists yet (see Common Pitfalls → Pitfall 1 discussion); timeline this phase interleaves status events + conversations only |
</phase_requirements>

## Summary

This phase turns a bare Next.js 16 project (no CSS framework installed yet) into a working, portfolio-grade dashboard by (1) scaffolding Tailwind CSS v4 + shadcn/ui from scratch, (2) building two new App Router routes (board + `/job/[id]` detail) as Server Components that read through the existing `src/domain/*` layer, and (3) adding four Server Actions–backed dialogs (quick-save, full add/edit, change-stage, contact/conversation logging) as Client Components. Almost none of this phase's difficulty is in the UI framework — Next.js 16 + Tailwind v4 + shadcn is mechanically well-documented (if unfamiliar due to the shadcn CLI's recent, fast-moving redesign). The real work is designing three **net-new read models** in `src/domain` (board list, pipeline summary, job-detail timeline) that compose the existing event-sourced primitives without duplicating SQL, and getting the **write paths** (`updateApplication`, a new `quickSaveApplication`) to honor the Phase 1 event-sourcing invariant (D-09: never write `currentStageId` directly) inside a single atomic transaction — which requires a small, necessary refactor of `appendStatusEvent`'s signature (see Pitfall 2).

Two blocking gaps were found by reading the actual schema and CLI docs rather than assuming: **(a) there is no column anywhere to store the pasted job-posting URL that CAP-01 explicitly asks for** — a migration is required this phase; and **(b) the shadcn CLI (now at v4.16.0) no longer accepts the `--style`/`--base-color`/`--css-variables` flags the UI-SPEC's placeholder command assumed** — the realistic non-interactive path is hand-authoring `components.json` before running `add`, not passing CLI flags.

**Primary recommendation:** Hand-write `components.json` (not a CLI preset flag) to lock in new-york/neutral/CSS-variables, add a `postingUrl` migration to `applications` before building the quick-save dialog, and route every mutation through Server Actions that call domain functions and `revalidatePath` — never fetch/write through client-side API calls for this phase's scope.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pipeline board render (columns, cards, KPI row) | Frontend Server (SSR / RSC) | — | Reads via `src/domain/board.ts` at request time; no client-side data fetching needed, no auth/session concerns (single local user) |
| Job detail + timeline render | Frontend Server (RSC) | — | Same as above; `getJobTimeline` composes existing domain reads |
| Quick-save / Add-Edit / Stage-change / Contact-log dialogs (open state, form fields) | Browser / Client | — | shadcn `Dialog`/`Select` need client-side open/close and controlled-input state; React 19 `useActionState` manages pending/error UI |
| Mutations (create/update application, append status event, create contact/conversation) | API / Backend (Server Actions) | — | `"use server"` functions calling `src/domain/*`; Server Actions ARE this app's backend tier — there is no separate Express/API-route backend (per CLAUDE.md "What NOT to Use") |
| Validation of mutation input | API / Backend | — | Zod schemas in `src/db/validation.ts`, validated inside the Server Action / domain function before any Drizzle write — never trust client input even though the client is the same trusted single user |
| Nav shell + DEMO badge | Frontend Server (chrome) + Browser (active-link state) | — | Static chrome is server-rendered; `usePathname()`-based active-tab highlighting requires a small client boundary (see Pitfall 4) |
| Data persistence | Database / Storage | — | node:sqlite via `src/db/client.ts` — untouched by this phase except one schema migration (`postingUrl` column) |
| Styling system (Tailwind v4 tokens, shadcn primitives) | Browser / Client + CDN-equivalent (bundled CSS) | — | Compiled at build time via PostCSS; no runtime server dependency |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `tailwindcss` | 4.3.3 `[VERIFIED: npm registry]` | Utility-first CSS engine | Locked by D2-01/UI-SPEC; v4 uses CSS-first config (no `tailwind.config.js` by default) |
| `@tailwindcss/postcss` | 4.3.3 `[VERIFIED: npm registry]` | PostCSS plugin that runs Tailwind v4 | Required peer for the v4 install path with Next.js (replaces the old `tailwindcss` PostCSS plugin usage) |
| `postcss` | latest (peer, already a Next.js transitive dep) | CSS transform pipeline | Next.js's own build already runs PostCSS; only `postcss.config.mjs` needs adding |
| `shadcn` (CLI, devDependency) | 4.16.0 `[VERIFIED: npm registry]` | Copies component source into the repo | Locked by D2-01/UI-SPEC (`shadcn_initialized: false`); NOT a runtime dependency — components land as owned `.tsx` files under `src/components/ui` |
| `lucide-react` | 1.27.0 `[VERIFIED: npm registry]` | Icon set | shadcn's default icon library; locked by UI-SPEC |
| `class-variance-authority` | 0.7.1 `[VERIFIED: npm registry]` | Variant-based className composition | shadcn component internals depend on this; installed automatically by `shadcn add`, listed here for awareness |
| `clsx` + `tailwind-merge` | 2.1.1 / 3.6.0 `[VERIFIED: npm registry]` | `cn()` helper (merge/dedupe Tailwind classes) | Standard shadcn `lib/utils.ts` pattern; installed automatically by `shadcn init`/`add` |
| `sonner` | 2.0.7 `[VERIFIED: npm registry]` | Toast notifications | Locked by UI-SPEC Registry Safety table (`sonner` block); used for the error-state copy on failed mutations |
| Radix UI primitives (`@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-separator`) | current (installed transitively by `shadcn add <component>`, e.g. `@radix-ui/react-dialog@1.1.23`, `@radix-ui/react-select@2.3.7`) `[VERIFIED: npm registry]` | Accessible unstyled component primitives shadcn wraps | Do not hand-install these — `shadcn add <component>` pulls the exact primitive each component needs; hand-pinning risks drift from what the copied component source expects |
| `next/font/google` (`Geist`) | bundled with `next@16.2.11` (already installed) | Sans-serif font | UI-SPEC calls for "Geist Sans, Next.js built-in default" — this is `next/font/google`'s `Geist` export, zero extra dependency; do NOT install the standalone `geist` npm package unless a variable/mono use case beyond this phase's needs shows up |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tw-animate-css` | 1.4.0 `[ASSUMED — registry-existence only, not confirmed via official shadcn v4 template docs this session]` | Tailwind v4-native replacement for the old `tailwindcss-animate` plugin | Only if a specific shadcn component's copied source imports animation utility classes (e.g. `animate-in`/`animate-out` on Dialog); check the component source shadcn actually copies before adding this — do not pre-install speculatively |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-authoring `components.json` for non-interactive shadcn setup | Running `npx shadcn@latest init` fully interactively once, by hand, during setup | Interactive init is the CLI's officially supported path and guarantees the tool's own defaults are wired correctly (e.g. any font/registry scaffolding); the tradeoff is it cannot be scripted unattended by an execution agent — recommend a `checkpoint:human-verify` if the hand-authored `components.json` approach (this doc's primary recommendation) produces any `add` failures |
| JS-side KPI bucket reduction (reduce the board list in TypeScript) | A second grouped SQL query using Drizzle's `count()`/`groupBy()` | The installed `drizzle-orm@1.0.0-rc.4` is a release candidate; this codebase has zero existing precedent for grouped-aggregate query syntax on this exact version. Reducing the already-fetched board list in TS avoids relying on an unverified aggregate API surface and keeps the "derived from the board read model, not stored" (D2-07) requirement literally true |

**Installation:**
```bash
npm install tailwindcss @tailwindcss/postcss postcss
npm install -D shadcn
# component-by-component after components.json exists (see Architecture Patterns → Pattern 0):
npx shadcn@latest add button card dialog input label select textarea badge dropdown-menu separator skeleton sonner --yes
```

**Version verification performed this session:**
```
npm view tailwindcss version          -> 4.3.3
npm view @tailwindcss/postcss version -> 4.3.3
npm view shadcn version               -> 4.16.0
npm view lucide-react version         -> 1.27.0
npm view sonner version               -> 2.0.7
npm view class-variance-authority version -> 0.7.1
npm view clsx version                 -> 2.1.1
npm view tailwind-merge version       -> 3.6.0
npm view @radix-ui/react-dialog version -> 1.1.23
npm view @radix-ui/react-select version -> 2.3.7
```
Already-installed and confirmed via `package.json`/`node --version`: Next.js 16.2.11, React 19.2.8, react-dom 19.2.8, TypeScript 7.0.2, drizzle-orm 1.0.0-rc.4, zod 4.4.3, Node v24.14.1 (`engines.node: >=24` satisfied).

## Package Legitimacy Audit

| Package | Registry | Age (latest publish) | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|----------------------|--------------|--------------|---------|-------------|
| tailwindcss | npm | 2026-07-16 (patch) | 117.5M | github.com/tailwindlabs/tailwindcss | SUS ("too-new") | **Approved (override)** — flag is a recent patch release of an extremely established package (117M weekly downloads, official Tailwind Labs repo), not a new/unknown package |
| @tailwindcss/postcss | npm | 2026-07-16 (patch) | 30.9M | github.com/tailwindlabs/tailwindcss | SUS ("too-new") | **Approved (override)** — same package family as above |
| shadcn | npm | 2026-07-27 (patch) | 7.2M | github.com/shadcn-ui/ui | SUS ("too-new") | **Approved (override)** — official shadcn/ui CLI, very high adoption, frequent releases are expected for a fast-moving CLI |
| lucide-react | npm | 2026-07-25 (patch) | 84.8M | github.com/lucide-icons/lucide | SUS ("too-new") | **Approved (override)** — icon set ships near-weekly patch releases; 84M weekly downloads |
| @radix-ui/react-dialog | npm | 2026-07-24 (patch) | 68.5M | github.com/radix-ui/primitives | SUS ("too-new") | **Approved (override)** — installed transitively by `shadcn add dialog`, not hand-picked; official Radix repo |
| @radix-ui/react-select | npm | 2026-07-24 (patch) | 56.3M | github.com/radix-ui/primitives | SUS ("too-new") | **Approved (override)** — same as above, installed transitively |
| sonner | npm | 2025-08-02 | 44.3M | github.com/emilkowalski/sonner | OK | Approved |
| geist (font pkg, NOT recommended for install) | npm | 2026-06-01 | 1.8M | github.com/vercel/geist-font | OK | Not used — `next/font/google`'s bundled `Geist` export is recommended instead (zero extra dependency) |
| tailwind-merge | npm | 2026-05-10 | 77.7M | github.com/dcastil/tailwind-merge | OK | Approved |
| class-variance-authority | npm | 2024-11-26 | 54.6M | github.com/joe-bell/cva | OK | Approved |
| clsx | npm | 2024-04-23 | 105.5M | github.com/lukeed/clsx | OK | Approved |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** tailwindcss, @tailwindcss/postcss, shadcn, lucide-react, @radix-ui/react-dialog, @radix-ui/react-select — all overridden to Approved per the reasoning above (the "too-new" heuristic fires on *any* package with a very recent publish timestamp, which for these specific packages reflects normal high-velocity release cadence on an established, high-download, official-repo package rather than a slopsquat risk). No `checkpoint:human-verify` is required for these overrides given the corroborating downloads/repo signals; the planner should still record this override rationale in its own plan notes for auditability.

*`tw-animate-css` was discovered via WebSearch/training knowledge, not an authoritative source, and is tagged `[ASSUMED]` above — gate its install behind a quick check of whatever shadcn actually copies into `src/components/ui/dialog.tsx` (do not add it speculatively).*

## Architecture Patterns

### Pattern 0: Tailwind v4 + shadcn scaffolding (do this first, non-interactively)

**What:** The shadcn CLI is now at v4.16.0 and has moved to an "opaque preset code" system (`--preset <code>`, generated via the `shadcn/create` web tool) that replaced the old, human-readable `--style`/`--base-color`/`--css-variables` flags — those flags are now **removed and error if passed** `[CITED: github.com/shadcn-ui/ui/blob/main/skills/shadcn/cli.md]`. This means the UI-SPEC's placeholder command (`npx shadcn init --preset new-york-neutral-vars`) does not correspond to any real preset code — "new-york-neutral-vars" was a descriptive placeholder, not a literal invocable value.

**The realistic non-interactive path (recommended):** hand-author `components.json` directly (its schema is fixed and documented `[CITED: ui.shadcn.com/schema.json]`), then run `shadcn add <component>` for each primitive — `add` reads an existing `components.json` and does not re-run the init wizard when one is already present. This has been the CLI's consistent behavior across major versions to date, though it has not been directly confirmed against this exact v4.16.0 release in this session — treat as `[CITED]`, not `[VERIFIED]`, and add a `checkpoint:human-verify` after the first `add` invocation in case v4.16.0 changed this.

```jsonc
// components.json — hand-authored, matches UI-SPEC's declared preset
// (new-york style, neutral base color, CSS variables: yes)
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

Tailwind v4 itself needs no `tailwind.config.js` (`"config": ""` above is deliberate — v4 is CSS-first) `[CITED: tailwindcss.com/docs/guides/nextjs]`:

```bash
npm install tailwindcss @tailwindcss/postcss postcss
```
```javascript
// postcss.config.mjs
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```
```css
/* src/app/globals.css — @import replaces the old @tailwind directives */
@import "tailwindcss";

/* shadcn's semantic tokens, mapped from UI-SPEC's declared color roles.
   IMPORTANT: UI-SPEC's "Accent" role -> shadcn's --primary variable, NOT
   shadcn's own --accent variable (see Pitfall 3). */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-destructive: var(--destructive);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-lg: var(--radius);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);            /* UI-SPEC Dominant #FFFFFF */
  --foreground: oklch(0.145 0 0);
  --secondary: #F4F4F5;                  /* UI-SPEC Secondary — zinc-100, literal */
  --secondary-foreground: oklch(0.205 0 0);
  --primary: #2563EB;                    /* UI-SPEC Accent — blue-600, drives CTA buttons */
  --primary-foreground: oklch(0.985 0 0);
  --destructive: #DC2626;                /* UI-SPEC Destructive — red-600, unused this phase */
  --muted: #F4F4F5;
  --muted-foreground: oklch(0.556 0 0);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: #2563EB;                       /* focus rings use the accent per UI-SPEC */
}
```
Then, only after `components.json` exists:
```bash
npx shadcn@latest add button card dialog input label select textarea badge dropdown-menu separator skeleton sonner --yes
```

### Recommended Project Structure
```
src/
├── app/
│   ├── layout.tsx              # root layout: imports globals.css, reads dashboardMode, renders <NavShell>
│   ├── page.tsx                # REPLACES Phase 1 liveness page — becomes the Pipeline board (server component)
│   ├── actions.ts               # Server Actions for board-level mutations (quick-save, add, stage-change)
│   ├── job/
│   │   └── [id]/
│   │       ├── page.tsx        # job detail (server component) — awaits params (Next 16 async API)
│   │       └── actions.ts       # Server Actions for edit / contact / conversation mutations
│   └── api/health/route.ts     # unchanged from Phase 1
├── components/
│   ├── ui/                     # shadcn-owned primitives (button.tsx, dialog.tsx, ...) — never hand-edit conventions
│   ├── nav-shell.tsx            # 'use client' — usePathname() active-link + DEMO badge (prop-driven, see Pitfall 4)
│   ├── kpi-row.tsx               # server — renders 4 counts from getPipelineSummary
│   ├── pipeline-board.tsx        # server — renders columns from listStages + listBoardApplications
│   ├── board-column.tsx          # server — per-stage column, empty-state aware
│   ├── application-card.tsx      # server — card body; embeds a client "change stage" trigger
│   ├── quick-save-dialog.tsx     # 'use client' — CAP-01
│   ├── application-form-dialog.tsx # 'use client' — CAP-02 (add + edit share one form shape)
│   ├── stage-change-dialog.tsx   # 'use client' — D2-06
│   ├── contact-conversation-form.tsx # 'use client' — CAP-04, includes free-text LinkedIn-note paste path
│   └── timeline.tsx               # server — renders getJobTimeline entries
├── domain/
│   ├── applications.ts           # EXISTING + extend: add updateApplication, quickSaveApplication
│   ├── events.ts                  # EXISTING + refactor: extract appendStatusEventTx(tx, ...) (Pitfall 2)
│   ├── projections.ts            # EXISTING, unchanged
│   ├── contacts.ts                # EXISTING + add: getConversationsForApplication
│   ├── companies.ts               # EXISTING, unchanged
│   ├── overrides.ts               # EXISTING, unchanged (not exercised this phase)
│   ├── lookups.ts                 # NEW — listStages, listRoleTypes, listSources
│   ├── board.ts                   # NEW — listBoardApplications, getPipelineSummary
│   └── timeline.ts                # NEW — getJobTimeline
└── db/                             # unchanged except schema.ts migration (postingUrl column, see Pitfall 1)
```

### Pattern 1: Board + KPI read models (DASH-02, DASH-04)

**What:** Two new functions in `src/domain/board.ts`, composing existing tables the same way `getApplicationDetail` already does (join to `companies`/`stages`, never raw SQL from the UI).

```typescript
// src/domain/board.ts
import { asc, eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { applications, companies, stages } from "@/db/schema";

export interface BoardApplication {
  id: number;
  companyName: string;
  roleTitle: string | null;
  dateApplied: Date | null;       // null => "saved, not applied yet" (matches seed convention)
  currentStageId: number | null;
  currentStageLabel: string | null;
  currentStageIsTerminal: boolean | null;
}

/** One flat list; the UI groups by currentStageId to render columns. */
export function listBoardApplications(db: NodeSQLiteDatabase): BoardApplication[] {
  return db
    .select({
      id: applications.id,
      companyName: companies.canonicalName,
      roleTitle: applications.roleTitle,
      dateApplied: applications.dateApplied,
      currentStageId: applications.currentStageId,
      currentStageLabel: stages.label,
      currentStageIsTerminal: stages.isTerminal,
    })
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .leftJoin(stages, eq(applications.currentStageId, stages.id))
    .all();
}

export interface PipelineSummary {
  applied: number;
  savedNotApplied: number;
  inProgress: number;
  closed: number;
}

/**
 * Derived entirely from listBoardApplications() in TypeScript (D2-07: "derived
 * from the board read model, not stored") — deliberately avoids a second
 * grouped-aggregate SQL query against an unverified drizzle-orm 1.0.0-rc.4
 * groupBy/count surface (see Standard Stack "Alternatives Considered").
 *
 * Bucket rule (interpretation of DASH-04's 4 labels against the actual
 * schema — dateApplied nullability + stages.isTerminal flag):
 *   - savedNotApplied: dateApplied is null
 *   - applied:         dateApplied is NOT null (a stable historical total —
 *                       equals inProgress + closed by construction)
 *   - inProgress:      dateApplied not null AND currentStageIsTerminal === false
 *   - closed:          currentStageIsTerminal === true (Offer/Rejected/Ghosted/Withdrawn)
 */
export function getPipelineSummary(db: NodeSQLiteDatabase): PipelineSummary {
  const rows = listBoardApplications(db);
  return rows.reduce<PipelineSummary>(
    (acc, row) => {
      if (row.dateApplied === null) {
        acc.savedNotApplied++;
      } else {
        acc.applied++;
        if (row.currentStageIsTerminal) acc.closed++;
        else acc.inProgress++;
      }
      return acc;
    },
    { applied: 0, savedNotApplied: 0, inProgress: 0, closed: 0 },
  );
}
```

```typescript
// src/domain/lookups.ts — NEW
import { asc } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { stages, roleTypes, sources } from "@/db/schema";

/** Ordered by id ASC — this preserves seed-lookups.ts's canonical D-05
 *  insertion order (Saved, Applied, Screen, Interview, Offer, Rejected,
 *  Ghosted, Withdrawn) without a separate sort-order column. */
export function listStages(db: NodeSQLiteDatabase) {
  return db.select().from(stages).orderBy(asc(stages.id)).all();
}
export function listRoleTypes(db: NodeSQLiteDatabase) {
  return db.select().from(roleTypes).where(/* isActive */).orderBy(asc(roleTypes.id)).all();
}
export function listSources(db: NodeSQLiteDatabase) {
  return db.select().from(sources).orderBy(asc(sources.id)).all();
}
```

**IMPORTANT — confirm the bucket rule with the user before/while planning.** This interpretation of "applied / saved-not-applied / in progress / closed" is `[ASSUMED]` (inferred from requirement wording + the actual schema shape, not an explicit locked decision in CONTEXT.md). It is internally consistent (applied = inProgress + closed by construction) but is one reasonable reading among a couple of plausible ones. Flag this for `/gsd-plan-phase` to either confirm as a discretion call or surface to the user.

### Pattern 2: Quick-save composition (CAP-01)

**What:** A single atomic domain function composing company resolution + application creation + the initial `Saved` status event — never three separate top-level calls from the Server Action (which would risk a company or application row existing with no stage event if any later step throws).

```typescript
// src/domain/applications.ts — new addition
import { resolveCompany, createCompany } from "./companies";
import { appendStatusEventTx } from "./events"; // see Pitfall 2 for this refactor

export const quickSaveApplicationInput = z.object({
  companyName: z.string().min(1),
  roleTitle: z.string().min(1),
  postingUrl: z.string().url().optional(), // see Pitfall 1 — requires a schema migration first
});

export function quickSaveApplication(
  db: NodeSQLiteDatabase,
  savedStageId: number, // caller resolves this once via listStages(db) and passes it in
  input: z.infer<typeof quickSaveApplicationInput>,
): number {
  const validated = quickSaveApplicationInput.parse(input);

  return db.transaction((tx) => {
    const companyId =
      resolveCompany(tx, validated.companyName) ?? createCompany(tx, validated.companyName);

    const applicationId = createApplication(tx, {
      companyId,
      roleTitle: validated.roleTitle,
      postingUrl: validated.postingUrl,
    });

    appendStatusEventTx(tx, {
      applicationId,
      stageId: savedStageId,
      occurredAt: new Date(),
    });

    return applicationId;
  });
}
```

### Pattern 3: `updateApplication` honoring event-sourcing (CAP-02)

See Common Pitfalls → Pitfall 2 for the transaction-nesting problem this pattern solves. The shape:

```typescript
export const updateApplicationInput = z.object({
  companyId: z.number().int().positive().optional(),
  roleTitle: z.string().min(1).nullable().optional(),
  roleTypeId: z.number().int().positive().nullable().optional(),
  sourceId: z.number().int().positive().nullable().optional(),
  dateApplied: z.date().nullable().optional(),
  postingUrl: z.string().url().nullable().optional(),
  stageId: z.number().int().positive().optional(), // presence triggers an appended event, never a direct column write
});

export function updateApplication(
  db: NodeSQLiteDatabase,
  applicationId: number,
  input: z.infer<typeof updateApplicationInput>,
): void {
  const validated = updateApplicationInput.parse(input);
  const { stageId, ...directFields } = validated;

  db.transaction((tx) => {
    if (Object.keys(directFields).length > 0) {
      tx.update(applications).set(directFields).where(eq(applications.id, applicationId)).run();
    }
    if (stageId !== undefined) {
      appendStatusEventTx(tx, { applicationId, stageId, occurredAt: new Date() });
    }
  });
}
```

### Pattern 4: Composed job-detail timeline (DASH-05)

```typescript
// src/domain/timeline.ts — NEW
export interface TimelineEntry {
  occurredAt: Date;
  kind: "status_event" | "conversation";
  // status_event fields
  stageLabel?: string;
  // conversation fields
  contactName?: string;
  channel?: string | null;
  notes?: string | null;
}

export function getJobTimeline(db: NodeSQLiteDatabase, applicationId: number): TimelineEntry[] {
  const events = db
    .select({ occurredAt: statusEvents.occurredAt, stageLabel: stages.label })
    .from(statusEvents)
    .leftJoin(stages, eq(statusEvents.stageId, stages.id))
    .where(eq(statusEvents.applicationId, applicationId))
    .all()
    .map((e) => ({ ...e, kind: "status_event" as const }));

  // NEW helper (add to src/domain/contacts.ts) — queries conversations.applicationId
  // directly rather than joining through a contact, since applicationId is
  // already a nullable FK on the conversations table itself.
  const conversations = getConversationsForApplication(db, applicationId)
    .map((c) => ({ ...c, kind: "conversation" as const }));

  return [...events, ...conversations].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(), // most-recent-first (recommendation, see Open Questions)
  );
}
```

`getConversationsForApplication` (add next to the existing `getConversationsForContact` in `src/domain/contacts.ts`):
```typescript
export function getConversationsForApplication(db: NodeSQLiteDatabase, applicationId: number) {
  return db
    .select({
      occurredAt: conversations.occurredAt,
      channel: conversations.channel,
      notes: conversations.notes,
      contactName: contacts.name,
    })
    .from(conversations)
    .innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(eq(conversations.applicationId, applicationId))
    .orderBy(asc(conversations.occurredAt))
    .all();
}
```

**Note on "linked message" in DASH-05's wording:** there is no separate messages/emails table yet — `statusEvents.sourceMessageId` is just a nullable string used for ingestion idempotency (Phase 3). This phase's timeline correctly interleaves only status events + conversations; "linked message" becomes populated content once Phase 3 ships real ingestion. No gap to fix here — just don't design a UI element expecting message content this phase.

### Pattern 5: Server Actions + revalidation

Every mutation is a `"use server"` function co-located near its route (`src/app/actions.ts` for board-level actions, `src/app/job/[id]/actions.ts` for detail-page actions), called directly from a `<form action={...}>` or an event handler via React 19's `useActionState` (the current replacement for the older `react-dom`-only `useFormState` naming) `[CITED: nextjs.org/docs/app/guides/server-actions]`.

```typescript
// src/app/actions.ts
"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { quickSaveApplication, quickSaveApplicationInput } from "@/domain/applications";
import { listStages } from "@/domain/lookups";

export async function quickSaveAction(input: unknown) {
  const parsed = quickSaveApplicationInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Couldn't save this change. Check the fields below and try again." };
  }
  const savedStage = listStages(db).find((s) => s.label === "Saved");
  if (!savedStage) throw new Error("Saved stage missing from lookups — seed-lookups.ts must run first");

  quickSaveApplication(db, savedStage.id, parsed.data);
  revalidatePath("/"); // board + KPI row both read from "/"
  return { ok: true as const };
}
```

For any action reachable from the detail page that can change stage (edit dialog, stage-change dialog), revalidate **both** paths since a stage change affects the board too:
```typescript
revalidatePath("/");
revalidatePath(`/job/${applicationId}`);
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Board grouped-by-stage aggregation | A raw grouped SQL query against the RC-version drizzle-orm aggregate API | `listBoardApplications()` + a plain `.reduce()`/`Map` grouping in the Server Component | Zero new untested SQL surface; the grouping logic is trivial once the flat list exists, and it keeps DASH-04's counts trivially traceable to the same rows the board renders |
| KPI count derivation | A second query, a materialized/cached counts table, or a client-side fetch-and-count | `getPipelineSummary()` reducing `listBoardApplications()`'s own output | D2-07 explicitly requires counts be *derived*, not stored; reducing the already-fetched list is the literal, cheapest satisfaction of that requirement |
| Non-interactive shadcn setup | Scripting answers into the interactive `init` wizard (e.g. piping stdin) | Hand-authoring `components.json` directly, then `shadcn add <component> --yes` | The CLI's preset-code system is opaque and web-tool-generated; hand-writing the (small, documented) JSON config is more reliable than trying to automate a wizard whose prompt set/ordering can change across releases |
| Stage-change atomicity | Two separate top-level `db.transaction()` calls (one for field edits, one for `appendStatusEvent`) | The `appendStatusEventTx(tx, ...)` extraction (Pitfall 2) called inside `updateApplication`'s own single transaction | node:sqlite/SQLite does not support true nested transactions; splitting into two top-level transactions reopens the exact "an application can end up with no matching event for its current field state" risk event-sourcing exists to prevent |
| Date formatting in Client Components | `.toLocaleDateString()` calls scattered across client dialogs/timeline rows | Format dates to display strings in the Server Component before passing them down as plain strings (see Pitfall 5) | Avoids server/client locale-or-timezone hydration mismatches entirely, and keeps date-formatting logic in one place |

**Key insight:** every "don't hand-roll" item above exists because the codebase already has an established, correct pattern one join or one reduce away — the risk in this phase is not "no solution exists" but "the UI reaches around the domain layer for a shortcut and reintroduces the exact current-stage-overwrite bug Phase 1's event-sourcing model was built to prevent."

## Common Pitfalls

### Pitfall 1: No column exists yet to store the pasted job-posting URL (CAP-01 schema gap)
**What goes wrong:** CAP-01 requires "pasting its URL" as part of quick-save, but `src/db/schema.ts`'s `applications` table has no `url`/`postingUrl`/`link` column — confirmed by grepping the full schema file (`linkedinUrl` exists only on `contacts`, for a person, not a job posting).
**Why it happens:** Phase 1's schema was scoped to DATA-01 through DATA-07 (source/role-type/company/date/stage/outcome) — a posting URL was never one of those explicitly enumerated capture dimensions, so it was reasonably omitted from Phase 1.
**How to avoid:** Add a `postingUrl: text("posting_url")` (nullable) column to the `applications` table in `src/db/schema.ts`, run `npx drizzle-kit generate` to produce a new migration under `./drizzle`, and apply it via the existing `npm run db:migrate` script (which already resolves `DASHBOARD_MODE` and must be run once against demo and, separately, once against real — same mechanism Phase 1 established). This is additive-only (a new nullable column) — no backfill needed, existing rows simply get `NULL`.
**Warning signs:** If the plan's quick-save dialog is built without first checking this, the "paste URL" field will either silently do nothing (an unused React state variable) or the write path will throw a Drizzle/SQLite "no such column" error at runtime.

### Pitfall 2: `appendStatusEvent`'s current signature can't be called from inside another transaction
**What goes wrong:** `src/domain/events.ts`'s `appendStatusEvent(db, input)` opens its own `db.transaction(...)` internally. `updateApplication` (CAP-02) needs to both update direct fields AND, when the user changes stage, append an event — atomically, in one transaction. Calling `appendStatusEvent(tx, ...)` from inside `updateApplication`'s own `db.transaction((tx) => ...)` would attempt to open a transaction inside a transaction, which SQLite (and therefore node:sqlite/Drizzle) does not support without explicit `SAVEPOINT` handling that this codebase does not use.
**Why it happens:** `appendStatusEvent` was designed in Phase 1 as a standalone top-level write path (ingestion calls it directly); Phase 2 is the first caller that needs to combine it with another write in the same atomic unit.
**How to avoid:** Extract the insert-and-recompute body into a non-transactional helper — e.g. `appendStatusEventTx(tx: DbOrTx, validated: NewStatusEventInput)` (reusing the `DbOrTx` type already exported from `src/domain/projections.ts`) that does the `insert().onConflictDoNothing()` + `recomputeCurrentStage(tx, ...)` with no `db.transaction()` wrapper of its own. Keep the public `appendStatusEvent(db, input)` as a thin wrapper: validate, then `db.transaction((tx) => appendStatusEventTx(tx, validated))`. Both `updateApplication` and the new `quickSaveApplication` call `appendStatusEventTx` directly inside their own single outer transaction; ingestion (Phase 3) and any other single-event caller keep using the unchanged public `appendStatusEvent`.
**Warning signs:** A test or manual run throws `cannot start a transaction within a transaction` (or the node:sqlite equivalent) the first time a combined field-edit-plus-stage-change is attempted.

### Pitfall 3: UI-SPEC's "Accent" color role maps to shadcn's `--primary` token, not shadcn's own `--accent` token
**What goes wrong:** shadcn's default theme ships its own semantically-named `--accent` CSS variable, but by convention that token drives *subtle hover/highlight backgrounds* (e.g. a `DropdownMenuItem`'s hover state), not the primary call-to-action color. UI-SPEC's design-system "Accent (10%) #2563EB" role is meant for "Add Application"/"Quick-Save Job" buttons and focus rings — which in shadcn's own component source is driven by the `--primary` / `--ring` variables (the `Button` component's default variant uses `bg-primary`).
**Why it happens:** Generic design-system vocabulary ("accent color") and shadcn's specific token naming collide on the same English word for different roles.
**How to avoid:** Override `--primary` (and `--primary-foreground`, `--ring`) to `#2563EB`, not shadcn's own `--accent`/`--accent-foreground` tokens. See the `globals.css` snippet in Pattern 0.
**Warning signs:** Buttons render in shadcn's default near-black/white palette instead of blue, even after "the accent color was overridden" — check which CSS variable the rendered button's `bg-*` class actually resolves to.

### Pitfall 4: Passing the server-only `db` handle (or anything requiring it) into a Client Component
**What goes wrong:** `src/db/client.ts` begins with `import "server-only"` specifically so it can never be pulled into a client bundle. The nav shell's DEMO badge (D2-04) needs `dashboardMode`, and any dialog needs the domain read results (e.g. `listStages` for a `<Select>`) — but `dashboardMode`/`db` themselves, or any function that closes over them, must never be imported inside a file that has (or whose caller has) `"use client"` at the top.
**Why it happens:** It's tempting to `import { dashboardMode } from "@/db/client"` directly inside `nav-shell.tsx` for convenience, especially since active-link highlighting (`usePathname()`) already forces that file to be a Client Component.
**How to avoid:** Keep `nav-shell.tsx` as `'use client'`, but have it accept `dashboardMode` (and any lookup data a dialog needs, like the stages/role-types/sources arrays) as **props**, resolved by the parent Server Component (`layout.tsx` / the relevant `page.tsx`) which is the only place allowed to import from `@/db/client` or `@/domain/*`.
**Warning signs:** A build-time error referencing `server-only` being imported from a client module, or (if that guard were ever bypassed) `node:sqlite` failing to bundle for the browser.

### Pitfall 5: Hydration mismatches from client-side date formatting
**What goes wrong:** Timeline entries and application cards carry `Date` objects (Drizzle's `mode: "timestamp"` columns decode to real `Date`s, per the existing `defaultTimestampNow`/epoch-seconds convention in `schema.ts`). If a Client Component calls `someDate.toLocaleDateString()` during render, the string can differ between the server's render environment and the browser's locale/timezone, producing a React hydration mismatch warning (or visibly flashing/incorrect dates).
**Why it happens:** `toLocaleDateString()` (and similar `Intl`-backed calls with no explicit locale/timeZone) are environment-dependent by design.
**How to avoid:** Format every date to its final display string inside the Server Component that fetches it (board cards, KPI row, timeline entries), passing plain strings — not `Date` objects — to any Client Component that merely displays them. If a Client Component genuinely needs the raw `Date` (e.g. a date-picker's default value in the edit dialog), use a fixed, explicit `Intl.DateTimeFormat("en-US", { timeZone: "UTC", ... })` rather than the locale-implicit shorthand.
**Warning signs:** A React warning in the browser console: "Hydration failed because the server rendered text didn't match the client," specifically around a date string.

### Pitfall 6: Next.js 16's async `params` — the `/job/[id]` page must `await` params
**What goes wrong:** Since Next.js 15, and continuing in 16, dynamic route `params` (and `searchParams`) are delivered as a `Promise`, not a plain object `[CITED: nextjs.org/blog/next-16; multiple 2026 Next.js 16 migration guides]`. Destructuring `params.id` synchronously in a Server Component page will throw a type error (TypeScript) or a runtime warning.
**How to avoid:**
```typescript
// src/app/job/[id]/page.tsx
export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const applicationId = Number(id);
  // ...
}
```
**Warning signs:** TypeScript complains `params.id` doesn't exist on type `Promise<...>`, or a runtime error about accessing a property directly on a dynamic API.

## Code Examples

### Sonner Toaster wiring (root layout)
```typescript
// Source: shadcn/ui Sonner docs pattern, standard across App Router setups
// src/app/layout.tsx
import { Toaster } from "@/components/ui/sonner";
// ... inside <body>, alongside <NavShell>:
<Toaster />
```

### React 19 `useActionState` for a dialog form + Server Action
```typescript
// Source: nextjs.org/docs/app/guides/server-actions (pattern), React 19 useActionState
"use client";
import { useActionState } from "react";
import { quickSaveAction } from "@/app/actions";

export function QuickSaveDialog() {
  const [state, formAction, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) =>
      quickSaveAction({
        companyName: formData.get("companyName"),
        roleTitle: formData.get("roleTitle"),
        postingUrl: formData.get("postingUrl") || undefined,
      }),
    { ok: true },
  );
  // render form, show state.error via sonner toast when !state.ok, disable submit while isPending
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| `tailwind.config.js` (JS-based theme config) | CSS-first `@theme` blocks in `globals.css`, no config file by default | Tailwind v4 (installed: 4.3.3) | This phase must not generate a `tailwind.config.js` unless a plugin genuinely requires the JS API |
| shadcn `--style`/`--base-color`/`--css-variables` CLI flags | `--preset <code>` (web-tool generated) or hand-authored `components.json` | shadcn CLI v4 (installed: 4.16.0) | UI-SPEC's placeholder init command is not literally runnable; see Pattern 0 |
| `react-dom`'s `useFormState` | `react`'s `useActionState` | React 19 (installed: 19.2.8) | Use `useActionState`, not the deprecated alias, in all new dialog code |
| Synchronous `params`/`searchParams` in dynamic route pages | `params`/`searchParams` are `Promise`s, must be `await`ed | Next.js 15, continued in 16 (installed: 16.2.11) | `/job/[id]/page.tsx` must `await params` |
| `middleware.ts` | `proxy.ts` | Next.js 16 | Not used by this phase (no auth/redirect logic), noted for completeness only |

**Deprecated/outdated:**
- `tailwindcss-animate` (v3-era) — superseded by `tw-animate-css` for Tailwind v4 projects, if animation utilities are needed at all (this phase has none as hard requirements).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|-----------------|
| A1 | Hand-authoring `components.json` then running `shadcn add <component>` skips the interactive init wizard on shadcn CLI v4.16.0 specifically | Pattern 0 / Don't Hand-Roll | If wrong, the setup task stalls on an unattended interactive prompt; mitigated by an explicit `checkpoint:human-verify` recommendation after the first `add` call |
| A2 | The KPI bucket rule (applied = dateApplied not null; savedNotApplied = dateApplied null; inProgress = applied AND non-terminal stage; closed = terminal stage) is the intended reading of DASH-04's four labels | Architecture Patterns → Pattern 1 | If the user meant something else (e.g. "applied" excluding in-progress, making the four buckets mutually exclusive and summing to 100%), the KPI row shows technically-correct-but-confusing overlapping numbers; low risk since it's easy to change the `reduce()` logic once flagged |
| A3 | Timeline entries render most-recent-first (descending by `occurredAt`) | Architecture Patterns → Pattern 4 | Not specified in CONTEXT.md/UI-SPEC.md; if the user expects chronological ascending order (a literal "history" reading top-to-bottom), a one-line `.sort()` reversal fixes it — flagging so the planner treats ordering as a discretion call, not a hidden default |
| A4 | `tw-animate-css` may be needed depending on which component source shadcn actually copies | Package Legitimacy Audit | If unneeded, installing it is a harmless unused devDependency; if needed and skipped, some Radix-driven open/close animation utility classes could be no-ops (purely cosmetic, non-blocking) |

**If this table is empty:** N/A — see rows above; all other claims in this document are `[VERIFIED]` (confirmed via `npm view`/registry/version checks or direct reads of this repo's own source) or `[CITED]` (referenced from official docs fetched this session).

## Open Questions

1. **Exact KPI bucket definitions (see Assumption A2)**
   - What we know: the four labels (applied, saved-not-applied, in progress, closed) and that they must be "derived from the board read model, not stored" (D2-07).
   - What's unclear: whether "applied" is meant as a standalone historical total (this doc's recommendation) or as a category mutually exclusive from "in progress"/"closed."
   - Recommendation: implement this doc's `reduce()` logic (Pattern 1) as the default; treat as a fast, cheap-to-change discretion call, not a blocking question.

2. **Timeline sort order (see Assumption A3)**
   - What we know: DASH-05 wants "full history" interleaved chronologically.
   - What's unclear: ascending vs. descending presentation.
   - Recommendation: default to most-recent-first (common activity-feed convention); note in the plan as a one-line, low-risk reversal if the user prefers otherwise during UAT.

3. **Whether `shadcn add` truly skips init when `components.json` already exists, on this exact CLI version (see Assumption A1)**
   - What we know: this has been the CLI's behavior historically, and is documented as the general pattern; not directly reconfirmed against v4.16.0 in this research session (Context7 MCP was unavailable in this environment, so this could not be cross-checked against a second authoritative source beyond WebFetch of the current docs pages).
   - What's unclear: any CLI v4-specific edge case that might still prompt interactively even with a valid `components.json` present.
   - Recommendation: the planner should insert a `checkpoint:human-verify` task immediately after the first `shadcn add` invocation in Wave 0/setup, so a stalled/interactive prompt is caught early rather than discovered mid-phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|----------|----------|
| Node.js | Whole project runtime (node:sqlite requires ≥ 24) | ✓ | v24.14.1 | — |
| npm | Package installs | ✓ | bundled with Node 24 | — |
| Next.js | App Router, Server Actions, dev server | ✓ (already installed) | 16.2.11 | — |
| TypeScript | Type-checking | ✓ (already installed) | 7.0.2 | — |
| Tailwind CSS v4 / shadcn CLI | Styling scaffold (this phase's explicit first task) | ✗ (not yet installed — confirmed via `package.json`) | — (target: tailwindcss 4.3.3, shadcn CLI 4.16.0) | None needed — this is an in-scope install task, not a missing environment dependency |
| Context7 MCP | Preferred docs-lookup provider for this research | ✗ (tool not available in this session) | — | Fell back to WebSearch + WebFetch of official docs pages for every question this phase needed; confidence tagged `[CITED]` rather than the higher `[VERIFIED: Context7]` tier where this made a difference |

**Missing dependencies with no fallback:** none — Tailwind/shadcn are an in-scope install task, not a blocker.
**Missing dependencies with fallback:** Context7 MCP unavailable; WebSearch/WebFetch used instead (see Sources).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (already configured, `environment: "node"`, no DOM) |
| Config file | `vitest.config.ts` (path alias `@/* -> src/*` already wired) |
| Quick run command | `npm test -- tests/domain` (scope to the domain layer under active development) |
| Full suite command | `npm test` (= `vitest run`) |

**Gap:** the current `vitest.config.ts` environment is `"node"` — there is no DOM/jsdom environment and no `@testing-library/react` installed. This phase's UI is real, interactive React (dialogs, forms) for the first time in the project. Recommendation: **keep automated tests scoped to the domain/read-model layer** (where the actual business-logic risk lives — event-sourcing correctness, bucket categorization, timeline merge/sort order, transaction atomicity) and treat visual rendering / dialog interaction / empty-state correctness as **manual UAT** via `/gsd-verify-work`, rather than adding a jsdom + Testing Library + user-event stack for a single MVP phase. This keeps the "Sampling Rate" fast and matches the project's actual risk profile (a single local user, not a component library shipped to many consumers). If a future phase needs real component tests, add `environment: "jsdom"` (or a second Vitest project config) at that time.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| CAP-01 | `quickSaveApplication` creates company (if new) + application + exactly one `Saved` status event atomically; `currentStageId` is never null afterward | unit | `vitest run tests/domain/applications.test.ts -t "quickSaveApplication"` | ❌ Wave 0 |
| CAP-01 | `quickSaveApplication` rolls back entirely if any step throws (atomicity) | unit | same file, additional case | ❌ Wave 0 |
| CAP-02 | `updateApplication` writes direct fields without touching `currentStageId` when no `stageId` is given | unit | `vitest run tests/domain/applications.test.ts -t "updateApplication"` | ❌ Wave 0 |
| CAP-02 | `updateApplication` with a `stageId` appends exactly one new status event and recomputes the projection — current-stage column is never set directly | unit | same file, additional case | ❌ Wave 0 |
| CAP-02 | `updateApplication` combining a field edit + a stage change succeeds inside one transaction (regression test for Pitfall 2's nested-transaction bug) | unit | same file, additional case | ❌ Wave 0 |
| CAP-04 | `getConversationsForApplication` returns only conversations linked to that application, ordered by `occurredAt` ascending, joined to the correct contact name | unit | `vitest run tests/domain/contacts.test.ts -t "getConversationsForApplication"` | ❌ Wave 0 |
| DASH-02 | `listBoardApplications` returns every application with correct company/stage joins, including saved-not-applied (`dateApplied: null`) rows | unit | `vitest run tests/domain/board.test.ts` | ❌ Wave 0 |
| DASH-04 | `getPipelineSummary` bucket counts match a hand-constructed fixture set (one of each: saved, applied+in-progress, offer, rejected) | unit | same file, additional case | ❌ Wave 0 |
| DASH-05 | `getJobTimeline` interleaves status events and conversations in the documented sort order, across an application with both | unit | `vitest run tests/domain/timeline.test.ts` | ❌ Wave 0 |
| CAP-01 (schema) | The `postingUrl` migration applies cleanly to an already-migrated test DB and existing rows read back `null` | unit | `vitest run tests/db/migrate.test.ts` (extend existing file) | ✅ (extend existing) |
| All 6 IDs (manual) | Visual/interaction correctness: dialogs open/close, empty states render UI-SPEC copy verbatim, KPI row/board reflect a mutation after `revalidatePath`, DEMO badge shows only in demo mode | manual-only | N/A — `/gsd-verify-work` conversational UAT | — |

### Sampling Rate
- **Per task commit:** `vitest run tests/domain/<file being changed>.test.ts`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`; manual UAT covers the six requirement IDs' actual UI behavior per the row above.

### Wave 0 Gaps
- [ ] `tests/domain/board.test.ts` — covers DASH-02, DASH-04 (new file)
- [ ] `tests/domain/timeline.test.ts` — covers DASH-05 (new file)
- [ ] Extend `tests/domain/applications.test.ts` — covers CAP-01 (`quickSaveApplication`), CAP-02 (`updateApplication`, including the Pitfall-2 combined-transaction regression case)
- [ ] Extend `tests/domain/contacts.test.ts` — covers CAP-04's new `getConversationsForApplication`
- [ ] Extend `tests/db/migrate.test.ts` (or a small new migration-specific test) — covers the `postingUrl` schema addition applying cleanly

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | Single local user, no login/session system in this project (per CLAUDE.md "Out of Scope" — multi-user/auth explicitly excluded) |
| V3 Session Management | No | Same as above |
| V4 Access Control | No | Same as above — every route is reachable by the single local operator |
| V5 Input Validation | Yes | Zod schemas (`newApplicationInput`, new `updateApplicationInput`/`quickSaveApplicationInput`) validated inside the domain layer before any Drizzle write — extend the existing `src/db/validation.ts` pattern rather than inventing a new one |
| V6 Cryptography | No | No secrets/tokens handled by this phase (Gmail OAuth is Phase 3) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Reflected/stored XSS via free-text conversation notes (self-forwarded LinkedIn paste) rendered in the timeline | Tampering / Elevation of Privilege (if ever shared beyond the single user) | React's default JSX text-node escaping (never use `dangerouslySetInnerHTML` for `notes`/pasted content) — this is the default behavior of every component recommended in this doc, just don't override it |
| `javascript:` or otherwise malformed URI stored as `postingUrl` rendered as a clickable `<a href>` | Tampering | Validate with `z.string().url()` and, if stricter safety is wanted, a refinement restricting to `http:`/`https:` protocols before persisting; never interpolate the raw string into an `href` without having gone through validation |
| SQL injection | Tampering | N/A for this phase's new code — all new read models use Drizzle's query builder (parameterized), never raw string-interpolated `sql` fragments; if a raw `sql` template is ever needed (as `page.tsx`/`api/health` already do for `count(*)`), only for literal, non-user-controlled fragments, matching existing project convention |
| Cross-store data leakage (demo data appearing to be real, or vice versa) | Information Disclosure | Already enforced structurally by Phase 1 (D-13, single `dashboardMode` reader); this phase's only obligation is to consume `dashboardMode` exclusively via props from the root layout (Pitfall 4) and never re-derive it |

## Sources

### Primary (HIGH confidence)
- This repository's own source: `src/domain/*.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/db/validation.ts`, `src/db/paths.ts`, `tests/helpers/db.ts`, `tests/domain/applications.test.ts`, `package.json`, `vitest.config.ts`, `drizzle.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/api/health/route.ts`, `.gitignore` — read directly this session
- `npm view <package> version` — confirmed current registry versions for tailwindcss, @tailwindcss/postcss, shadcn, lucide-react, sonner, class-variance-authority, clsx, tailwind-merge, @radix-ui/react-dialog, @radix-ui/react-select, tw-animate-css, tailwindcss-animate, geist
- `gsd-tools query package-legitimacy check` — full signal report (age/downloads/repo/postinstall) for every recommended package

### Secondary (MEDIUM confidence — official docs fetched via WebFetch this session)
- `[CITED: tailwindcss.com/docs/guides/nextjs]` — Tailwind v4 + Next.js install sequence, PostCSS config, `@import "tailwindcss"`
- `[CITED: ui.shadcn.com/docs/installation/next]`, `[CITED: github.com/shadcn-ui/ui/blob/main/skills/shadcn/cli.md]` — shadcn CLI v4 flags, confirmation that `--style`/`--base-color`/`--css-variables` are removed
- `[CITED: ui.shadcn.com/schema.json]` — `components.json` schema fields
- `[CITED: ui.shadcn.com/docs/theming]` — `@theme inline` / `:root` CSS variable structure for Tailwind v4
- `[CITED: nextjs.org/docs/app/guides/server-actions]`, `[CITED: nextjs.org/blog/next-16]` — Server Actions patterns, Next.js 16 async `params`/`searchParams`, `proxy.ts` rename

### Tertiary (LOW confidence — WebSearch snippets only, not independently re-fetched)
- General Server Actions vs. Route Handlers comparison articles (multiple 2026 blog posts) — directional guidance only, corroborated by the official `nextjs.org` guide above
- Drizzle ORM `count()`/`groupBy()` general pattern (orm.drizzle.team docs, via WebSearch snippet) — explicitly NOT relied upon in this phase's recommendations (see Standard Stack "Alternatives Considered") precisely because it couldn't be version-matched to the installed `1.0.0-rc.4`
- `tw-animate-css` relevance to this specific shadcn v4 template — registry existence only, tagged `[ASSUMED]`

**Context7 MCP was not available in this environment** (`mcp__context7__resolve-library-id` returned "No such tool available"); every question in the research plan that the seam routed to `context7` was instead answered via WebSearch/WebFetch against the same official documentation domains, with confidence tagged `[CITED]` rather than the higher tier that direct Context7/library-ID resolution would have earned.

## Metadata

**Confidence breakdown:**
- Standard stack (Tailwind v4, shadcn CLI mechanics, Next.js 16 async APIs): MEDIUM — versions verified via registry, but shadcn CLI's exact v4.16.0 non-interactive behavior not independently re-confirmed beyond WebFetch of its own docs (Context7 unavailable)
- Architecture / domain read-model design: HIGH — grounded directly in reading this repository's actual `src/domain/*.ts` and `src/db/schema.ts` files, not assumed
- Pitfalls: HIGH for the schema-gap and transaction-nesting findings (both discovered by reading actual code, not documentation); MEDIUM for the CSS-token-naming and hydration pitfalls (general React/shadcn knowledge, cited where possible)

**Research date:** 2026-07-29
**Valid until:** ~14 days for the shadcn CLI specifics (fast-moving tool, currently mid-redesign of its preset system); ~30 days for Next.js/Tailwind/domain-layer findings (stable, already-installed-and-pinned versions)
