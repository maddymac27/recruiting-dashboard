# Phase 1: Schema + Demo Mode Foundation - Context

**Gathered:** 2026-07-22
**Status:** Ready for planning

<domain>
## Phase Boundary

The persistence foundation — event-sourced status history, entity tables (applications, companies with aliases, contacts, conversations), correction overrides, and the fail-loud tables (review queue, dead-letter), plus structural demo/real data separation. No Gmail ingestion in this phase (that is Phase 3). This phase is verified primarily at the data layer (inserts, derivations, constraints behave correctly).

**Walking-skeleton amendment (user decision, 2026-07-22):** Because the project is Vertical MVP mode, Phase 1 ALSO includes a razor-thin end-to-end liveness slice — project scaffold, migrations that run, ONE trivial Next.js page that reads a single value (e.g. a count) from the DB via Drizzle, `npm run dev` serving it, and the demo/real DB swap working — to prove the whole stack is wired together before features are built on it. This is a liveness proof, NOT real UI features: the pipeline board, job detail, and all real screens remain Phase 2. The earlier "no UI at all in Phase 1" framing is superseded by this thin-slice exception; real feature UI is still deferred.

Covers requirements: DATA-01 through DATA-07, DEMO-01 through DEMO-03.
</domain>

<decisions>
## Implementation Decisions

### Contacts & Conversations (discussed with user)
- **D-01:** Conversations are recorded as **dated entries** — each touchpoint is its own timestamped record (date, channel, notes), not a single running-notes field. This matches the event-sourced spirit of the project and is what makes "when did I last talk to them / who has gone quiet" answerable. A contact therefore has a one-to-many relationship to conversation/interaction records.
- **D-02:** Fields to capture per contact: **name, role/title, channel (email/call/LinkedIn/etc.), notes, email address, LinkedIn URL, relationship type (recruiter / hiring manager / referral / peer / etc.), and how-you-met/source (coffee chat, alumni, cold, mutual connection).** All are captured; most are optional at the field level.
- **D-03:** A contact is modeled as belonging to **the job's company** (the simpler model), NOT given its own separate employer field in this phase. The user chose simplicity. The **relationship type** tag (e.g. "recruiter") is what distinguishes an external/agency recruiter at a glance, partially covering the agency case without a structural employer field. See Deferred Ideas for the fuller agency-employer distinction, which belongs in Phase 3 entity resolution.
- **D-04:** Email address + LinkedIn URL on a contact double as de-duplication signals for the same person appearing across multiple jobs (supports the DATA-05 contact-spans-multiple-jobs requirement).

### Domain Vocabulary — locked defaults (user reviewed and approved)
The user delegated these to Claude's judgment, then explicitly reviewed and approved the proposed values. They are un-retrofittable once data accumulates, so they are treated as locked decisions, not loose defaults.

- **D-05 — Pipeline stages:** `Saved → Applied → Screen → Interview → Offer`, plus terminal/branch states `Rejected`, `Ghosted` (a.k.a. No-response, auto-flagged after a silence threshold in Phase 5), and `Withdrawn` (user pulled out). Because stages are stored as append-only events, an application can move backward, skip stages, or revisit a stage — the stage list is a vocabulary, not a rigid linear enum enforced by the schema.
- **D-06 — Source values:** `Handshake`, `Company site / ATS`, `Referral`, `LinkedIn`, `Job board / Other`. Matches the user's actual application routes captured during project questioning.
- **D-07 — Role-type tags:** `Product Management`, `Strategy`, `Chief of Staff`, `Other`. Derived from the user's actual target roles. Must be **extensible** — the user can add role types later without a migration (favor a lookup/reference approach over a hard enum where practical).
- **D-08 — "Ghosted" is a first-class stage AND a derivable condition.** The schema must let an application rest in a Ghosted state, but the *auto-flagging* logic (silence threshold) is Phase 5. Phase 1 only needs to ensure the event/derivation model can represent and later compute it. Each application should carry enough timing data (last inbound event timestamp) for Phase 5 to compute staleness without a schema change.

### Event-Sourcing & Correction model (from initialization decisions — locked)
- **D-09:** Status changes are stored **only** as new dated event rows. No code path may update a single current-status column in place. Current stage is a **derived projection** computed from events ordered by real-world event time (`occurred_at`), so out-of-order ingestion (e.g., a rejection processed before the confirmation) resolves to the correct current stage.
- **D-10:** Each ingested message carries a **unique source message identifier** with a uniqueness constraint, so re-syncing the same email never creates a duplicate record or duplicate event (idempotency lives at the message-ID level, threaded through the events table — per ARCHITECTURE.md).
- **D-11:** User **corrections/overrides are stored in a separate structure** that takes precedence over parser-derived values at read time. A re-sync or a parser change must never overwrite a manual fix. (Note: the override *persistence-across-resync* behavior, CAP-03, is verified in Phase 3 when a real parser exists; Phase 1 provides the schema for it.)

### Demo / Real separation (reviewed and approved)
- **D-12 — Demo dataset shape:** ~15–20 **invented-but-plausible** companies (made-up names, never real companies, so the demo never implies the user actually applied somewhere), spread across every pipeline stage — a couple mid-interview, one offer, several ghosted, some rejected, some saved-not-applied — with a handful of contacts and dated conversations attached. Enough density that the dashboard looks alive on a screen-share.
- **D-13 — Structural separation:** Demo mode is a **data-source swap** (a separate SQLite database file selected at startup / by mode), NOT a code branch or a flag threaded through queries. No code path may be capable of mixing real and demo data. This also guarantees real job-search data and secrets can never appear in a demo or in a public/portfolio repo.

### Stack Amendment — Database Driver (user decision, 2026-07-22)
- **D-14 — Use Node's built-in `node:sqlite` via `drizzle-orm/node-sqlite`, NOT `better-sqlite3`.** Phase 1 research verified on this actual Windows 11 machine that `better-sqlite3@13` cannot `npm install` (no Visual Studio C++ Build Tools; the package has no Windows prebuild fallback, so `node-gyp rebuild` always runs and fails). `node:sqlite` was tested working with zero native compilation and is stable in the installed Node v24.14.1. This **supersedes the `better-sqlite3` choice in STACK.md.** Drizzle abstracts the driver, so all researched schema patterns (event projection, idempotency, overrides, aliases) still apply unchanged. Requires Node ≥ 24 (documented as a project prerequisite).

### Scope Resolution — Fail-Loud Tables (resolves research Assumption A2)
- **D-15 — `review_queue` and `dead_letter` are SCHEMA-ONLY stubs in Phase 1.** Their tables/columns are created and migratable, but no write-path or surfacing logic is built here. The actual fail-loud population and UI (REL-01→04) are Phase 3, per the roadmap. Phase 1 only guarantees the tables exist with the right shape so Phase 3 can write to them without a migration.

### Claude's Discretion
The user explicitly scoped their involvement to domain vocabulary and the contact model, and delegated all of the following to Claude as the builder:
- Table/schema design, column types, indexing, and how the event→projection derivation is physically implemented (view vs. computed vs. materialized) — planner/researcher decide, guided by STACK.md (better-sqlite3 + Drizzle) and ARCHITECTURE.md.
- How company aliases (DATA-04) are structured (alias table vs. normalized key).
- Migration setup and the seed/demo data generation mechanism.
- Exact override-table shape implementing D-11.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level scope & requirements
- `.planning/PROJECT.md` — Core value (stays accurate without manual updates), the fail-loudly constraint, and locked key decisions
- `.planning/REQUIREMENTS.md` — DATA-01→07 and DEMO-01→03 requirement text and IDs
- `.planning/ROADMAP.md` §"Phase 1" — phase goal and 5 success criteria; also the "Open Design Risk" (REL-04) note carried forward

### Research (directly shapes this schema)
- `.planning/research/ARCHITECTURE.md` — **most important for this phase.** Concrete patterns for: append-only events + derived projection, out-of-order handling via `occurred_at`, message-ID idempotency, the separate `overrides` table with read-time precedence, company alias/normalization, and the demo-as-separate-DB-file approach. Includes schema/code examples and the build-order rationale.
- `.planning/research/STACK.md` — locked stack: better-sqlite3 + Drizzle ORM, TypeScript/Next.js. Note the shared-Zod-schema recommendation so the future regex path and LLM-fallback path (Phase 3) produce identically-shaped validated records.
- `.planning/research/PITFALLS.md` — silent data loss patterns, the agency-vs-employer entity trap, secrets/token files never committed (portfolio repo is public-facing).
- `.planning/research/FEATURES.md` — why "no response ever" must be a first-class state (D-05/D-08), and the lightweight contact-spans-multiple-jobs join model (D-04).
- `.planning/research/SUMMARY.md` — the consolidated "must exist in initial schema" list and reconciled build order.

No external ADRs or specs beyond the above — requirements are fully captured in `.planning/` and the decisions here.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project. No code, no codebase maps yet. This phase establishes the initial schema, migrations, and data-access layer that every later phase builds on.

### Established Patterns
- None established yet. This phase *sets* the foundational patterns: event-sourced writes, derived current-state, override precedence, and the demo/real data-source swap. Later phases must conform to these.

### Integration Points
- Phase 2 (Manual Capture + Core UI) reads and writes through the data layer built here — it is the first consumer. Design the data-access surface so a UI can drive it without touching raw SQL.
- Phase 3 (Ingestion) writes events and overrides through the same layer; the message-ID uniqueness (D-10) and override structure (D-11) are the contract it depends on.
</code_context>

<specifics>
## Specific Ideas

- Demo companies must be **invented names**, never real companies — a deliberate choice so a screen-share or public repo never implies real applications (D-12).
- Role-type tags should be **user-extensible without a migration** (D-07).
- The relationship-type tag on contacts (recruiter / hiring manager / referral / peer) is the user's chosen lightweight substitute for full agency-employer modeling (D-03).
</specifics>

<deferred>
## Deferred Ideas

- **Full agency/staffing-firm employer modeling for contacts** — giving a contact its own employer entity distinct from the job's company. The user chose the simpler "contact belongs to job's company" model for now. This becomes relevant in **Phase 3 (entity resolution)**, where ARCHITECTURE.md and PITFALLS.md both flag agency recruiters applying on behalf of clients as a real matching trap. Revisit there, not here.
- **Ghosted auto-flagging / staleness thresholds** — the *computation* of when something is "gone quiet" is **Phase 5 (DASH-03)**. Phase 1 only guarantees the schema can represent the state and carries the timing data needed to compute it later (D-08).
- **Override-survives-resync verification (CAP-03)** — the schema for overrides is built here (D-11), but the behavioral guarantee is verified in **Phase 3** once a real parser exists to override.

No scope creep occurred — discussion stayed within the schema-foundation boundary.
</deferred>

---

*Phase: 1-Schema + Demo Mode Foundation*
*Context gathered: 2026-07-22*
