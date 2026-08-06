---
phase: 04-incremental-sync-automatic-scheduling
plan: 03
subsystem: scheduling
tags: [task-scheduler, powershell, fail-loud, staleness, gmail-sync, ing-05]

# Dependency graph
requires:
  - phase: 04-incremental-sync-automatic-scheduling (04-02)
    provides: runGmailSync historyId-first incremental resolution, getLatestSuccessfulSyncRun, historyId/usedFallback cursor persistence
provides:
  - "scripts/sync.ts — Task Scheduler entrypoint reusing the exact runGmailSync + startSyncRun/finishSyncRun lifecycle syncGmailAction uses (D4-05, no fork); exports shouldThrottle + AT_LOGON_THROTTLE_MS"
  - "scripts/register-task.ps1 — idempotent one-time registration: Daily + AtLogOn triggers, StartWhenAvailable, WakeToRun omitted"
  - "src/lib/staleness.ts — pure isSyncStale(lastSuccessAt, now) + STALE_THRESHOLD_MS, importable by both a client component and a node test"
  - "src/app/layout.tsx computes lastSuccessAt via getLatestSuccessfulSyncRun; ingestion-health.tsx renders a stale-banner branch ahead of the failed-run branch (D4-03)"
affects: [04-04 (live registration + hardware verification of the task this plan only writes)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import() of `import \"server-only\"`-guarded modules (src/gmail/client.ts, src/gmail/oauth.ts) deferred to inside the runnable function body, never at module top-level — keeps importing scripts/sync.ts for its pure exports (shouldThrottle, AT_LOGON_THROTTLE_MS) safe under plain vitest/tsc, while the real invocation supplies --conditions=react-server"
    - "A pure predicate module (src/lib/staleness.ts) extracted OUT of a \"use client\" component specifically so it is importable from a node-environment vitest test AND from a Server Component (layout.tsx) without pulling server-only code into the client bundle"
    - "cmd.exe-wrapped scheduled-task action (`cmd.exe /c set \"DASHBOARD_MODE=real\" && npx.cmd tsx --conditions=react-server scripts/sync.ts`) to scope both the mode env var and the node resolution condition to the one child process, rather than requiring a persistent machine-level environment variable"

key-files:
  created:
    - scripts/sync.ts
    - scripts/register-task.ps1
    - src/lib/staleness.ts
    - tests/scripts/sync-throttle.test.ts
    - tests/lib/staleness.test.ts
  modified:
    - src/app/layout.tsx
    - src/components/ingestion-health.tsx

key-decisions:
  - "AT_LOGON_THROTTLE_MS = 4 hours (D4-A1, confirmed default) and STALE_THRESHOLD_MS = 2 days (D4-A2, confirmed default), both pinned by exact-value assertions in their respective tests"
  - "scripts/sync.ts bootstraps its own DB connection via assertMode/resolveDbPath/openSqliteFile/drizzle({ client }) (migrate.ts's CLI shape) rather than importing the server-only-guarded src/db/client.ts singleton — necessary regardless, since src/gmail/client.ts and src/gmail/oauth.ts (both required for D4-05's no-fork constraint) also carry `import \"server-only\"` and had to be deferred to a dynamic import inside the runnable body"
  - "src/lib/staleness.ts kept as its own module (not inlined into ingestion-health.tsx, contrary to 04-PATTERNS.md's original placement) — see architecture_note in the plan; this was already a documented, pre-approved deviation, not a new one"

patterns-established:
  - "Any future standalone script that needs a server-only-guarded module (Gmail client/oauth, db/client) must defer that import to inside its runnable-body function via dynamic import(), and be invoked with --conditions=react-server — a plain top-level import throws immediately under tsx/node, confirmed empirically this plan"

requirements-completed: [ING-05]

coverage:
  - id: D1
    description: "shouldThrottle is a pure function that throttles only when a prior SUCCESSFUL sync finished strictly within AT_LOGON_THROTTLE_MS (4h, D4-A1) of now; false for no-prior-success, null finishedAt, or a success just outside the window"
    requirement: "ING-05"
    verification:
      - kind: unit
        ref: "tests/scripts/sync-throttle.test.ts — 5 cases (constant pin, within-window, just-outside-window, no-prior-success, null finishedAt)"
        status: pass
    human_judgment: false
  - id: D2
    description: "isSyncStale is a pure function: false for null lastSuccessAt (never-synced is its own state), false at exactly the 2-day threshold, true just past it, false for a recent success"
    requirement: "ING-05"
    verification:
      - kind: unit
        ref: "tests/lib/staleness.test.ts — 5 cases (constant pin, null, at-threshold, just-past-threshold, recent)"
        status: pass
    human_judgment: false
  - id: D3
    description: "scripts/sync.ts reuses runGmailSync + startSyncRun + finishSyncRun (no forked sync logic) and type-checks against the domain layer"
    requirement: "ING-05"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit -p tsconfig.json (clean)"
        status: pass
      - kind: other
        ref: "grep confirms scripts/sync.ts calls runGmailSync/startSyncRun/finishSyncRun, no redefinition"
        status: pass
    human_judgment: false
  - id: D4
    description: "scripts/register-task.ps1 sets StartWhenAvailable, a Daily trigger, and an AtLogOn trigger, and omits WakeToRun (D4-01)"
    verification:
      - kind: other
        ref: "PowerShell AST parse (System.Management.Automation.Language.Parser::ParseFile) — PARSE OK, zero syntax errors; manual inspection confirms -StartWhenAvailable present, -WakeToRun absent, both -Daily and -AtLogOn triggers present"
        status: pass
    human_judgment: true
  - id: D5
    description: "The stale banner renders ahead of the failed-run branch in ingestion-health.tsx, gated on isConnected && isSyncStale(lastSuccessAt); full suite stays green"
    verification:
      - kind: unit
        ref: "npm run test — 163/163 (153 prior + 5 throttle + 5 staleness)"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit -p tsconfig.json (clean)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-08-03
status: complete
---

# Phase 4 Plan 3: Standalone Scheduled Sync + Fail-Loud Staleness Alarm Summary

**A Task Scheduler-invokable `scripts/sync.ts` reuses the exact `runGmailSync`/sync-run lifecycle `syncGmailAction` already uses (no fork), self-throttles the at-logon trigger via a pure `shouldThrottle` predicate, and pairs with a checked-in `scripts/register-task.ps1` (catch-up-only, no wake-timer) and a pure `isSyncStale` predicate that escalates the health UI to a stale banner ahead of the failed-run line — closing the ING-05 script/UI half and the D4-03 fail-loud backstop.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-03T~11:53Z (approx.)
- **Completed:** 2026-08-03T~12:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments
- Wrote 10 new RED tests (5 throttle-predicate cases pinning the 4h window, 5 staleness-predicate cases pinning the 2-day threshold), confirmed genuinely RED (`Cannot find module`) before any implementation
- `scripts/sync.ts` bootstraps its own DB connection (assertMode/resolveDbPath/openSqliteFile/drizzle, mirroring `src/db/migrate.ts`), gates hard on real-mode, self-throttles the at-logon path via `shouldThrottle` + `getLatestSuccessfulSyncRun`, and records every attempt as a `sync_runs` row via `startSyncRun`/`runGmailSync`/`finishSyncRun` — the identical lifecycle `syncGmailAction` uses (D4-05, verified by grep + `tsc --noEmit`)
- Discovered and fixed a real blocking issue (Rule 3): `src/gmail/client.ts` and `src/gmail/oauth.ts` both carry `import "server-only"`, whose conditional-exports map only no-ops under Next.js's own `"react-server"` bundler resolution condition — confirmed empirically that a plain `npx tsx scripts/sync.ts` process throws immediately on that import. Fixed by (a) deferring those two imports to a `dynamic import()` inside the runnable function body only (so importing the module for its pure `shouldThrottle`/`AT_LOGON_THROTTLE_MS` exports in the vitest test never triggers it) and (b) invoking the real script with `node --conditions=react-server`, wired into `scripts/register-task.ps1`'s scheduled action. No other files were touched to make this fix — `oauth.ts`/`gmail/client.ts`/`db/client.ts` are unchanged, preserving the existing client-bundle-safety guarantee.
- `scripts/register-task.ps1` registers `"RecruitingDashboard-GmailSync"` idempotently (unregister-then-register) with a Daily 8:00 AM trigger + an AtLogOn trigger, `-StartWhenAvailable` (D4-01 catch-up), and deliberately omits `-WakeToRun`; the scheduled action is wrapped in `cmd.exe /c set "DASHBOARD_MODE=real" && npx.cmd tsx --conditions=react-server scripts/sync.ts` so both the real-mode env var and the node resolution condition are scoped to that one child process, never written as a persistent machine/user environment variable
- `src/lib/staleness.ts` — pure `isSyncStale(lastSuccessAt, now?)` + `STALE_THRESHOLD_MS` (2 days), no server-only imports; `src/app/layout.tsx` now computes `lastSuccessAt` via `getLatestSuccessfulSyncRun` and threads it into `SyncHealth`; `src/components/ingestion-health.tsx` renders a `⚠ Sync is stale` banner (`font-semibold text-destructive`) evaluated BEFORE the existing failed-run branch, gated on `isConnected && isSyncStale(lastSuccessAt)`
- Confirmed `Register-ScheduledTask`/`New-ScheduledTaskAction`/etc. syntax via PowerShell's own AST parser (`[System.Management.Automation.Language.Parser]::ParseFile`) without ever registering or running the task, per this plan's explicit guardrail
- Full suite green: 163/163 (153 prior + 10 new), `npx tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing throttle + staleness tests (RED)** - `60a0218` (test)
2. **Task 2: Standalone scheduled sync script + PowerShell task registration (GREEN)** - `6cd9f99` (feat)
3. **Task 3: Fail-loud staleness alarm — pure predicate, layout wiring, health-UI escalation (GREEN)** - `ac6e408` (feat)

**Plan metadata:** (pending — recorded after this summary commits)

_TDD gate compliance: `test(04-03)` commit (60a0218) precedes both `feat(04-03)` GREEN commits (6cd9f99, ac6e408)._

## Files Created/Modified
- `scripts/sync.ts` (NEW) - Task Scheduler entrypoint; exports `AT_LOGON_THROTTLE_MS`/`shouldThrottle`; runnable body gated behind `isDirectCliInvocation`, real-mode gate, dynamic-imports the Gmail client/oauth modules, reuses `runGmailSync`/`startSyncRun`/`finishSyncRun`
- `scripts/register-task.ps1` (NEW) - idempotent one-time registration: Daily + AtLogOn triggers, `-StartWhenAvailable`, no `-WakeToRun`, `cmd.exe`-wrapped action for scoped `DASHBOARD_MODE=real` + `--conditions=react-server`
- `src/lib/staleness.ts` (NEW) - pure `isSyncStale`/`STALE_THRESHOLD_MS`
- `tests/scripts/sync-throttle.test.ts` (NEW) - 5 tests for `shouldThrottle`/`AT_LOGON_THROTTLE_MS`
- `tests/lib/staleness.test.ts` (NEW) - 5 tests for `isSyncStale`/`STALE_THRESHOLD_MS`
- `src/app/layout.tsx` - computes `lastSuccessAt` via `getLatestSuccessfulSyncRun`, adds it to the `SyncHealth` object
- `src/components/ingestion-health.tsx` - `SyncHealth.lastSuccessAt`; new stale-banner branch ahead of the failed branch

## Decisions Made
- `AT_LOGON_THROTTLE_MS` = 4 hours (D4-A1) and `STALE_THRESHOLD_MS` = 2 days (D4-A2) — both confirmed defaults per the plan's frontmatter, pinned by exact-value test assertions so a later accidental change is caught
- `shouldThrottle`/Gmail-client-and-oauth imports split: pure exports stay at module top-level (safe for the test to import); the two `server-only`-guarded modules are loaded via `dynamic import()` strictly inside the runnable function body — this was the minimal fix that required touching zero files outside this plan's declared scope
- `scripts/register-task.ps1`'s scheduled action wraps `npx.cmd tsx --conditions=react-server scripts/sync.ts` in `cmd.exe /c set "DASHBOARD_MODE=real" && ...` rather than requiring the user to set a persistent Windows environment variable — keeps the one-time registration fully self-contained

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `import "server-only"` throws under a plain `tsx` process, blocking `scripts/sync.ts` from ever importing `src/gmail/client.ts`/`src/gmail/oauth.ts`**
- **Found during:** Task 2, while drafting `scripts/sync.ts`'s bootstrap
- **Issue:** `src/gmail/client.ts`, `src/gmail/oauth.ts`, and `src/db/client.ts` all carry `import "server-only"` at module top-level. The `server-only` package's conditional-exports map only resolves to a no-op (`empty.js`) under the `"react-server"` condition that Next.js's own bundler sets during SSR/RSC compilation; a plain `npx tsx scripts/sync.ts` invocation (no such condition set) resolves to the throwing `index.js` instead. Confirmed empirically: `npx tsx` importing any of these three modules (or anything that transitively imports them) throws `Error: This module cannot be imported from a Client Component module...` immediately, both for a direct top-level import AND for the vitest test importing `scripts/sync.ts` for its pure exports.
- **Fix:** (1) `scripts/sync.ts` keeps `import { getGmailClient }` / `import { hasStoredToken }` out of its top-level imports entirely — both are loaded via `const { getGmailClient } = await import("@/gmail/client")` etc. strictly inside `runScheduledSync()`'s body, which only executes when `isDirectCliInvocation` is true (never during a test import). (2) The real invocation (`scripts/register-task.ps1`'s scheduled action, and any manual run) must pass `node --conditions=react-server` — implemented as `npx.cmd tsx --conditions=react-server scripts/sync.ts`, empirically confirmed to resolve `server-only` to its no-op branch, matching Next.js's own SSR behavior. Neither `src/gmail/client.ts`, `src/gmail/oauth.ts`, nor `src/db/client.ts` were modified — the existing client-bundle-safety guarantee (T-03-02) is untouched.
- **Files modified:** `scripts/sync.ts`, `scripts/register-task.ps1` (both already in this plan's declared `files_modified`)
- **Commit:** `6cd9f99`

### Notes (not deviations, plan-anticipated)
- The `src/lib/staleness.ts` extraction (rather than inlining `isStale`/`STALE_THRESHOLD_MS` into `ingestion-health.tsx` per 04-PATTERNS.md's original mapping) was already called out and pre-approved in the plan's own `<architecture_note>` — implemented exactly as specified, not a new deviation.

## Issues Encountered

None beyond the `server-only` blocking issue documented above (auto-fixed, Rule 3). The full suite is now 163/163 green with no stray failures — the 3 pre-existing out-of-scope failures logged in 04-02's `deferred-items.md` (from a stray `.claude/worktrees/` test copy) did not reappear in this run's `npm run test`.

## User Setup Required

None for this plan specifically. **Reminder for 04-04** (per the plan's guardrails, deliberately NOT done here): the scheduled task itself was never registered and `scripts/register-task.ps1` was never executed — only written and PowerShell-AST-parsed for syntax validity. 04-04 (a separate, human-gated plan) must actually run `scripts/register-task.ps1` in an elevated PowerShell session and verify `Get-ScheduledTask` reports `StartWhenAvailable=True`/`WakeToRun=False` on real hardware.

## Next Phase Readiness
- `scripts/sync.ts` and `scripts/register-task.ps1` are complete, type-checked, and unit-tested (throttle logic) — 04-04 can register the task directly with no further script changes needed.
- The staleness alarm (`src/lib/staleness.ts`, wired into `layout.tsx`/`ingestion-health.tsx`) is live in the app today — it will correctly escalate once `sync_runs` accumulates a real gap, with no further wiring required from 04-04.
- The `--conditions=react-server` requirement is now a documented pattern (see `patterns-established` above) for any future standalone script that needs the Gmail client/oauth or `db/client` modules — no further investigation needed if this comes up again.
- No blockers identified for 04-04.

---
*Phase: 04-incremental-sync-automatic-scheduling*
*Completed: 2026-08-03*

## Self-Check: PASSED

All 7 created/modified files confirmed present on disk (scripts/sync.ts, scripts/register-task.ps1, src/lib/staleness.ts, tests/scripts/sync-throttle.test.ts, tests/lib/staleness.test.ts, src/app/layout.tsx, src/components/ingestion-health.tsx); all 3 task commit hashes (60a0218, 6cd9f99, ac6e408) confirmed in git log.
