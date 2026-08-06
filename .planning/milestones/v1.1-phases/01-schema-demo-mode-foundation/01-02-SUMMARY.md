---
phase: 01-schema-demo-mode-foundation
plan: 02
subsystem: database

tags: [drizzle-orm, node-sqlite, nextjs, typescript, vitest, server-only, app-router]

# Dependency graph
requires:
  - phase: 01-01
    provides: "src/db/schema.ts, src/db/paths.ts (assertMode/resolveDbPath), src/db/migrate.ts (runMigrations), tests/helpers/db.ts (createTestDb)"
provides:
  - "Server-only Drizzle client singleton (src/db/client.ts) that resolves DASHBOARD_MODE exactly once, fails loud on unset/invalid mode, and is the ONLY module permitted to read process.env.DASHBOARD_MODE or construct a node:sqlite connection"
  - "globalThis-cached db + dashboardMode exports surviving Next.js dev-mode hot reload without duplicate file handles"
  - "Walking-skeleton liveness proof: a home page (src/app/page.tsx) and a health route (src/app/api/health/route.ts) both reading a live application count through the single db client"
  - "@types/react + @types/react-dom devDependencies (closing a gap left by 01-01's scaffold — no .tsx file could type-check before this)"
affects: [01-03, 01-04, 01-05, phase-2-manual-capture-core-ui]

# Tech tracking
tech-stack:
  added:
    - "@types/react@^19.2.17, @types/react-dom@^19.2.3 (devDependencies; matches installed react@19.2.8/react-dom@19.2.8)"
  patterns:
    - "Single server-only DB client module (src/db/client.ts) exporting exactly two symbols — db (the Drizzle singleton) and dashboardMode (the already-resolved 'demo'|'real' value) — so no other module ever reads process.env.DASHBOARD_MODE or opens its own connection (D-13)"
    - "globalThis-cached singletons (__dashboardDb, __dashboardMode) surviving Next.js dev-mode hot reload"
    - "drizzle-orm 1.0.0-rc.4 single-object client form: drizzle({ client: sqlite }) — no schema key (that config key was dropped in 1.0.0; relational-query schema would go through a separate relations config, not needed since the domain layer uses the plain query builder)"
    - "Type inferred (not annotated) on the client export so the `$client` escape hatch (drizzle({ client }) returns NodeSQLiteDatabase & { $client: DatabaseSync }) survives for tests that need to close the raw handle"
    - "vi.mock('server-only', () => ({})) in tests/db/client.test.ts — server-only's default export throws unconditionally outside the Next.js RSC bundler's 'react-server' resolve condition, so it must be mocked to test the real client module under vitest"

key-files:
  created:
    - src/db/client.ts
    - src/app/layout.tsx
    - src/app/page.tsx
    - src/app/api/health/route.ts
    - tests/db/client.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Added a second export (dashboardMode) to client.ts beyond the plan's literal db-only framing: the health route's required {mode: ...} field cannot be produced without violating the must-have that only client.ts reads DASHBOARD_MODE, so client.ts resolves and caches the mode once and re-exports it as a plain read-only value (not a per-query switch)."
  - "Added @types/react and @types/react-dom as devDependencies, developer-approved via a package-legitimacy checkpoint before installing (Rule 3 exclusion — package installs require human verification, not silent auto-fix)."
  - "drizzle-orm/drizzle-kit remain pinned at 1.0.0-rc.4, carried forward unchanged from 01-01; drizzle({ client: sqlite }) single-object form used, no schema key (matches the 1.0.0 API, per 01-01's documented decision)."
  - "client.ts includes the same mkdirSync(dirname(dbPath), { recursive: true }) guard as migrate.ts, so a fresh clone importing client.ts (e.g. under test) never fails with a confusing 'unable to open database file' error."

patterns-established:
  - "The DB client module's export surface is a hard boundary: exactly {db, dashboardMode}, enforced by a dedicated test (tests/db/client.test.ts) that imports the real module and asserts Object.keys(...) — any future addition to this surface should re-justify itself against the D-13 structural-isolation intent."

requirements-completed: [DEMO-02, DEMO-03]

coverage:
  - id: D1
    description: "src/db/client.ts reads DASHBOARD_MODE exactly once, in exactly one module, and throws (fail loud) if unset or not 'demo'/'real' — no default"
    requirement: "DEMO-02"
    verification:
      - kind: unit
        ref: "tests/db/client.test.ts#assertMode throws on unset/invalid DASHBOARD_MODE and passes for demo/real"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 checkpoint: DASHBOARD_MODE unset + npm run dev -> HTTP 500, 'Error: DASHBOARD_MODE must be 'demo' or 'real', got: undefined' (assertMode, paths.ts:17) — no silent default"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolveDbPath('demo') and resolveDbPath('real') resolve to two distinct files — no code path can address both stores in a single session (structural isolation)"
    requirement: "DEMO-02"
    verification:
      - kind: unit
        ref: "tests/db/client.test.ts#resolveDbPath('demo') and resolveDbPath('real') resolve to two distinct files (structural isolation, DEMO-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The client module's export surface is exactly {db, dashboardMode} — no per-query mode switch, no separate connection constructor exposed to callers"
    requirement: "DEMO-02"
    verification:
      - kind: unit
        ref: "tests/db/client.test.ts#exposes only db and the resolved dashboardMode — no per-query mode switch, no separate connection constructor"
        status: pass
    human_judgment: false
  - id: D4
    description: "src/db/client.ts begins with import 'server-only' and constructs the connection via node:sqlite's DatabaseSync (not better-sqlite3), guarded by server-only so it can never enter a client bundle"
    requirement: "DEMO-02"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (exits 0, confirms module compiles under the server-only guard)"
        status: pass
      - kind: other
        ref: "manual source inspection: src/db/client.ts line 1 is `import \"server-only\";`; DatabaseSync imported from node:sqlite"
        status: pass
    human_judgment: false
  - id: D5
    description: "npm run dev serves one page rendering a live application count read from SQLite via Drizzle, and GET /api/health returns the same count for the DASHBOARD_MODE-selected file — walking-skeleton liveness proof end-to-end"
    requirement: "DEMO-03"
    verification:
      - kind: manual_procedural
        ref: "Task 3 checkpoint: DASHBOARD_MODE=real npm run db:migrate creates data/real.sqlite (13 tables); npm run dev renders 'Mode: real — Application count: 0'; GET /api/health returns {\"ok\":true,\"mode\":\"real\",\"applicationCount\":0}"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit (exits 0) — page.tsx and route.ts both type-check reading through db/dashboardMode"
        status: pass
    human_judgment: true
    rationale: "Live browser + running dev server verification cannot be performed inside a subagent (no real browser tier); the developer confirmed this directly per VALIDATION.md's designated manual-only checkpoint."

# Metrics
duration: ~20min (agent-active time across two execution segments, excluding the human-verification checkpoint wait)
completed: 2026-07-23
status: complete
---

# Phase 01 Plan 02: Server-Only DB Client + Walking-Skeleton Liveness Summary

**Server-only Drizzle client singleton (globalThis-cached, fail-loud DASHBOARD_MODE resolution) plus a liveness page and /api/health route proving Next.js + Drizzle + node:sqlite + the demo/real swap are wired end-to-end.**

## Performance

- **Duration:** ~20 min agent-active time (two segments, separated by the Task 3 human-verification checkpoint)
- **Started:** 2026-07-22T16:29:05-05:00 (first 01-02 commit)
- **Completed:** 2026-07-23T17:12:52Z (this finalization)
- **Tasks:** 3 (Task 1 TDD, Task 2 auto, Task 3 blocking human-verify checkpoint)
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments
- `src/db/client.ts`: the single server-only module permitted to read `DASHBOARD_MODE` or construct a database connection (D-13). Fails loud (throws via `assertMode`) on unset/invalid mode — no default. Resolves exactly one file path via `resolveDbPath`. globalThis-cached (`__dashboardDb`, `__dashboardMode`) so Next.js dev-mode hot reload never opens a duplicate file handle (T-01-07). `import "server-only"` as the first statement guarantees it can never enter a client bundle (T-01-06).
- The client's export surface is a hard, tested boundary: exactly `{ db, dashboardMode }` — no per-query mode switch, no exposed connection constructor. `dashboardMode` is a plain resolved value (not a switch) added specifically so the health route/page can label output with the active mode without themselves touching `process.env.DASHBOARD_MODE`.
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/api/health/route.ts`: the walking-skeleton liveness slice (SKELETON.md). The home page server-renders the live application count and active mode; `/api/health` returns `{ ok, mode, applicationCount }`. Both read exclusively through the single `db` client — no direct connection construction anywhere else in the app tier.
- Verified end-to-end in a real browser (Task 3 checkpoint, developer-approved): `DASHBOARD_MODE=real npm run db:migrate` created `data/real.sqlite` with all 13 tables; the home page rendered "Mode: real — Application count: 0"; `GET /api/health` returned `{"ok":true,"mode":"real","applicationCount":0}`; running with `DASHBOARD_MODE` unset produced HTTP 500 with `Error: DASHBOARD_MODE must be 'demo' or 'real', got: undefined` — fail-loud confirmed, no silent default.
- Closed a scaffold gap from 01-01: `@types/react`/`@types/react-dom` were never installed, so no `.tsx` file could type-check at all. Installed as devDependencies after a developer-approved package-legitimacy checkpoint.

## Task Commits

Task 1 followed full TDD RED → GREEN, with one follow-up fix commit surfaced while implementing Task 2:

1. **Task 1: Server-only Drizzle client singleton (demo/real swap)** — `2a37955` (test, RED) → `29bd8b0` (feat, GREEN) → `760f97c` (fix: expose `dashboardMode`, needed by Task 2)
2. **Task 2: Liveness page + health route (walking-skeleton E2E)** — `3b6f988` (feat, includes developer-approved `@types/react`/`@types/react-dom` install)
3. **Task 3: Blocking human-verify checkpoint** — no commit (verification-only gate); approved by the developer with evidence recorded above.

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP/REQUIREMENTS update)

## TDD Gate Compliance

Task 1 (`tdd="true"`) followed the required RED → GREEN sequence, confirmed in git log:
- `2a37955` (test) precedes `29bd8b0` (feat) — RED failed with `Cannot find package '@/db/client'` before `src/db/client.ts` existed, then passed after implementation.

No REFACTOR commit was needed (the one post-GREEN adjustment, `760f97c`, added new required behavior — exposing `dashboardMode` — for Task 2, not a behavior-preserving cleanup, so it is classified as a fix commit rather than a refactor).

## Files Created/Modified
- `src/db/client.ts` - server-only Drizzle client singleton; the only module reading `DASHBOARD_MODE`/constructing a connection
- `tests/db/client.test.ts` - fail-loud mode resolution, structural isolation (distinct demo/real paths), and module-surface tests
- `src/app/layout.tsx` - minimal App Router root shell (html/body only)
- `src/app/page.tsx` - server component rendering the live application count + mode
- `src/app/api/health/route.ts` - `GET` returns `{ ok, mode, applicationCount }`
- `package.json` / `package-lock.json` - added `@types/react`, `@types/react-dom` devDependencies

## Decisions Made
- Exposed `dashboardMode` from `client.ts` alongside `db` (see key-decisions in frontmatter) — required to satisfy the health route's `mode` field without violating the single-reader-of-`DASHBOARD_MODE` must-have.
- Kept the exported `db` type inferred (`ReturnType<typeof createClient>`) rather than annotated as `NodeSQLiteDatabase`, preserving the `$client` escape hatch that drizzle 1.0.0-rc.4's `drizzle({ client })` call form returns (needed by tests to close the raw `node:sqlite` handle).
- Used `await db.select(...).from(...)` in both the page and the health route (rather than a synchronous `.all()` call) since drizzle-orm 1.0.0-rc.4 types the node-sqlite select builder generically as awaitable regardless of the underlying sync driver; verified this resolves to the expected `[{ count }]` shape via a throwaway vitest smoke test against `createTestDb()` before committing.
- Mocked `server-only` (`vi.mock("server-only", () => ({}))`) in the client test file — the package throws unconditionally outside Next.js's RSC bundler `"react-server"` resolve condition, so importing the real `client.ts` module under vitest requires this mock.
- drizzle-orm/drizzle-kit versions unchanged at `1.0.0-rc.4` (carried forward from 01-01, per that plan's explicit guidance not to re-pin).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, test-scope] `server-only` throws unconditionally under vitest**
- **Found during:** Task 1 GREEN verification
- **Issue:** `server-only`'s default export throws an `Error` on import unless the bundler-only `"react-server"` resolve condition is active (set by Next.js' RSC bundler, absent under plain Node/vitest) — so any real import of `client.ts` in a test would fail before reaching the test's assertions.
- **Fix:** Added `vi.mock("server-only", () => ({}))` to `tests/db/client.test.ts`, scoped to that test file only.
- **Files modified:** tests/db/client.test.ts
- **Verification:** `npx vitest run tests/db/client.test.ts` — 3/3 pass after the mock; failed with the `server-only` throw before it.
- **Committed in:** `29bd8b0`

**2. [Rule 2 - Missing Critical] Windows EPERM on test cleanup — close the raw handle before removing the file**
- **Found during:** Task 1 GREEN verification
- **Issue:** The module-surface test's `afterAll` tried to `rmSync` the schema-less `data/demo.sqlite` file the test caused `client.ts` to open, but the `node:sqlite` handle was still open, producing `EPERM: Permission denied` on Windows.
- **Fix:** Called `clientModule.db.$client.close()` at the end of the test before the `afterAll` cleanup runs. Required keeping the exported `db` type inferred (see Decisions) so `$client` remained visible to the test.
- **Files modified:** tests/db/client.test.ts, src/db/client.ts (type annotation)
- **Verification:** `npx vitest run tests/db/client.test.ts` — 3/3 pass, no leftover `data/demo.sqlite*` file after the run.
- **Committed in:** `29bd8b0`

**3. [Rule 2 - Missing Critical, developer-approved] Exposed `dashboardMode` from client.ts**
- **Found during:** Task 2 implementation
- **Issue:** The health route's required `{ mode: ... }` field cannot be produced without either (a) reading `process.env.DASHBOARD_MODE` directly in `route.ts` — violating the plan's must-have that only `client.ts` reads it — or (b) `client.ts` exposing the already-resolved mode.
- **Fix:** Added a second export, `dashboardMode`, resolved once and cached on `globalThis` alongside `db`. Updated the Task 1 module-surface test to assert the two-key surface (`db`, `dashboardMode`) instead of `db` alone.
- **Files modified:** src/db/client.ts, tests/db/client.test.ts
- **Verification:** `npx vitest run tests/db/client.test.ts` — 3/3 pass with the updated assertion; `npx tsc --noEmit` exits 0.
- **Committed in:** `760f97c`

**4. [Rule 3 - Blocking, package install — developer-approved via checkpoint] Missing `@types/react`/`@types/react-dom`**
- **Found during:** Task 2 implementation (`npx tsc --noEmit` on the first `.tsx` file)
- **Issue:** 01-01's scaffold installed `react`/`react-dom` but never their type declarations. No `.tsx` file could type-check (`TS7016`/`TS7026` errors on `layout.tsx`).
- **Fix:** Per the deviation rules' explicit carve-out (package-manager installs are NOT auto-fixable), stopped and returned a package-legitimacy checkpoint before installing. Developer verified and approved both packages (official DefinitelyTyped packages matching the already-approved `react@19.2.8`/`react-dom@19.2.8`, confirmed via `npm view` — no typosquat indicators). Installed `npm install -D @types/react @types/react-dom` after approval.
- **Files modified:** package.json, package-lock.json
- **Verification:** `npx tsc --noEmit` exits 0; full vitest suite (8/8) still green.
- **Committed in:** `3b6f988`

---

**Total deviations:** 4 auto-fixed/approved (2 test-scope Rule 1/2 fixes, 1 Rule 2 missing-critical export addition, 1 Rule 3 developer-approved package install).
**Impact on plan:** All four were necessary for correctness (fail-loud test coverage), the must-have single-reader constraint (`dashboardMode`), or basic compilability (`@types/react`). No architectural change, no scope creep — same client singleton design, same liveness slice shape as researched.

## Issues Encountered
- `drizzle-orm@1.0.0-rc.4`'s `drizzle({ client })` return type only carries `$client` on the factory call's *inferred* return type, not on the plain `NodeSQLiteDatabase` type — an explicit `: NodeSQLiteDatabase` annotation on the exported `db` silently dropped `$client` and broke a test. Resolved by using `ReturnType<typeof createClient>` instead of a named type annotation (see Decisions).
- A stale `tsconfig.tsbuildinfo` briefly masked a real type error during iteration (incremental compilation cache) — cleared it once during verification; not a recurring issue since `tsc --noEmit` was re-run clean afterward.

## User Setup Required

None — no external service configuration required. `DASHBOARD_MODE` is a required local env var (documented in `.env.example` since 01-01), enforced fail-loud by `src/db/client.ts` (and, underneath it, `src/db/paths.ts`).

## Next Phase Readiness

- `src/db/client.ts` (`db`, `dashboardMode`) is the stable, tested foundation every later Phase 1 plan (01-03 demo seed, 01-04/01-05) and Phase 2 (real feature UI) must import through — no other module should ever construct its own connection.
- The walking-skeleton liveness proof (SKELETON.md) is now verified end-to-end in a real browser: Next.js + Drizzle + node:sqlite + the demo/real DB swap are all wired together before any real feature UI is built on them.
- One minor, non-blocking cleanup item was logged to `.planning/phases/01-schema-demo-mode-foundation/deferred-items.md`: `next-env.d.ts` is not yet in `.gitignore` (Next.js regenerates it on every `next dev`/`next build`, re-injecting a tsconfig plugin block) — add it to `.gitignore` in a future cleanup pass.
- No blockers for 01-03. `drizzle-orm`/`drizzle-kit` remain pre-release (`1.0.0-rc.4`) — carry the same re-verification caution forward from 01-01 if either package is later upgraded.

## Self-Check: PASSED

All 5 declared artifact files verified present on disk (`src/db/client.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/api/health/route.ts`, `tests/db/client.test.ts`); all 4 task commit hashes (`2a37955`, `29bd8b0`, `760f97c`, `3b6f988`) verified present in `git log --all`. Task 3's checkpoint evidence (four verification steps) recorded above per the developer's approval message; no independent re-run performed at finalization time per explicit instruction.

---
*Phase: 01-schema-demo-mode-foundation*
*Completed: 2026-07-23*
