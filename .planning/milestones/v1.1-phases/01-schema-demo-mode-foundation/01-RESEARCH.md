# Phase 1: Schema + Demo Mode Foundation - Research

**Researched:** 2026-07-22
**Domain:** Event-sourced SQLite schema (Drizzle ORM + better-sqlite3) with structural demo/real data separation, on a greenfield Next.js/TypeScript project (Windows 11 dev machine)
**Confidence:** MEDIUM-HIGH (Drizzle/SQLite patterns cross-checked against official docs via WebSearch; the Windows native-build blocker below is HIGH confidence — verified by actually running the install on this machine, not inferred)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Contacts & Conversations**
- **D-01:** Conversations are recorded as dated entries — each touchpoint is its own timestamped record (date, channel, notes), not a single running-notes field. A contact has a one-to-many relationship to conversation/interaction records.
- **D-02:** Fields to capture per contact: name, role/title, channel (email/call/LinkedIn/etc.), notes, email address, LinkedIn URL, relationship type (recruiter / hiring manager / referral / peer / etc.), and how-you-met/source (coffee chat, alumni, cold, mutual connection). All are captured; most are optional at the field level.
- **D-03:** A contact is modeled as belonging to the job's company (the simpler model), NOT given its own separate employer field in this phase. Relationship type ("recruiter") is the substitute tag for the agency/employer distinction. Full agency-employer modeling is deferred to Phase 3.
- **D-04:** Email address + LinkedIn URL on a contact double as de-duplication signals for the same person appearing across multiple jobs (supports DATA-05).

**Domain Vocabulary — locked defaults (reviewed and approved)**
- **D-05 — Pipeline stages:** `Saved → Applied → Screen → Interview → Offer`, plus `Rejected`, `Ghosted` (No-response), `Withdrawn`. Stored as append-only events — the stage list is a vocabulary, not a rigid linear enum enforced by the schema.
- **D-06 — Source values:** `Handshake`, `Company site / ATS`, `Referral`, `LinkedIn`, `Job board / Other`.
- **D-07 — Role-type tags:** `Product Management`, `Strategy`, `Chief of Staff`, `Other`. Must be extensible — user can add role types later without a migration (favor a lookup/reference table over a hard enum).
- **D-08 — "Ghosted"** is a first-class stage AND a derivable condition. Schema must represent it and carry the timing data (last inbound event timestamp) for Phase 5 to compute staleness without a schema change.

**Event-Sourcing & Correction model (locked)**
- **D-09:** Status changes are stored ONLY as new dated event rows. No code path may update a single current-status column in place. Current stage is a derived projection computed from events ordered by real-world event time (`occurred_at`).
- **D-10:** Each ingested message carries a unique source message identifier with a uniqueness constraint, so re-syncing the same email never creates a duplicate record or event.
- **D-11:** User corrections/overrides are stored in a separate structure that takes precedence over parser-derived values at read time. A re-sync or parser change must never overwrite a manual fix. (Override *persistence-across-resync* behavior, CAP-03, is verified in Phase 3; Phase 1 provides the schema.)

**Demo / Real separation (reviewed and approved)**
- **D-12 — Demo dataset shape:** ~15-20 invented-but-plausible companies (never real companies), spread across every pipeline stage, with a handful of contacts and dated conversations attached.
- **D-13 — Structural separation:** Demo mode is a data-source swap (separate SQLite file selected at startup), NOT a code branch or a flag threaded through queries. No code path may be capable of mixing real and demo data.

### Claude's Discretion
- Table/schema design, column types, indexing, and how the event→projection derivation is physically implemented (view vs. computed vs. materialized).
- How company aliases (DATA-04) are structured (alias table vs. normalized key).
- Migration setup and the seed/demo data generation mechanism.
- Exact override-table shape implementing D-11.

### Deferred Ideas (OUT OF SCOPE)
- Full agency/staffing-firm employer modeling for contacts (own employer entity distinct from job's company) — revisit in Phase 3 entity resolution.
- Ghosted auto-flagging / staleness threshold computation — Phase 5 (DASH-03). Phase 1 only carries the timing data.
- Override-survives-resync behavioral verification (CAP-03) — Phase 3, once a real parser exists to override.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | Every application record stores source, role type, company, date applied, current stage, outcome at capture time | `applications` table design (§Standard Stack/Architecture); `outcome` is a derived read-time mapping from `current_stage`, not a separately stored column — see Pattern 2 rationale |
| DATA-02 | Status changes stored as dated, append-only transition events, never an overwritten field | `status_events` append-only table + Pattern 2 (Event Log + Recomputed Projection) |
| DATA-03 | Current stage derived from events ordered by real-world event time, resolving out-of-order ingestion correctly | `recomputeCurrentStage()` function, `ORDER BY occurred_at ASC, id ASC` tiebreak — see §1 below |
| DATA-04 | Company records support name aliases resolving variants to one entity | `companies` + `company_aliases` table design — see §4 below |
| DATA-05 | A contact can be linked to multiple jobs, and a job can have multiple contacts, with dates preserved | `contact_applications` join table + `conversations` table — see §5 below |
| DATA-06 | Each ingested message uniquely identified; re-sync never creates a duplicate record/event | `UNIQUE(source_message_id)` on `status_events` + `onConflictDoNothing` — see §2 below |
| DATA-07 | User corrections stored separately from parser-derived values, take precedence, survive re-sync/parser changes | `overrides` table + read-merge pattern — see §3 below |
| DEMO-01 | A toggle swaps in a realistic seed dataset | `db:seed:demo` script + `data-source.ts` startup resolution — see §6 below |
| DEMO-02 | Demo data structurally separated (separate store/path) | Two SQLite files, one startup-resolved Drizzle client, `.gitignore` on real DB — see §6 below |
| DEMO-03 | Demo mode present in v1, not retrofitted | This entire phase — schema + seed generator ship before any UI |
</phase_requirements>

## Summary

The stack is locked (better-sqlite3 + Drizzle ORM + TypeScript/Next.js) and the domain vocabulary is locked (CONTEXT.md D-05/D-06/D-07). What Phase 1 actually needs decided is the *physical* shape of five interlocking patterns: event/projection derivation, message-ID idempotency, override precedence, company aliasing, and the demo/real data-source swap — plus the greenfield project scaffold everything else builds on.

The single most consequential finding from direct verification against Drizzle's own SQLite support: **Drizzle's `sqliteView()` is ORM-side only** — `drizzle-kit` does not generate migrations or `db push` for views yet, so a view would have to be hand-written as raw `CREATE VIEW` SQL bypassing the normal migration-generation workflow. Given the project's low write volume (a handful of events per application, ~8-15/week), this research recommends **a materialized projection column on `applications`** (`current_stage_id`, `current_stage_since`, `last_inbound_event_at`), recomputed synchronously inside the same transaction as every `status_events` insert via a single idempotent `recomputeCurrentStage(applicationId)` function — not a SQL view, not a plain computed-on-every-read query. This keeps normal `drizzle-kit generate`/`migrate` in full control of the schema, keeps reads simple and fast, and gives a free "repair" path (re-run the function over every application if a bug is ever found).

The second most consequential finding is environment-specific, not library-specific, and was **verified by actually running `npm install better-sqlite3` on this machine**: it fails, because `better-sqlite3@13.0.1`'s install script unconditionally runs `node-gyp rebuild` (no prebuilt-binary fallback for Windows exists in this package's install script), and this machine has no Visual Studio Build Tools with the C++ workload installed. Node's built-in `node:sqlite` module (via `drizzle-orm/node-sqlite`) was tested directly on this same machine and works with zero native compilation. This is a real blocker for Phase 1 execution and is presented as an explicit decision point (§Environment Availability), not silently resolved, since it touches the locked STACK.md driver choice.

**Primary recommendation:** Build the schema around a materialized `current_stage` projection recomputed on write (not a view), a single `UNIQUE(source_message_id)` column on `status_events` with `onConflictDoNothing`, a dedicated `overrides` table with an app-level read-merge (not a Drizzle composite-key upsert, which has a known SQLite flakiness issue), a `companies` + `company_aliases` table pair, and a startup-resolved Drizzle client singleton pointing at one of two gitignored-by-default SQLite files. Resolve the Visual Studio Build Tools gap (or switch to `drizzle-orm/node-sqlite`) before writing any code that touches the database.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Event storage (`status_events`) | Database / Storage | — | Append-only log is a pure persistence concern; no server logic needed beyond the insert itself |
| Current-stage derivation | Database / Storage (materialized columns) | API / Backend (the recompute function) | The *data* lives in SQLite; the *recompute logic* is a thin TypeScript function in the data-access layer, not a DB trigger (SQLite triggers are harder to test/debug than a typed function called from the write path) |
| Idempotent message ingestion | Database / Storage | API / Backend | The UNIQUE constraint is the actual guarantee; the backend just issues an `ON CONFLICT DO NOTHING` insert and doesn't need its own dedup bookkeeping |
| Override precedence | API / Backend | Database / Storage | The `overrides` table is storage, but "override wins over derived value" is a read-path merge decision that belongs in the data-access layer (a query function), not something SQLite itself can express declaratively without a view |
| Company alias resolution | API / Backend | Database / Storage | Alias→canonical lookup is a simple join, but *which* alias table shape and how lookups normalize case/punctuation is application logic |
| Demo/real data-source selection | API / Backend (startup resolution) | — | Resolved once in a server-only module at process start; never a per-request or per-query decision, and never reachable from the browser tier |
| Contact ↔ job linkage | Database / Storage | — | Pure relational modeling (join table); no business logic beyond referential integrity |

**Why this matters here:** this phase has no browser/UI tier at all (CONTEXT.md explicitly scopes it to "no UI, no ingestion code"), so every capability above is either Database/Storage or the thin API/Backend data-access layer Phase 2 will build against. The most common misassignment risk for *this* phase specifically is putting derivation logic in a DB trigger/view (harder to unit-test, and Drizzle's view support doesn't participate in migrations yet) instead of a plain, testable backend function — this map exists to make sure that choice is deliberate, not accidental.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-sqlite3` | 13.0.1 [VERIFIED: npm registry] | Embedded SQLite driver (locked in STACK.md) | Synchronous, in-process, fastest Node SQLite driver at this data volume. **See Environment Availability — this machine currently cannot install it; a fallback is documented.** |
| `drizzle-orm` | 0.45.2 [VERIFIED: npm registry] | Type-safe schema/query layer over better-sqlite3 | Locked in STACK.md; schema-as-code keeps event tables and projection tables in one typed source of truth |
| `drizzle-kit` | 0.31.10 [VERIFIED: npm registry] | Migration generation/apply CLI | Dev dependency; `generate`/`migrate` workflow — see §7 |
| `zod` | 4.4.3 [VERIFIED: npm registry] | Runtime validation at every write boundary | Validates event/override/contact input before it reaches Drizzle — this is the V5 Input Validation control for this phase (see Security Domain) |
| `next` | 16.2.11 [VERIFIED: npm registry] | Full-stack framework (locked in STACK.md) | Scaffold only in this phase — no routes beyond the optional liveness check (§8) |
| `react` / `react-dom` | 19.2.8 [VERIFIED: npm registry] | UI runtime (required by Next.js) | Not exercised meaningfully until Phase 2; included in scaffold since Next.js requires it |
| `typescript` | 7.0.2 [VERIFIED: npm registry] | Language / compiler | Locked in STACK.md |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/better-sqlite3` | 7.6.13 [VERIFIED: npm registry] | Type definitions | Dev dependency, must match installed `better-sqlite3` major version per STACK.md compatibility note |
| `@types/node` | 26.1.1 [VERIFIED: npm registry] | Node type definitions | Dev dependency |
| `vitest` | 4.1.10 [VERIFIED: npm registry] | Test runner for the Validation Architecture (below) | Chosen over Node's built-in test runner for its `describe`/`it` ergonomics and existing Next.js community familiarity; no browser/DOM environment needed for these data-layer tests |
| `tsx` | 4.23.1 [VERIFIED: npm registry] | Run TypeScript scripts directly (migration runner, seed script) without a separate build step | Used for `npm run db:seed:demo` and any one-off repair scripts (e.g., a "rebuild all projections" script) |
| `server-only` | 0.0.1 [VERIFIED: npm registry] | Compile-time guard preventing a module from being imported into client-side bundles | Wrap the DB client module (`src/db/client.ts`) with `import 'server-only'` so no code path can accidentally ship the SQLite driver or a real-data query into a browser bundle in a later phase |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `better-sqlite3` | `drizzle-orm/node-sqlite` (Node's built-in `node:sqlite`) | Zero native compilation (verified working on this machine with no toolchain), but the module is still labeled experimental by Node itself and `better-sqlite3` is what STACK.md locked. Use only if the Visual Studio Build Tools gap (below) isn't resolved before this phase starts. |
| A SQL view for the current-stage projection | Materialized columns recomputed on write | A view means "always live, no staleness risk," but Drizzle's SQLite view support doesn't participate in `drizzle-kit generate`/migrate yet, forcing hand-written raw-SQL migrations for the view itself. Materialized columns stay inside the normal Drizzle migration workflow. |
| Drizzle `onConflictDoUpdate` on the overrides table's composite key | App-level read-then-write inside a transaction | A documented Drizzle/SQLite GitHub issue reports `onConflictDoUpdate` behaving unreliably on composite primary keys/unique constraints; at this write volume (single user, occasional corrections), a plain read-check-then-insert/update transaction is simpler and avoids the bug entirely. |
| `nanoid`/UUID primary keys | `INTEGER PRIMARY KEY AUTOINCREMENT` | Integer autoincrement IDs are simpler, need no extra dependency, and double as a free insertion-order tiebreaker for `status_events` ordering. UUIDs would only matter if this schema ever needed to merge data from multiple independent SQLite files (it doesn't — single user, single real DB). |

**Installation:**
```bash
npm install next@16.2.11 react@19.2.8 react-dom@19.2.8
npm install better-sqlite3@13.0.1 drizzle-orm@0.45.2 zod@4.4.3 server-only@0.0.1
npm install -D typescript@7.0.2 @types/node@26.1.1 @types/better-sqlite3@7.6.13 drizzle-kit@0.31.10 tsx@4.23.1 vitest@4.1.10
```

If the Visual Studio Build Tools gap is not resolved, substitute `better-sqlite3` above with nothing (it's built into Node — no install needed) and import `DatabaseSync` from `node:sqlite`, using `drizzle-orm/node-sqlite` instead of `drizzle-orm/better-sqlite3` everywhere.

## Package Legitimacy Audit

All packages below were checked via the legitimacy seam. Every package flagged `SUS` here was flagged **only** for the `too-new` signal, which measures the *latest published version's* timestamp, not the package's age — every one of these is a multi-year-old, extremely high-download package (tens to hundreds of millions of weekly downloads) that simply shipped a routine patch release recently. This is a heuristic limitation of the automated check, not a real legitimacy concern, and is called out explicitly so the planner doesn't need a separate `checkpoint:human-verify` per package — one lightweight "confirm these resolve to the officially-known packages, not typosquats" spot-check covers the whole list.

| Package | Registry | Verdict | Signal detail | Disposition |
|---------|----------|---------|----------------|-------------|
| `drizzle-orm` | npm | OK | 15.5M weekly downloads, official repo | Approved |
| `drizzle-kit` | npm | OK | 12.9M weekly downloads, official repo | Approved |
| `zod` | npm | OK | 234M weekly downloads, official repo | Approved |
| `better-sqlite3` | npm | SUS (`too-new`) | 8.5M weekly downloads, official `WiseLibs/better-sqlite3` repo, install script is a standard native-addon `node-gyp rebuild` (no suspicious network/filesystem behavior) | Approved — flag is a latest-patch-date artifact |
| `next` | npm | SUS (`too-new`) | 48.4M weekly downloads, official Vercel repo | Approved — flag is a latest-patch-date artifact |
| `react` / `react-dom` | npm | SUS (`too-new`) | 150-160M weekly downloads each, official repo | Approved — flag is a latest-patch-date artifact |
| `typescript` | npm | SUS (`too-new`) | 240M weekly downloads, official Microsoft repo | Approved — flag is a latest-patch-date artifact |
| `vitest` | npm | SUS (`too-new`) | 80M weekly downloads, official `vitest-dev` repo | Approved — flag is a latest-patch-date artifact |
| `tsx` | npm | SUS (`too-new`) | 80.4M weekly downloads, official `privatenumber/tsx` repo | Approved — flag is a latest-patch-date artifact |
| `server-only` | npm | SUS (`no-repository`) | 11.6M weekly downloads; `package.json` doesn't populate a `repository` field (common for small single-purpose Vercel/Next.js ecosystem packages) but is the standard, widely-documented Next.js pattern for server-only module guards | Approved — missing metadata field, not a legitimacy concern |
| `nanoid` | npm | SUS (`too-new`) | Checked but **not adopted** — see Alternatives Considered (integer autoincrement PKs used instead) | Not used — no disposition needed |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** all listed above under the `too-new`/`no-repository` reasons — all assessed as benign per the explanation above. No package in this list is `[ASSUMED]`; all version numbers were confirmed directly via `npm view <pkg> version` against the live registry during this research session, and all are Node/JS ecosystem packages already implied or locked by STACK.md and CLAUDE.md.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  STARTUP (once, in a server-only module)                        │
│  env var (DASHBOARD_MODE=demo|real, no default — fail loud)     │
│      │                                                           │
│      ▼                                                           │
│  resolve one absolute .sqlite file path                          │
│      │                                                           │
│      ▼                                                           │
│  construct ONE Drizzle client (globalThis-cached singleton)      │
└──────────────────────────┬────────────────────────────────────────┘
                            │  (every later phase's code imports this one client)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  WRITE PATH (Phase 2+ calls into these; Phase 1 unit-tests them) │
│                                                                   │
│  appendStatusEvent(applicationId, eventType, occurredAt, msgId)  │
│      │  INSERT INTO status_events ... ON CONFLICT(source_       │
│      │  message_id) DO NOTHING          (idempotent — DATA-06)  │
│      ▼                                                           │
│  recomputeCurrentStage(applicationId)   (same transaction)       │
│      │  SELECT * FROM status_events WHERE application_id = ?    │
│      │  ORDER BY occurred_at ASC, id ASC                        │
│      │  → take last row → UPDATE applications SET               │
│      │    current_stage_id, current_stage_since,                │
│      │    last_inbound_event_at            (DATA-02, DATA-03)   │
│                                                                   │
│  setOverride(applicationId, fieldName, value)                   │
│      │  read existing override row → UPDATE or INSERT            │
│      │  (never a composite-key upsert — see Pitfall below)      │
└──────────────────────────┬────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  READ PATH (Phase 2 UI will call this; Phase 1 unit-tests it)   │
│                                                                   │
│  getApplicationDetail(id)                                        │
│      │  base = SELECT applications JOIN companies (resolve       │
│      │         alias → canonical) JOIN role_types/stages          │
│      │  overrides = SELECT * FROM overrides WHERE application_id │
│      │  merged = for each correctable field:                     │
│      │    COALESCE(override.value, base.value)   (DATA-07)      │
└─────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
recruiting-dashboard/
├── drizzle/                      # generated SQL migration files (drizzle-kit generate output)
├── data/                         # SQLite files live here — gitignored except .gitkeep
│   ├── real.sqlite               # NEVER committed
│   └── demo.sqlite                # generated by db:seed:demo, also gitignored (regenerate from script, don't commit a binary)
├── src/
│   ├── db/
│   │   ├── schema.ts              # all Drizzle table definitions (this phase's deliverable)
│   │   ├── client.ts              # server-only, startup-resolved singleton (see §6)
│   │   └── migrate.ts             # programmatic migration runner (tsx script)
│   ├── domain/
│   │   ├── events.ts              # appendStatusEvent() — idempotent insert (DATA-06)
│   │   ├── projections.ts         # recomputeCurrentStage() (DATA-02, DATA-03)
│   │   ├── overrides.ts           # setOverride(), read-merge helpers (DATA-07)
│   │   ├── companies.ts           # alias resolution, normalizeCompanyName() (DATA-04)
│   │   └── contacts.ts            # contact + conversation + join-table CRUD (DATA-05)
│   ├── demo/
│   │   └── seed/
│   │       ├── companies.ts       # ~15-20 invented company fixtures (D-12)
│   │       └── seed.ts            # tsx-run script: migrate + insert fixtures into demo.sqlite
│   └── app/
│       └── (optional liveness route — see §8)
├── vitest.config.ts
├── drizzle.config.ts
├── .gitignore                     # *.sqlite, *.db, .env*, node_modules, .next — BEFORE first commit
├── package.json
└── tsconfig.json
```

### Structure Rationale

- `domain/events.ts` and `domain/projections.ts` are separate files (mirrors ARCHITECTURE.md's recommendation) because the event insert and the projection recompute are different guarantees — append-only vs. recomputable — and keeping them visually and structurally separate is what prevents a future contributor from "helpfully" writing directly to `applications.current_stage`.
- `data/` is a real directory, not an implicit cwd-relative path, so the demo/real file split is visible and obviously two distinct files rather than one shared store with a flag.
- `demo/seed/` holds the *generator*, not a committed binary `.sqlite` file — regenerating demo data from code is the auditable, diffable, editable artifact; a binary DB file in git is neither.

## Pattern 1: Idempotent Ingestion Keyed on Message ID (DATA-06)

**What:** `status_events.source_message_id` carries a `UNIQUE` constraint. SQLite's uniqueness semantics treat `NULL` as never equal to another `NULL`, so manually-created events (no source email) can all have `NULL` in this column without ever tripping the constraint — uniqueness only applies among rows that actually have a non-null message ID.

**Drizzle schema (SQLite):**
```typescript
// src/db/schema.ts
import { sqliteTable, integer, text, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const statusEvents = sqliteTable('status_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  applicationId: integer('application_id').notNull().references(() => applications.id),
  stageId: integer('stage_id').notNull().references(() => stages.id),
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(), // real-world event time
  sourceMessageId: text('source_message_id'), // nullable — null for manual entries
  confidence: real('confidence'), // 0..1, null/1.0 for manual entries
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(), // audit only, NEVER used for ordering
}, (t) => ({
  uniqueMessageId: uniqueIndex('status_events_source_message_id_unique').on(t.sourceMessageId),
}));
```

**Idempotent insert (Drizzle + better-sqlite3):**
```typescript
// src/domain/events.ts
export function appendStatusEvent(input: NewStatusEvent) {
  return db.transaction((tx) => {
    const inserted = tx.insert(statusEvents)
      .values(input)
      .onConflictDoNothing({ target: statusEvents.sourceMessageId })
      .run();
    // recompute even if this exact insert was a no-op, so a retried
    // caller never leaves the projection stale for other reasons
    recomputeCurrentStage(tx, input.applicationId);
    return inserted;
  });
}
```
`[CITED: orm.drizzle.team/docs/insert — onConflictDoNothing]`

**Where the unique key lives:** on `status_events` directly, not a separate `raw_messages` staging table — Phase 1 has no ingestion pipeline yet (that's Phase 3), so the simplest thing that is directly testable now (insert the same `source_message_id` twice, assert exactly one row) is the right scope. If Phase 3 later needs to store the full raw MIME payload for replay/debugging, that's an additive `raw_messages` table referencing this same `source_message_id`, not a schema change to this constraint.

## Pattern 2: Event Log + Materialized Projection, Not a View (DATA-02, DATA-03)

**Recommendation with rationale:** Use a **materialized column set on `applications`**, recomputed synchronously inside the same transaction as every event insert — not a SQL view, and not a plain compute-on-every-read query.

- A Drizzle **view** (`sqliteView`) was considered first, since it would guarantee "always correct, never stale." `[CITED: orm.drizzle.team — Views]` confirms SQLite views in Drizzle are **ORM-side only** — `drizzle-kit` does not currently generate migrations or `db push` statements for them. Using one would mean hand-writing a raw `CREATE VIEW` SQL migration outside the normal `drizzle-kit generate` workflow, which fragments the migration story for one table versus the rest of the schema. At this project's data volume (a handful of events per application, ~8-15 ingested emails/week per STACK.md), the "always live" benefit of a view isn't worth exiting the standard migration tooling.
- A plain **compute-on-every-read** query (re-run `ORDER BY occurred_at DESC LIMIT 1` on every dashboard load) was also considered — simplest to implement, no write-time cost — but couples every future read query to knowing how to derive current stage, rather than reading one column. It also doesn't give Phase 5 a cheap column to build staleness/"ghosted" logic against (DASH-03 needs `last_inbound_event_at` readily queryable).
- **Materialized columns win here** because: (1) they stay inside `drizzle-kit generate`/`migrate` like every other column, (2) recompute cost is trivial at this volume, (3) the recompute function is a small, directly unit-testable TypeScript function (not a DB trigger), and (4) the same function doubles as a repair script if a bug is ever found (`tsx scripts/rebuild-projections.ts` re-running it over every application).

**Schema:**
```typescript
export const applications = sqliteTable('applications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').notNull().references(() => companies.id),
  roleTitle: text('role_title'),
  roleTypeId: integer('role_type_id').references(() => roleTypes.id),
  sourceId: integer('source_id').references(() => sources.id),
  dateApplied: integer('date_applied', { mode: 'timestamp' }), // nullable — "saved, not applied yet"

  // Materialized projection — written ONLY by recomputeCurrentStage(), never by ingestion directly
  currentStageId: integer('current_stage_id').references(() => stages.id),
  currentStageSince: integer('current_stage_since', { mode: 'timestamp' }),
  lastInboundEventAt: integer('last_inbound_event_at', { mode: 'timestamp' }), // feeds Phase 5 staleness (D-08)

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
});
```

**Recompute function — the critical correctness detail is the ORDER BY tiebreak:**
```typescript
// src/domain/projections.ts
export function recomputeCurrentStage(tx: Transaction, applicationId: number) {
  const events = tx.select().from(statusEvents)
    .where(eq(statusEvents.applicationId, applicationId))
    // occurred_at = the email's real-world timestamp — this is what makes
    // out-of-order ingestion (rejection processed before confirmation) resolve
    // correctly. `id` is a pure insertion-order tiebreak for same-timestamp events,
    // NOT a substitute for occurred_at ordering.
    .orderBy(asc(statusEvents.occurredAt), asc(statusEvents.id))
    .all();

  if (events.length === 0) return;
  const latest = events[events.length - 1];

  tx.update(applications)
    .set({
      currentStageId: latest.stageId,
      currentStageSince: latest.occurredAt,
      lastInboundEventAt: latest.occurredAt,
    })
    .where(eq(applications.id, applicationId))
    .run();
}
```

**`outcome` (DATA-01) is derived, not a stored column.** `outcome` is fully computable from `currentStageId` via each stage's `isTerminal`/polarity flag (see `stages` lookup table below) — storing it separately would create a second value that could drift from `current_stage`. The read-merge layer maps `current_stage → outcome` (e.g., `Offer→Offer`, `Rejected→Rejected`, `Withdrawn→Withdrawn`, `Ghosted→Ghosted`, everything else→`Active`) at query time.

**Verification for this pattern (out-of-order test):**
```typescript
// insert Applied (occurred_at: Jan 1) then Rejected (occurred_at: Jan 3)
// insert them in REVERSE order (Rejected first, then Applied) to simulate
// a rejection email processed before the confirmation email
appendStatusEvent({ applicationId, stageId: REJECTED, occurredAt: jan3, sourceMessageId: 'msg-2' });
appendStatusEvent({ applicationId, stageId: APPLIED, occurredAt: jan1, sourceMessageId: 'msg-1' });
// assert: applications.currentStageId === REJECTED  (correct, because occurred_at
// ordering — not insertion order — determined the latest event)
```

## Pattern 3: Override Precedence (DATA-07)

**Schema:**
```typescript
export const overrides = sqliteTable('overrides', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  applicationId: integer('application_id').notNull().references(() => applications.id),
  fieldName: text('field_name').notNull(), // validated at the app layer against an allow-list (V5 — see Security Domain)
  valueText: text('value_text'), // stored as text; read-merge layer knows each field_name's expected type
  setByUserAt: integer('set_by_user_at', { mode: 'timestamp' }).notNull().defaultNow(),
}, (t) => ({
  oneOverridePerField: uniqueIndex('overrides_application_field_unique').on(t.applicationId, t.fieldName),
}));
```

**Why not `onConflictDoUpdate` on the composite `(applicationId, fieldName)` target:** `[CITED: github.com/drizzle-team/drizzle-orm issue #2998]` documents `onConflictDoUpdate` behaving unreliably specifically on composite primary keys / unique constraints in SQLite. At this project's write volume (a single user occasionally correcting a field), the safer, fully-reliable pattern is an explicit read-then-write inside one transaction:

```typescript
// src/domain/overrides.ts
export function setOverride(applicationId: number, fieldName: string, value: string) {
  return db.transaction((tx) => {
    const existing = tx.select().from(overrides)
      .where(and(eq(overrides.applicationId, applicationId), eq(overrides.fieldName, fieldName)))
      .get();

    if (existing) {
      tx.update(overrides).set({ valueText: value, setByUserAt: new Date() })
        .where(eq(overrides.id, existing.id)).run();
    } else {
      tx.insert(overrides).values({ applicationId, fieldName, valueText: value }).run();
    }
  });
}
```

**Read-merge (why re-sync can never clobber a correction):**
```typescript
export function getMergedField(applicationId: number, fieldName: string, derivedValue: string | null) {
  const override = db.select().from(overrides)
    .where(and(eq(overrides.applicationId, applicationId), eq(overrides.fieldName, fieldName)))
    .get();
  return override ? override.valueText : derivedValue; // override always wins if present
}
```
The write path for ingestion (Phase 3) is designed the same way ARCHITECTURE.md's Anti-Pattern 3 describes: ingestion always writes its own derived value to the base tables/events as normal, and *never* checks overrides before writing — it's the **read** path (and the projection recompute, which never touches `overrides` at all) that enforces precedence. This means overrides never need to "know about" a re-sync; they structurally cannot be touched by one.

## Pattern 4: Company Aliases (DATA-04)

**Recommendation: alias table, not a normalized-key-only approach.** PITFALLS.md's Pitfall 6 explicitly recommends "a small user-editable alias table (canonical company name → known aliases/subsidiaries/agencies)" over trying to infer aliasing automatically — at this data volume (a few dozen companies), a table the user can add rows to directly is both simpler and more reliable than fuzzy-matching logic. A normalized key is used *in addition*, as a defensive lookup helper, not as the alias mechanism itself.

```typescript
export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  canonicalName: text('canonical_name').notNull().unique(),
  normalizedKey: text('normalized_key').notNull().unique(), // lowercased/trimmed/punctuation-stripped, app-computed
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
});

export const companyAliases = sqliteTable('company_aliases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').notNull().references(() => companies.id),
  alias: text('alias').notNull().unique(), // "Facebook" -> points at the Meta company row
  normalizedAlias: text('normalized_alias').notNull().unique(),
});
```

Lookup order at write time (used by both manual entry now and the Phase 3 resolver later): normalize the incoming name → check `companies.normalizedKey` → check `companyAliases.normalizedAlias` → if neither matches, it's a genuinely new company (create it) or route to review (Phase 3 concern, not Phase 1). Enforcing that an `alias` never collides with another company's `canonicalName` is an app-level invariant (tested with a unit test), not a cross-table DB constraint — SQLite can't express a `UNIQUE` spanning two tables without a trigger, and a trigger is unnecessary complexity at this volume (see PITFALLS Pitfall 10, over-engineering).

## Pattern 5: Contacts, Jobs, and Dated Conversations (DATA-05, D-01, D-02, D-03)

Per D-03, a contact belongs to **a** company (the company of the job that first introduced them) — this satisfies "no separate employer field" without blocking DATA-05's requirement that the *same contact* can be linked to multiple jobs (potentially at different companies later, once Phase 3's fuller agency modeling exists): the many-to-many relationship lives entirely in a join table, not on the contact row itself.

```typescript
export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyId: integer('company_id').references(() => companies.id), // nullable: contact may predate any specific job (e.g. a coffee chat)
  name: text('name').notNull(),
  roleTitle: text('role_title'),
  channel: text('channel'), // email/call/LinkedIn/etc (D-02)
  notes: text('notes'),
  email: text('email'), // de-dup signal (D-04)
  linkedinUrl: text('linkedin_url'), // de-dup signal (D-04)
  relationshipType: text('relationship_type'), // recruiter/hiring manager/referral/peer (D-02, substitutes for agency modeling per D-03)
  source: text('source'), // how-you-met: coffee chat/alumni/cold/mutual connection (D-02)
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
});

// DATA-05: many-to-many, dates preserved
export const contactApplications = sqliteTable('contact_applications', {
  contactId: integer('contact_id').notNull().references(() => contacts.id),
  applicationId: integer('application_id').notNull().references(() => applications.id),
  linkedAt: integer('linked_at', { mode: 'timestamp' }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.contactId, t.applicationId] }),
  byContact: index('contact_applications_contact_idx').on(t.contactId),
  byApplication: index('contact_applications_application_idx').on(t.applicationId),
}));

// D-01: dated conversation entries, one-to-many per contact
export const conversations = sqliteTable('conversations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: integer('contact_id').notNull().references(() => contacts.id),
  applicationId: integer('application_id').references(() => applications.id), // nullable — a conversation may not be tied to a specific job yet
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
  channel: text('channel'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
});
```
`[CITED: orm.drizzle.team/docs/indexes-constraints — composite primary key + per-column indexes on join tables]`

## Lookup Tables (D-07 extensibility, D-05 vocabulary)

```typescript
export const roleTypes = sqliteTable('role_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull().unique(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});
// Seeded: Product Management, Strategy, Chief of Staff, Other (D-07)
// Adding a new role type later = one INSERT, zero migrations — satisfies D-07's
// "extensible without a migration" requirement directly.

export const stages = sqliteTable('stages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull().unique(),
  isTerminal: integer('is_terminal', { mode: 'boolean' }).notNull().default(false),
  outcomeLabel: text('outcome_label'), // e.g. Rejected stage -> outcome 'Rejected'; Interview stage -> outcome null (still Active)
});
// Seeded: Saved, Applied, Screen, Interview, Offer, Rejected, Ghosted, Withdrawn (D-05)
// D-05 explicitly frames stages as "a vocabulary, not a rigid linear enum enforced
// by the schema" — this table is exactly that: a reference list the app validates
// against, not a SQLite CHECK/ENUM constraint that would need a migration to extend.

export const sources = sqliteTable('sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull().unique(),
});
// Seeded: Handshake, Company site / ATS, Referral, LinkedIn, Job board / Other (D-06)
```

## Structural-Only Tables Per Phase Boundary (review queue, dead-letter)

CONTEXT.md's Phase Boundary explicitly lists "the fail-loud tables (review queue, dead-letter)" alongside the entity tables as in-scope for Phase 1, even though the corresponding behavioral requirements (REL-01, REL-02) map to Phase 3 in REQUIREMENTS.md's traceability table. Per ARCHITECTURE.md's suggested build order and SUMMARY.md's Phase 1 "Delivers" list, this is intentional: define the tables now (structurally empty, no write path yet) so Phase 3 never needs a schema migration to start using them.

```typescript
export const reviewQueue = sqliteTable('review_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceMessageId: text('source_message_id'),
  candidateApplicationId: integer('candidate_application_id').references(() => applications.id),
  confidence: real('confidence'),
  status: text('status').notNull().default('pending'), // pending/confirmed/reassigned/rejected
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
});

export const deadLetter = sqliteTable('dead_letter', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceMessageId: text('source_message_id'),
  rawPayload: text('raw_payload'),
  failedStage: text('failed_stage'), // classify/extract/resolve
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
});
```
No write path, no UI, and no test coverage is expected for these two tables in Phase 1 beyond "the migration creates them successfully" — full behavior is Phase 3 scope.

## Demo / Real Data-Source Swap (DEMO-01, DEMO-02, DEMO-03)

```typescript
// src/db/client.ts
import 'server-only';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'node:path';

const mode = process.env.DASHBOARD_MODE; // 'demo' | 'real' — NO DEFAULT: fail loud if unset
if (mode !== 'demo' && mode !== 'real') {
  throw new Error(`DASHBOARD_MODE must be 'demo' or 'real', got: ${mode}`);
}

const dbPath = path.join(process.cwd(), 'data', mode === 'demo' ? 'demo.sqlite' : 'real.sqlite');

declare global {
  var __dashboardDb: ReturnType<typeof drizzle> | undefined;
}

function createClient() {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  return drizzle(sqlite, { schema });
}

// globalThis-cached singleton survives Next.js dev-mode hot reload without
// spawning duplicate file handles/locks on the same SQLite file
export const db = globalThis.__dashboardDb ?? (globalThis.__dashboardDb = createClient());
```

- **No code path can mix real and demo data (D-13):** `mode` is read exactly once, at module load, in exactly one file. Every other module imports `db` from this file and never touches `process.env.DASHBOARD_MODE` or constructs its own connection.
- **Fail loud, not silent default:** an unset/misspelled `DASHBOARD_MODE` throws immediately at startup rather than quietly defaulting to one mode — consistent with the project's stated reliability philosophy (PROJECT.md) and prevents the exact "which file is this actually reading" ambiguity D-13 is designed to eliminate.
- **`.gitignore` (must exist before the first commit that creates `data/`):**
  ```
  data/*.sqlite
  data/*.sqlite-*
  .env*
  ```
  Per PITFALLS.md Pitfall 9, this needs to exist *before* any code that could accumulate real data, not retroactively — Phase 1 is exactly that "before" point, since Phase 2 (manual capture) starts writing real records into `real.sqlite` immediately after this phase ships.
- **Seed generation (`src/demo/seed/seed.ts`, run via `tsx src/demo/seed/seed.ts` / `npm run db:seed:demo`):** applies migrations to `data/demo.sqlite` fresh, then inserts the ~15-20 invented company fixtures (D-12) spanning every stage. The fixture data lives in a versioned `.ts` file, not a committed binary `.sqlite` — regenerating demo data is `rm data/demo.sqlite && npm run db:seed:demo`, which is also the natural way to keep demo data in sync as the schema evolves.
- **Verifying separation is structural, not a filter:** the seed script must never read from `real.sqlite` or accept any real input — it only ever inserts literal, hardcoded invented data (D-12's explicit requirement that demo companies are never real companies).

## Migrations & Project Scaffold (§7)

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: './data/real.sqlite' }, // drizzle-kit itself only ever targets the real schema shape; demo gets the same migrations applied programmatically
});
```
`[CITED: orm.drizzle.team/docs/kit-overview]`

**Workflow:**
1. `npx drizzle-kit generate` — diffs `schema.ts` against the last snapshot, writes a new SQL file under `drizzle/`.
2. `npx drizzle-kit migrate` (or a programmatic runner using `drizzle-orm/better-sqlite3/migrator`'s `migrate()` function pointed at `./drizzle`) applies pending migrations to whichever `.sqlite` file is targeted — run once for `real.sqlite` (via the normal app startup or an explicit `npm run db:migrate`) and once inside the seed script for `demo.sqlite`, so both files always have an identical schema.
3. Never hand-edit a generated migration file after it's been applied to any real data — standard Drizzle practice, same as any SQL migration tool.

**package.json scripts:**
```json
{
  "scripts": {
    "dev": "next dev",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed:demo": "tsx src/demo/seed/seed.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Windows-specific note (see Environment Availability for the verified blocker):** `better-sqlite3` requires either Visual Studio Build Tools (Desktop development with C++ workload) installed before `npm install`, or substituting `drizzle-orm/node-sqlite`. Resolve this *before* running `npm install` for the first time on this machine — it is not something that "sometimes works," it was directly tested and failed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Current-stage derivation | A custom SQL trigger recomputing on insert | A plain TypeScript function called inside the same transaction as the insert | Triggers are harder to unit-test and debug than a typed function; at this write volume there's no performance reason to push the logic into SQLite itself |
| Idempotency bookkeeping | An app-level "have I seen this message ID before" cache/set | The database's own `UNIQUE` constraint + `ON CONFLICT DO NOTHING` | The database is the single source of truth for what's already been written — a parallel in-memory cache can drift or be lost on restart |
| Company name matching | Fuzzy string matching (Levenshtein/Jaro-Winkler) in Phase 1 | A small, user-editable alias table | At a few dozen companies, exact-match-via-alias is both simpler and more reliable than fuzzy logic; fuzzy matching is explicitly a Phase 3+ concern once real extracted data exists to tune thresholds against (per PITFALLS.md) |
| Override conflict resolution | Drizzle's `onConflictDoUpdate` on a composite key | Explicit read-then-write in a transaction | Documented SQLite/Drizzle flakiness on composite-key upserts; a plain conditional is simpler and fully reliable at this volume |
| Unique ID generation | `nanoid`/UUID generation and validation | `INTEGER PRIMARY KEY AUTOINCREMENT` | SQLite's rowid autoincrement is free, simpler, and doubles as an ordering tiebreaker — no reason to add a dependency for uniqueness a single local file already guarantees |

**Key insight:** every "don't hand-roll" item above is really the same lesson restated: at this project's actual data volume (single user, dozens of companies, ~8-15 events/week), the correct engineering choice is almost always the *simpler* mechanism the database or the standard library already provides, not a more sophisticated one built to anticipate scale this project will never reach. This mirrors PITFALLS.md's Pitfall 10 (over-engineering) applied specifically to the schema layer.

## Common Pitfalls

### Pitfall 1: Ordering `status_events` by insertion order instead of `occurred_at`
**What goes wrong:** If the recompute query sorts by `id` (or omits an explicit `ORDER BY` and relies on default rowid order), an out-of-order-processed rejection-before-confirmation scenario silently produces the wrong current stage — the exact failure DATA-03 exists to prevent.
**Why it happens:** `id ASC` "looks like" chronological order during normal development/testing (where events are naturally inserted in real-time order), so the bug is invisible until a real out-of-order ingestion happens in Phase 3.
**How to avoid:** Always `ORDER BY occurred_at ASC, id ASC` (id only as a tiebreak for same-timestamp events), and write the out-of-order unit test (§Pattern 2) as a required Phase 1 test, not an optional one.
**Warning signs:** Any query touching `status_events` for derivation purposes that doesn't explicitly reference `occurred_at` in its `ORDER BY`.

### Pitfall 2: Treating the override table's composite unique index as a safe `onConflictDoUpdate` target
**What goes wrong:** A documented Drizzle/SQLite issue (#2998) means `onConflictDoUpdate` on `(applicationId, fieldName)` can silently misbehave.
**How to avoid:** Use the explicit read-then-write transaction pattern shown in Pattern 3, not a composite-key upsert.

### Pitfall 3: Assuming `better-sqlite3` "just installs" on Windows
**What goes wrong:** `npm install` fails with a `node-gyp`/Visual Studio error partway through Phase 1 setup, blocking all further work.
**Why it happens:** `better-sqlite3`'s install script always runs `node-gyp rebuild` with no prebuilt-binary fallback attempt for this platform/Node version combination (verified directly on this machine — see Environment Availability).
**How to avoid:** Resolve the Visual Studio Build Tools gap (or switch to `drizzle-orm/node-sqlite`) as the very first task of Phase 1, before any schema code is written.
**Warning signs:** `npm install` output containing `gyp ERR! find VS`.

### Pitfall 4: A demo seed script that filters real data instead of generating synthetic data
**What goes wrong:** Demo mode built from a lightly-redacted export of real applications instead of fully invented companies — defeats the purpose of D-12/D-13 and risks exposing real job-search data in a public repo.
**How to avoid:** The seed script must only ever read its own hardcoded fixture file; it should have no code path that can query `real.sqlite` at all (not even accidentally, since it uses a hardcoded `demo.sqlite` path, not the shared `db` client).

### Pitfall 5: Forgetting `.gitignore` before `data/` exists
**What goes wrong:** The first `real.sqlite` file created during Phase 2 development gets committed before anyone thinks to gitignore it, and it's now in git history (this is a public/portfolio repo per PROJECT.md).
**How to avoid:** Add the `.gitignore` entries in this phase, as part of the scaffold, before `data/real.sqlite` is ever created by any script or test — do not defer this to "before making the repo public."

## Code Examples

### Minimal liveness path (walking-skeleton contingency)

If the plan includes a thin end-to-end slice to prove the stack runs before Phase 2's real UI work, the smallest viable version is one server-only DB read exposed through one route:

```typescript
// src/app/api/health/route.ts
import { db } from '@/db/client';
import { applications } from '@/db/schema';
import { sql } from 'drizzle-orm';

export async function GET() {
  const [{ count }] = db.select({ count: sql<number>`count(*)` }).from(applications).all();
  return Response.json({ ok: true, applicationCount: count });
}
```
`npm run dev` then serving `GET /api/health` and returning `{ ok: true, applicationCount: 0 }` (or `20` against the seeded demo DB) is sufficient proof that Next.js, the Drizzle client, and the chosen SQLite driver are wired correctly end-to-end. This is a contingency item, not a required Phase 1 deliverable — do not expand it into real UI.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `better-sqlite3` as the only embedded SQLite option for Node | Node's built-in `node:sqlite` (`DatabaseSync`) is now a viable zero-native-compile alternative, with first-class `drizzle-orm/node-sqlite` support | Node 22.5+ (experimental), confirmed working here on Node 24.14.1 | Removes the Windows native-toolchain dependency entirely if adopted instead of `better-sqlite3` |
| Drizzle SQLite views fully managed like other schema objects | Views are ORM-side only; not yet part of `drizzle-kit generate`/`db push` | Current as of `drizzle-orm@0.45.x`/`drizzle-kit@0.31.x` (verified this session) | Directly shaped this phase's recommendation to use materialized columns instead of a view |

**Deprecated/outdated:** None specific to this phase's stack beyond the above — the STACK.md/ARCHITECTURE.md recommendations remain current as verified this session.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `node:sqlite`'s `DatabaseSync` is stable enough for production use despite Node's own "experimental" label | Environment Availability / Alternatives Considered | If Node changes its API before a stable release, the fallback driver could require code changes; low risk at this project's scope since it's a single local file, easy to swap back to `better-sqlite3` once VS Build Tools are installed |
| A2 | The Phase Boundary's inclusion of `review_queue`/`dead_letter` tables means "structural stub only," not "fully implemented" in Phase 1 | Structural-Only Tables section | If the user actually intended fuller implementation now, this under-scopes those two tables — recommend confirming this interpretation with the user/planner before treating them as pure stubs |
| A3 | An `INTEGER PRIMARY KEY AUTOINCREMENT` id is an acceptable substitute for the "unique source message identifier" language in D-10 (which refers to `source_message_id`, a separate column, not the row's own primary key) | Pattern 1 | None — D-10 is about the message ID column, which is implemented as intended; flagged only because the schema uses autoincrement PKs pervasively and a reader should not confuse the two concepts |

**If this table is empty:** N/A — see above; all three are low-risk assumptions, not compliance/security/retention judgment calls.

## Open Questions

1. **Should `review_queue`/`dead_letter` get any write-path code in Phase 1, or truly just the table definitions?**
   - What we know: CONTEXT.md's Phase Boundary text lists them alongside entity tables; REQUIREMENTS.md's traceability table maps their behavioral requirements (REL-01/REL-02) to Phase 3.
   - What's unclear: whether "the fail-loud tables... exist correctly" in the Phase 1 goal statement implies any CRUD helper functions now, or purely the migration.
   - Recommendation: scope Phase 1 to migration-only for these two tables (as this research assumes — A2 above) unless the planner/user says otherwise; this keeps Phase 1's actual test surface focused on DATA-01→07 and DEMO-01→03, which is what the roadmap's success criteria (ROADMAP.md Phase 1, 5 items) actually enumerate.

2. **Resolve the Visual Studio Build Tools gap or switch drivers?**
   - What we know: `better-sqlite3` (the locked STACK.md driver) cannot currently install on this machine; `drizzle-orm/node-sqlite` was verified working with zero setup.
   - What's unclear: whether the user wants to invest in installing VS Build Tools (one-time, ~10-15 min, unblocks the originally locked driver) or adopt `node:sqlite` now (zero setup, but Node itself calls the API experimental).
   - Recommendation: surface this as an explicit first-task decision at plan time — likely a `checkpoint:human-verify` or a direct question to the user — rather than silently picking one, since it revises a STACK.md-locked decision either way (installing new build tooling vs. swapping the driver).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v24.14.1 | — |
| npm | Package manager | ✓ | 11.11.0 | — |
| Python | node-gyp build dependency | ✓ | 3.12.10 | — |
| git | Version control | ✓ | 2.53.0.windows.2 | — |
| Visual Studio Build Tools (C++ workload) | `better-sqlite3` native compile | ✗ [VERIFIED: attempted `npm install better-sqlite3` on this machine, failed with `gyp ERR! find VS`] | — | `drizzle-orm/node-sqlite` (Node's built-in `node:sqlite`) — [VERIFIED: tested directly, works with zero native compilation on this same machine] |

**Missing dependencies with no fallback:** none — the one missing dependency (Visual Studio Build Tools) has a verified working fallback.

**Missing dependencies with fallback:** Visual Studio Build Tools → `drizzle-orm/node-sqlite`. This is the single most important environment finding in this research: **do not assume `better-sqlite3` will simply install** on this machine as currently configured. Either install Visual Studio Build Tools (Desktop development with C++ workload) before Phase 1 begins, or the plan should adopt the `node:sqlite` driver from the start.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.10 [VERIFIED: npm registry] |
| Config file | none yet — Wave 0 gap |
| Quick run command | `npx vitest run tests/domain/<file>.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | Inserting an application captures all dimensions in one record | unit | `npx vitest run tests/domain/applications.test.ts -t "captures all dimensions"` | ❌ Wave 0 |
| DATA-02 | Status changes stored only as new event rows, never overwritten | unit | `npx vitest run tests/domain/events.test.ts -t "append-only"` | ❌ Wave 0 |
| DATA-03 | Current stage correct when events arrive out of real-world order | unit | `npx vitest run tests/domain/projections.test.ts -t "out-of-order"` | ❌ Wave 0 |
| DATA-04 | Two aliases resolve to one company entity | unit | `npx vitest run tests/domain/companies.test.ts -t "alias resolves"` | ❌ Wave 0 |
| DATA-05 | Contact linked to multiple jobs, dates preserved; dated conversations | unit | `npx vitest run tests/domain/contacts.test.ts -t "multi-job linkage"` | ❌ Wave 0 |
| DATA-06 | Re-inserting same message ID never duplicates a record/event | unit | `npx vitest run tests/domain/events.test.ts -t "idempotent insert"` | ❌ Wave 0 |
| DATA-07 | Manual override stored separately, wins over derived value, survives a simulated re-derive | unit | `npx vitest run tests/domain/overrides.test.ts -t "override precedence"` | ❌ Wave 0 |
| DEMO-01 | Toggling `DASHBOARD_MODE` swaps in the seeded dataset | unit | `npx vitest run tests/db/client.test.ts -t "demo mode seeded data"` | ❌ Wave 0 |
| DEMO-02 | No query can return real.sqlite rows while in demo mode or vice versa | unit | `npx vitest run tests/db/client.test.ts -t "structural isolation"` | ❌ Wave 0 |
| DEMO-03 | Migrations apply identically to both demo.sqlite and real.sqlite | unit | `npx vitest run tests/db/migrate.test.ts -t "schema parity"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <changed test file>`
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` — no config exists yet; needs a `test` environment (node, not jsdom — no DOM needed for these data-layer tests)
- [ ] `tests/helpers/db.ts` — a shared test fixture that creates a fresh temp/in-memory SQLite instance (`:memory:` works for both `better-sqlite3` and `node:sqlite`), runs migrations against it, and tears it down per test — needed before any of the tests above can run
- [ ] Framework install: `npm install -D vitest@4.1.10`
- [ ] All ten test files listed above — none exist yet (greenfield project)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Not applicable this phase — no auth surface exists yet (Gmail OAuth is Phase 3) |
| V3 Session Management | No | Not applicable — no session concept in a local single-user data layer |
| V4 Access Control | No | Not applicable — single local user, no access-control layer over the data |
| V5 Input Validation | Yes | `zod` schemas validating every write-path input (event payloads, override `fieldName`/`value`, contact fields) before they reach Drizzle |
| V6 Cryptography | No | Not applicable this phase — no credentials or secrets are stored by this schema. Explicit constraint for this phase: do not add any credential-shaped column now; Gmail OAuth token storage is Phase 3's concern and should get its own explicit design then |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| SQL injection via string-concatenated queries | Tampering | Drizzle's parameterized query builder is used everywhere; if raw SQL is ever needed (e.g., a hand-written migration), use `sql\`...\`` tagged templates with bound parameters, never string concatenation |
| Arbitrary `field_name` values in the `overrides` table enabling unintended column targeting at the application layer | Tampering | `fieldName` is validated against a fixed allow-list of known correctable fields in the `zod` schema at the write boundary, not passed through unchecked from any future UI input |
| Real personal job-search data (rejections, compensation discussions) leaking into a public portfolio repo | Information Disclosure | Structural demo/real file separation (D-13) + `.gitignore` established in this phase, before `data/real.sqlite` can accumulate any real record (Phase 2 is the first phase that writes real data) |
| Duplicate SQLite connections/file handles from Next.js dev-mode hot reload causing lock contention or write conflicts | Tampering / Availability | `globalThis`-cached singleton client (§Demo / Real Data-Source Swap) — a single connection per process, survives hot reload |

## Sources

### Primary (HIGH confidence)
- Direct verification on this machine: `npm install better-sqlite3` failure (Visual Studio Build Tools missing) and `node:sqlite` (`DatabaseSync`) working with zero native compilation — both executed and observed directly during this research session
- `npm view <package> version` against the live npm registry for every version number cited in Standard Stack and Package Legitimacy Audit
- `gsd-tools query package-legitimacy check` — legitimacy verdicts for all listed packages

### Secondary (MEDIUM confidence)
- [orm.drizzle.team/docs/insert](https://orm.drizzle.team/docs/insert) — `onConflictDoNothing`/`onConflictDoUpdate` semantics
- [orm.drizzle.team/docs/kit-overview](https://orm.drizzle.team/docs/kit-overview) — `drizzle-kit generate`/`migrate` workflow
- [orm.drizzle.team/docs/indexes-constraints](https://orm.drizzle.team/docs/indexes-constraints) — composite indexes, foreign keys
- [orm.drizzle.team/docs/relations](https://orm.drizzle.team/docs/relations) — join table / many-to-many patterns
- [orm.drizzle.team — Views (via mintlify mirror)](https://www.mintlify.com/drizzle-team/drizzle-orm/schema/views) — confirms SQLite views are ORM-side only, not migration-managed
- [github.com/drizzle-team/drizzle-orm issue #2998](https://github.com/drizzle-team/drizzle-orm/issues/2998) — `onConflictDoUpdate` composite-key flakiness on SQLite
- [github.com/WiseLibs/better-sqlite3 issue #355](https://github.com/WiseLibs/better-sqlite3/issues/355) — Windows prebuild status discussion
- `.planning/research/ARCHITECTURE.md`, `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`, `.planning/research/FEATURES.md`, `.planning/research/SUMMARY.md` — project-level research directly read and applied throughout this document

### Tertiary (LOW confidence)
- General WebSearch snippets on Next.js App Router singleton DB client patterns (used for the `globalThis` caching approach, a widely-documented but not single-sourced community pattern)

## Metadata

**Confidence breakdown:**
- Standard stack (versions, legitimacy): HIGH — every version and legitimacy verdict confirmed directly via `npm view`/legitimacy seam this session
- Environment availability (Windows build blocker): HIGH — verified by directly running the failing install and the working fallback on this machine, not inferred
- Architecture (event/projection/override/alias patterns): MEDIUM-HIGH — cross-checked against official Drizzle docs via WebSearch; the specific combination (materialized-column-over-view decision) is this research's own synthesis, grounded in a verified Drizzle limitation
- Pitfalls: MEDIUM-HIGH — directly inherited from `.planning/research/PITFALLS.md` (already cross-checked in prior project research) plus one new, directly-verified Windows-specific pitfall

**Research date:** 2026-07-22
**Valid until:** 30 days (stable domain — SQLite/Drizzle schema patterns and locked project decisions do not move quickly; the Windows environment finding should be re-verified if this machine's toolchain changes)
