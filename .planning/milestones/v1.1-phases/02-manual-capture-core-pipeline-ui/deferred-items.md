# Deferred Items — Phase 02

Out-of-scope discoveries logged during execution, not fixed (per executor scope-boundary rule).

## 02-01

- **`tsconfig.json` is auto-rewritten by `next dev` / `next build`** (reformats arrays to
  multi-line, changes `"jsx": "preserve"` to `"jsx": "react-jsx"`, adds
  `.next/dev/types/**/*.ts` to `include`). This happens on every dev/build invocation
  regardless of what code changed — pre-existing Next.js 16.2.11 behavior from Phase 1's
  scaffold, not something introduced by 02-01's changes. Reverted both times it appeared
  during this plan's verification runs (`git checkout -- tsconfig.json`) since it's outside
  this plan's `files_modified` list. A future cleanup pass should either accept Next's
  preferred `tsconfig.json` shape permanently (commit the rewritten version once) or confirm
  why `"jsx": "preserve"` was chosen originally before re-locking it.
- **`npx next build` (production build) fails independent of tsconfig churn** with
  `The "id" argument must be of type string. Received undefined` (Next.js build worker
  crash, Turbopack). `npm run dev` (the plan's actual required verification path) works
  correctly in both demo and real mode. Not investigated further — out of this plan's scope
  (plan verification only requires `npm run dev`), but should be looked at before the app is
  ever deployed/production-built.
- **`data/demo.sqlite` had no `applications` table** when first hit via `npm run dev` this
  session (likely reset/recreated by an earlier command in this environment, unrelated to
  02-01's changes). Ran `db:migrate`, `db:seed:lookups`, `db:seed:demo` against
  `DASHBOARD_MODE=demo` to restore it so the nav-shell verification could complete. No code
  change involved — a data-directory state issue, not a 02-01 defect.

## 02-02

- **Stale `.claude/worktrees/hopeful-mestorf-9a8ba0/` directory contains a full duplicate
  `tests/` tree** left over from an earlier (abandoned) worktree-isolation execution attempt
  (see #683 — orchestrator HEAD diverged from the worktree fork base, forcing this run to
  sequential mode). `vitest.config.ts` has no `test.exclude` for this path, so a bare
  `npm test` / `vitest run` picks up both copies. 3 pre-existing failures live in the stale
  copy only (`tests/db/seed.test.ts` — `requireLookupId` not exported; `tests/domain/companies.test.ts`
  — a friendly-error-message assertion) — unrelated to any file this plan (02-02) touches.
  Confirmed the plan's own scoped verification (`vitest run tests/db/migrate.test.ts
  tests/domain/events.test.ts`) passes cleanly (14/14). Did not delete the stale worktree
  directory or edit `vitest.config.ts` — out of 02-02's `files_modified` scope. A future
  cleanup plan should either remove `.claude/worktrees/` or add it to `vitest.config.ts`'s
  `test.exclude`.

## 02-03

- Same stale `.claude/worktrees/hopeful-mestorf-9a8ba0/` duplicate `tests/` tree re-observed
  during `npm test` — the same 2 pre-existing failing files (`tests/db/seed.test.ts`,
  `tests/domain/companies.test.ts`) fail from the stale copy, unrelated to any file this plan
  touches. Confirmed `npx vitest run tests/domain/board.test.ts` (this plan's own scoped test)
  passes cleanly (5/5). No fix applied — out of 02-03's `files_modified` scope.

## 02-04

- `tsconfig.json` was again auto-rewritten by `next dev` during manual `/job/[id]` verification
  (same recurring Next.js 16.2.11 behavior documented under 02-01) — reverted with
  `git checkout -- tsconfig.json` before finalizing, no code change involved.
- `data/demo.sqlite` already had `applications`/`conversations` rows seeded from a prior plan's
  verification pass; re-running `npm run db:seed:demo` against it failed on a
  `UNIQUE constraint failed: companies.normalized_key` (expected — the seed script is not
  idempotent against already-seeded data). Not a 02-04 defect: verification instead queried the
  existing seeded data directly (`node:sqlite` read) to find an application with both status
  events and conversations (id 1), and used that for the manual `npm run dev` check.

## 02-05

- **`npm run build` fails with `The "id" argument must be of type string. Received undefined` /
  `Next.js build worker exited with code: 1`** — reproduces identically with a fully clean
  `.next` cache, with and without `DASHBOARD_MODE` set, and (confirmed via a `git apply -R`
  isolation test reverting every 02-05 code change back to the prior commit) **at the state
  right after 02-04**, i.e. before any 02-05 code exists. This is the first plan in the phase
  whose `<verify>` block actually invokes `npm run build` — 02-01 through 02-04 only ran
  `npx tsc --noEmit`/`npm run dev`, so this pre-existing Turbopack build-worker crash was never
  previously exercised. Not a 02-05 defect and out of this plan's `files_modified` scope to
  root-cause. Substituted `npx tsc --noEmit` (passes, 0 errors) plus a real `npm run dev` +
  `curl` content check of `/` and `/job/1` (both 200, all new CTA/trigger copy present) as the
  practical verification for this plan's own `<verify>` requirement. A future plan should
  root-cause the build-worker crash (try `next build --no-turbopack`, check for a Windows-path
  or dynamic-route-params interaction) before any phase that needs a real production build
  (e.g. deployment prep).
- Same recurring `tsconfig.json` auto-rewrite (documented under 02-01/02-04) triggered by both
  `npm run build` and `npm run dev` during this plan's verification — reverted with
  `git checkout -- tsconfig.json` each time before finalizing, no code change involved.
