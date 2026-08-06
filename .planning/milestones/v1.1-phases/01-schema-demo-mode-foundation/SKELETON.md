# Walking Skeleton — Recruiting Dashboard

**Phase:** 1
**Generated:** 2026-07-22

## Capability Proven End-to-End

> One sentence: the smallest user-visible capability that exercises the full stack.

Running `npm run dev` serves one Next.js page that reads a single real value (the application count) from a SQLite file through Drizzle, where the file is chosen once at startup by `DASHBOARD_MODE` — proving that Next.js + Drizzle + Node's built-in `node:sqlite` driver + a migration that ran + the demo/real data-source swap are all wired together before any feature is built on them.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript | Locked in STACK.md; one process serves the UI and hosts the data-access layer + future Gmail sync. No separate backend. |
| Runtime prerequisite | Node ≥ 24 | Required by the `node:sqlite` driver (D-14). Enforced via `package.json` `engines`. |
| Database driver | Node built-in `node:sqlite` (`DatabaseSync`) via `drizzle-orm/node-sqlite` — **NOT** `better-sqlite3` | D-14: `better-sqlite3@13` cannot `npm install` on this Windows machine (no VS C++ Build Tools; no prebuild fallback). `node:sqlite` verified working with zero native compilation on Node v24.14.1. Drizzle abstracts the driver, so all researched schema patterns apply unchanged. |
| ORM / migrations | Drizzle ORM 0.45.x + drizzle-kit 0.31.x | Schema-as-code; `drizzle-kit generate` diffs the schema into SQL migration files; migrations applied programmatically via `drizzle-orm/node-sqlite/migrator`. |
| Current-stage derivation | Materialized projection columns on `applications`, recomputed on write — **NOT** a SQL view | RESEARCH §Pattern 2: drizzle-kit does not manage views, which would fragment the migration story. A recompute function stays inside normal `drizzle-kit generate`/`migrate` and is directly unit-testable (D-09). |
| Status storage | Append-only `status_events` rows only; no in-place status column | D-09 / DATA-02 / DATA-03. Current stage derived by ordering on `occurred_at ASC, id ASC` so out-of-order ingestion resolves correctly. |
| Correction model | Separate `overrides` table; override wins at read time via app-level read-merge; explicit read-then-write transaction (never composite-key `onConflictDoUpdate`) | D-11 / DATA-07. Documented SQLite composite-key upsert flakiness (Drizzle #2998). |
| Company aliasing | `companies` + `company_aliases` alias table with a normalized-key helper column | D-04 / DATA-04. Alias table over fuzzy matching (PITFALLS Pitfall 6). |
| Demo/real separation | Two SQLite files under `data/`; the path is resolved **once** at client init from `DASHBOARD_MODE` (no default — fail loud); one server-only client singleton | D-13 / DEMO-01→03. No code path can mix real and demo data. `data/*.sqlite` + `.env*` gitignored before any real data exists. |
| Test runner | vitest 4.x, node environment (no DOM) | Data-layer phase; tests run against an in-memory `node:sqlite` DB with migrations applied. |
| Directory layout | `src/db/` (schema, client, migrate, paths, validation), `src/domain/` (write/read functions), `src/demo/seed/` (fixtures + seed script), `src/app/` (liveness page + health route), `tests/` mirrors `src/` | RESEARCH §Recommended Project Structure. Keeps append-only writes and projection recompute in visibly separate files so no contributor writes to the projection directly. |

## Stack Touched in Phase 1

- [x] Project scaffold (Next.js, TypeScript, drizzle-kit, vitest, tsx) — plan 01-01
- [x] Routing — one real route (`/` page + `/api/health`) — plan 01-02
- [x] Database — real read (application count on the liveness page) AND real writes (all domain write functions + demo seed) — plans 01-02 through 01-05
- [x] UI — one interactive-tier element: the liveness page rendering a live DB value — plan 01-02
- [x] Deployment — documented local full-stack run command (`npm run dev`) exercising the whole stack — plan 01-02

## Out of Scope (Deferred to Later Slices)

> Anything that is *not* in the skeleton. Explicit, so future phases do not re-litigate Phase 1's minimalism.

- Any real feature UI: the pipeline board, job-detail view, manual add/edit forms, contact logging UI — all Phase 2.
- Gmail OAuth, ingestion, parsers, entity resolution — Phase 3. No credential-shaped column is added in Phase 1 (RESEARCH Security Domain V6).
- Write-path or surfacing logic for `review_queue` / `dead_letter` — Phase 1 ships these as **schema-only stubs** (D-15); population and UI are Phase 3.
- Ghosted auto-flagging / staleness threshold computation — Phase 5. Phase 1 only carries the timing column (`last_inbound_event_at`, D-08).
- Override-survives-resync behavioral verification (CAP-03) — Phase 3, once a real parser exists. Phase 1 provides only the override schema + read-merge.
- Charts, analytics, "what needs me today" — Phase 5.

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 2:** A usable manual tracker — pipeline board, job detail, manual add/edit, contact logging — running on the seeded demo data, driving the Phase 1 data-access layer through a UI.
- **Phase 3:** Real Gmail ingestion for a narrow known sender set, entity resolution, and the fail-loud review queue + dead-letter surfacing (writing to the Phase 1 stub tables), plus override-persists-across-resync.
- **Phase 4:** Automatic daily incremental sync with missed-run catch-up and a full-resync fallback when the cursor expires.
- **Phase 5:** Analytics + "what needs me today" + first-class ghosted/staleness flagging over the accumulated transition-event history.
