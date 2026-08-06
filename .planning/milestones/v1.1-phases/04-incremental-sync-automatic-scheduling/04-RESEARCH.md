# Phase 4: Incremental Sync & Automatic Scheduling - Research

**Researched:** 2026-08-03
**Domain:** Gmail `users.history.list` incremental sync + Windows Task Scheduler automation, layered onto Phase 3's existing manual full-fetch pipeline
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D4-01: Catch-up only — do NOT enable the Task Scheduler wake-timer.** Schedule the daily task but rely on Settings → *"Run task as soon as possible after a scheduled start is missed"* so a sync fires on the next wake/boot rather than waking the machine. Rationale: because the fetch path is incremental, a single catch-up run covers the entire missed gap (all history since the stored cursor), so waking at a fixed time and catching-up-on-open produce identical **data** — just at different moments. Do **not** enable *"Wake the computer to run this task"* (Conditions tab).
- **D4-02: Two triggers — daily schedule + at-logon.** Add an at-logon (login/unlock) trigger alongside the daily schedule so data is freshest the moment the user actually opens the laptop. The at-logon trigger MUST be **throttled**: skip if a sync already ran successfully within the last few hours (planner to pick the exact window), so opening/locking repeatedly doesn't hammer Gmail. Both triggers route through the same standalone script and the same `runGmailSync` path.

### Claude's Discretion — DEFAULTS set for the three areas not deep-dived (user to CONFIRM during planning)

- **D4-03: Unattended failure visibility (fail-loud) — extend the existing in-app health surfacing with a staleness alarm; no OS notification this phase.**
  1. The standalone scheduled script MUST record every attempt as a `sync_runs` row (running → success|failed, with `errorMessage`) exactly like `syncGmailAction` does.
  2. Add a staleness alarm: if there has been no successful sync in > ~2 days, the health indicator escalates to a prominent "⚠ Sync is stale — last success N days ago" state, distinct from a normal "last synced X ago" line. Threshold is a default — confirm during planning.
  3. In-app only for this phase (no Windows toast / OS-level notification). OS-level notification captured as a deferred idea.
  ⚠️ Confirm during planning.

- **D4-04: Cursor-expiry full-resync scope = bounded by last successful sync, NOT the entire label.** When `users.history.list` returns 404 / the stored historyId is expired-or-invalid, fall back to the existing date-windowed full-fetch path with `after:` = the last successful run's window (the mechanism Phase 3 already uses via `getLatestSyncRun` → `lastSync`). Cold start / no prior successful sync = the same first-run backfill Phase 3 already handles. The fallback MUST be recorded loudly on the sync run (e.g. a flag/note that a full-resync fallback occurred). ⚠️ Confirm during planning.

- **D4-05: Scheduling mechanism = Windows Task Scheduler + standalone `tsx` sync script reusing `runGmailSync` (per CLAUDE.md); NOT node-cron.**
  - Script lives under a new `scripts/` dir (e.g. `scripts/sync.ts`), invoked as `npx tsx scripts/sync.ts` by the scheduled task. It imports and calls the same `runGmailSync` + sync-run lifecycle used by `syncGmailAction`, owning its own DB write via the server-only client. Real-mode only — must never touch the demo store.
  - historyId cursor storage: default is to carry the cursor on the successful `sync_runs` row (add a `history_id` column), avoiding a new table. Planner may instead use a dedicated single-row sync-state/settings table if that reads cleaner.
  - Incremental mechanism (success criterion 3): use Gmail `users.history.list` with `startHistoryId` = stored cursor to enumerate changed message ids since last sync, then feed those ids through the existing fetch/parse/route/dedup pipeline. Seed/refresh the cursor from a current historyId (e.g. `users.getProfile().historyId` or the newest message's historyId) captured on each successful run. First run with no cursor → full-fetch path seeds the first cursor.
  ⚠️ Confirm during planning.

### Deferred Ideas (OUT OF SCOPE)

- **OS-level (Windows toast) notification on sync failure/staleness** — considered under D4-03; deferred to keep this phase in-app and dependency-free. Candidate for a later polish phase.
- **Periodic wider-net subject-keyword inbox scan** to partially mitigate the REL-04 unlisted-domain recall gap — already a roadmap-level carried-forward risk (v2 candidate), not this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ING-05 | Sync runs automatically once daily with no action from me, including catch-up after a missed run (laptop asleep/off) | §Automatic Scheduling on Windows — Register-ScheduledTask pattern with `-StartWhenAvailable`, dual daily+at-logon triggers, no wake-timer (D4-01/D4-02) |
| ING-07 | When the incremental sync cursor expires, the system falls back to a full re-sync rather than silently stopping | §Gmail Incremental via historyId — 404 detection via `GaxiosError.status`, fallback to existing date-windowed `runGmailSync` path bounded by last successful sync (D4-04) |
| Success criterion 3 | Incremental path produces the same deduplicated event set a full sync would | §Gmail Incremental via historyId + §Dedup ledger — `ingested_messages` unique-on-`message_id` ledger makes overlap between incremental/full/label passes idempotent by construction |
</phase_requirements>

## Summary

Phase 3 already ships a complete, working, transaction-per-message sync pipeline (`runGmailSync`) fed by a **date-windowed full re-fetch** (`listAllMessageIds` + `after:YYYY/MM/DD`). This phase does NOT rewrite that pipeline — it adds a **historyId-based message-id source** in front of it, a **cursor-expiry fallback** into it, and an **OS-level trigger** (Windows Task Scheduler) around it via a new standalone script. All three pieces are additive: the existing `runGmailSync(db, client, { lastSync })` signature, dedup ledger, and sync-run lifecycle are reused verbatim.

The Gmail side is well-documented and directly verified against the installed `googleapis@173.0.0` package's own `.d.ts` files (not just docs): `users.history.list` takes a required `startHistoryId` plus optional `historyTypes`/`labelId`/`pageToken`/`maxResults`, and returns `{ history[], historyId, nextPageToken }` where each `history[]` entry carries `messagesAdded`/`messagesDeleted`/`labelsAdded`/`labelsRemoved`. An invalid or expired `startHistoryId` throws a `GaxiosError` with `.status === 404` — Google's own guidance (embedded in the type JSDoc) is "on 404, perform a full sync." This maps cleanly onto D4-04: catch that specific error, fall back to the existing `after:`-windowed full-fetch bounded by the last successful run, and record the fallback loudly on the `sync_runs` row.

The scheduling side is pure Windows/PowerShell, not Node: `Register-ScheduledTask` with two `New-ScheduledTaskTrigger` triggers (`-Daily -At` and `-AtLogOn`) plus `New-ScheduledTaskSettingsSet -StartWhenAvailable` (and deliberately omitting `-WakeToRun`) is the standard, scriptable, checked-in-friendly way to satisfy D4-01/D4-02 without hand-rolling any scheduler logic or adding `node-cron` — consistent with CLAUDE.md's explicit "don't hand-roll a cron loop" guidance. The standalone script self-throttles the at-logon trigger by reading `getLatestSyncRun` and skipping if a successful run happened within the throttle window, since Task Scheduler itself cannot express that condition.

One landmine specific to this codebase: `src/db/open-sqlite.ts` already sets `PRAGMA journal_mode = WAL` but does **not** set a `busy_timeout`. WAL allows concurrent readers during a write, but still serializes writers — if the standalone script and a running `next dev` server both attempt a write in the same instant, one gets `SQLITE_BUSY` immediately rather than waiting. This should be added as a one-line pragma fix in this phase, not deferred.

**Primary recommendation:** Add a thin `fetchHistoryMessageIds` function in `src/gmail/fetch.ts` (paginated `history.list`) and a `syncViaHistory`/fallback wrapper in `src/domain/ingestion.ts` that tries historyId, catches a 404 `GaxiosError` and falls back to the existing `after:`-windowed path, then always re-seeds the cursor from `getProfile().historyId` on success — reusing every downstream piece (`classifyQueryMessage`, `writeDecision`, `isAlreadyIngested`) unchanged. Pair this with a `scripts/sync.ts` standalone entrypoint and a checked-in `scripts/register-task.ps1` that wires the two Task Scheduler triggers.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Daily/at-logon trigger firing | OS (Windows Task Scheduler) | — | Task Scheduler owns sleep/wake/missed-trigger semantics; CLAUDE.md explicitly forbids hand-rolling this in Node |
| Standalone sync invocation | Node script (`scripts/sync.ts`) | — | New process outside Next.js; owns its own DB write via the same server-only client construction pattern as `db/client.ts` |
| historyId fetch + cursor management | API/Backend (`src/gmail/*`, `src/domain/ingestion.ts`) | — | Same tier that already owns `listAllMessageIds`/`buildSenderQuery`; historyId is just a different message-id source feeding the same pipeline |
| Cursor persistence | Database/Storage (`sync_runs` table) | — | D4-05 default: carry `history_id` on the successful `sync_runs` row, read via `getLatestSyncRun` |
| Cursor-expiry fallback decision | API/Backend (`src/domain/ingestion.ts`) | — | Same orchestrator that already owns the `lastSync` full-fetch path (D4-04 reuses it directly) |
| At-logon throttle check | Node script (`scripts/sync.ts`) | Database/Storage (read `sync_runs`) | Task Scheduler cannot express "skip if ran recently" — must be app-level logic reading the last successful run |
| Staleness alarm | Browser/Client (`ingestion-health.tsx`) | API/Backend (server component computing the "days since last success" figure) | Extends the existing 03-10 health surface; computation is a pure read over `sync_runs`, rendering is the existing client component |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `googleapis` | 173.0.0 (already installed) [VERIFIED: node_modules] | `gmail.users.history.list` + `gmail.users.getProfile` | Already the project's Gmail client; no new package — `Resource$Users$History.list` and `Resource$Users.getProfile` are both present on the installed `gmail_v1.Gmail` instance (confirmed in `node_modules/googleapis/build/src/apis/gmail/v1.d.ts`) |
| Windows Task Scheduler (`ScheduledTasks` PowerShell module) | Built into Windows 11 (no install) | Daily + at-logon triggers, missed-run catch-up | CLAUDE.md-mandated; ships with the OS, no dependency, scriptable and checked-in-able via a `.ps1` |
| `tsx` | 4.23.1 (already installed, devDependency) | Runs `scripts/sync.ts` directly from TypeScript without a build step | Already the project's `db:migrate`/`db:seed:*` runner — `npx tsx scripts/sync.ts` matches CLAUDE.md's exact recommended invocation |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-kit` | 1.0.0-rc.4 (already installed) | Generates the additive migration adding `sync_runs.history_id` | Same `db:generate`/`db:migrate` flow used for every prior schema change (03-01's additive migration is the direct precedent) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Windows Task Scheduler | `node-cron` inside an always-on `pm2`/NSSM-managed Next.js process | CLAUDE.md explicitly rejects this unless already committed to an always-on service — a laptop that sleeps defeats an in-process timer entirely (the timer does nothing while asleep), which is the opposite of what D4-01's catch-up model needs |
| `history_id` column on `sync_runs` | A dedicated single-row `sync_state`/`settings` table | Both are acceptable per D4-05. A dedicated table decouples "cursor" from "run log" semantically, but adds a new table + migration for a single scalar; the `sync_runs` column reuses the exact row (`getLatestSyncRun`) the fallback logic already reads, so it is one fewer round trip and one fewer schema concept. **Recommendation: `sync_runs.history_id`.** |
| Re-fetch full label on cursor expiry | Re-run only the sender-query pass on expiry | D4-04 explicitly locks this: bounded re-sync via existing `lastSync`-windowed full-fetch path (both query AND label passes, exactly what `runGmailSync` already does when called with a `lastSync` value) — no new code path needed, just call the existing full orchestration again |

**Installation:**
No new packages required this phase — `googleapis`, `tsx`, and `drizzle-kit` are already installed dependencies.

**Version verification:**
```
npm view googleapis version   -> 173.1.0 latest on registry as of research (installed: 173.0.0, compatible — no new install needed)
npm view tsx version          -> already installed devDependency, matches package.json
```
`googleapis`/`tsx`/`drizzle-kit` versions are unchanged from Phase 3 — this phase adds zero new npm dependencies. [VERIFIED: package.json + node_modules on disk]

## Package Legitimacy Audit

**No new external packages are installed in this phase.** Every capability (historyId fetch, cursor storage, Task Scheduler wiring) is built from the already-installed `googleapis` package plus Windows' own built-in `ScheduledTasks` PowerShell module — no `npm install` runs. The Package Legitimacy Gate is not applicable; skip to Architecture Patterns.

**Packages removed due to [SLOP] verdict:** none (no packages evaluated — none proposed)
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                     ┌────────────────────────────────────────┐
                     │        Windows Task Scheduler            │
                     │  Trigger A: Daily @ HH:MM                │
                     │  Trigger B: At log-on / unlock            │
                     │  Settings: StartWhenAvailable=true         │
                     │            WakeToRun=false (D4-01)         │
                     └───────────────┬────────────────────────┘
                                     │ fires
                                     ▼
                     ┌────────────────────────────────────────┐
                     │  scripts/sync.ts (standalone, tsx)       │
                     │  1. assert DASHBOARD_MODE=real            │
                     │  2. at-logon? -> throttle check           │
                     │     (getLatestSyncRun, skip if <N hrs)    │
                     │  3. startSyncRun(db)                      │
                     └───────────────┬────────────────────────┘
                                     │ calls (same fn as syncGmailAction)
                                     ▼
                     ┌────────────────────────────────────────┐
                     │  runGmailSync(db, client, { lastSync,     │
                     │               historyId })  [EXTENDED]    │
                     │                                           │
                     │  historyId present?                       │
                     │   ├─ YES -> history.list(startHistoryId)  │
                     │   │         │                              │
                     │   │         ├─ 200: messagesAdded ids ──┐  │
                     │   │         │                            │  │
                     │   │         └─ 404 (GaxiosError.status)  │  │
                     │   │             -> D4-04 fallback:        │  │
                     │   │                record fallback flag   │  │
                     │   │                -> existing lastSync   │  │
                     │   │                   full-fetch path ────┤  │
                     │   └─ NO (cold start) -> existing            │
                     │        lastSync full-fetch path ───────────┤  │
                     │                                              ▼  │
                     │                          [UNCHANGED PIPELINE]   │
                     │            fetchParsedMessage -> dispatchParser  │
                     │            -> classifyQueryMessage -> writeDecision│
                     │            -> isAlreadyIngested / recordIngestedTx │
                     │                                              │  │
                     │  Pass 2: label backfill (unchanged)          │  │
                     │  Pass 3: reparseDeadLetter (unchanged)       │  │
                     │                                              │  │
                     │  On success: getProfile().historyId ─────────┘  │
                     │              -> finishSyncRun({ historyId,       │
                     │                  usedFallback, ... })            │
                     └───────────────┬────────────────────────────────┘
                                     │ every attempt recorded
                                     ▼
                     ┌────────────────────────────────────────┐
                     │  sync_runs table                          │
                     │  (+ history_id column, D4-05)             │
                     └───────────────┬────────────────────────┘
                                     │ read by
                                     ▼
                     ┌────────────────────────────────────────┐
                     │  ingestion-health.tsx (extended, D4-03)   │
                     │  - existing last-sync line                │
                     │  - NEW: staleness alarm if no success      │
                     │    in > threshold                          │
                     └────────────────────────────────────────┘
```

### Recommended Project Structure

```
scripts/
├── sync.ts                 # standalone entrypoint, Task Scheduler target
└── register-task.ps1       # checked-in, run-once PowerShell setup script

src/
├── domain/
│   ├── ingestion.ts         # EXTEND: runGmailSync gains historyId param + 404 fallback
│   └── sync-state.ts        # EXTEND: getLatestSyncRun already exists; add history_id read/write helpers if not folded into finishSyncRun
├── gmail/
│   ├── client.ts            # EXTEND: GmailClient interface gains listHistory + getProfile methods
│   ├── fetch.ts              # EXTEND: add fetchHistoryMessageIds(client, startHistoryId)
│   └── types.ts              # EXTEND: GmailClient interface, HistoryFetchResult type
├── db/
│   └── schema.ts             # EXTEND: syncRuns gains history_id + usedFallback columns (additive migration)
└── components/
    └── ingestion-health.tsx  # EXTEND: staleness escalation branch
```

### Pattern 1: historyId-first with automatic full-fetch fallback

**What:** `runGmailSync` gains an optional `historyId` param (the stored cursor). If present, attempt `history.list({ startHistoryId: historyId })`; on success, use its `messagesAdded` message ids as the pipeline's message-id source instead of `listAllMessageIds(senderQuery)`. On a 404 `GaxiosError`, fall back to the pre-existing `lastSync`-windowed full-fetch path unchanged, and set a `usedFallback: true` flag the caller records on `sync_runs`.

**When to use:** Every sync attempt after the very first (cold start still uses the existing full-fetch-only path since there is no cursor yet).

**Example:**
```typescript
// Source: node_modules/googleapis/build/src/apis/gmail/v1.d.ts (installed package,
// verified against gmail_v1.Gmail.Resource$Users$History.list signature) +
// developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list
import { Common } from "googleapis"; // Common.GaxiosError re-export

interface HistoryFetchResult {
  messageIds: string[];
  newHistoryId: string;
}

async function fetchHistoryMessageIds(
  client: GmailClient,
  startHistoryId: string,
): Promise<HistoryFetchResult> {
  const messageIds = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = startHistoryId;

  do {
    const res = await client.listHistory({ startHistoryId, pageToken });
    for (const record of res.history) {
      for (const added of record.messagesAdded ?? []) {
        if (added.message?.id) messageIds.add(added.message.id);
      }
    }
    if (res.historyId) latestHistoryId = res.historyId;
    pageToken = res.nextPageToken;
  } while (pageToken);

  return { messageIds: [...messageIds], newHistoryId: latestHistoryId };
}

// In the orchestrator:
async function resolveMessageIds(
  client: GmailClient,
  cursor: { lastSync: Date | null; historyId: string | null },
): Promise<{ ids: string[]; usedFallback: boolean }> {
  if (cursor.historyId) {
    try {
      const { messageIds } = await fetchHistoryMessageIds(client, cursor.historyId);
      return { ids: messageIds, usedFallback: false };
    } catch (err) {
      // Confirmed shape: GaxiosError.status carries the HTTP status code
      // (node_modules/gaxios/build/cjs/src/common.d.ts).
      if (err instanceof Common.GaxiosError && err.status === 404) {
        // D4-04: fall back to the existing bounded full-fetch, NOT a full
        // label re-scan. Falls through to the existing senderQuery path below.
      } else {
        throw err; // any other error still fails loud
      }
    }
  }
  const senderQuery = buildSenderQuery(KNOWN_SENDER_DOMAINS, cursor.lastSync ?? undefined);
  const ids = await listAllMessageIds(client, { q: senderQuery });
  return { ids, usedFallback: cursor.historyId !== null };
}
```

### Pattern 2: Cursor seed/refresh via `getProfile().historyId`

**What:** On every successful sync (whether it took the incremental or fallback path), call `client.getProfile()` and persist its `historyId` as the new cursor. This is what makes the "no gap between the full-fetch seed and the first incremental run" requirement true: the cursor captured AFTER a run's fetch completes covers everything up to that instant, so the next incremental call starting from it never misses a message that arrived mid-run (Gmail's historyId is monotonic and the API's contract is "records after the specified startHistoryId").

**When to use:** Once per successful `runGmailSync` call, right before `finishSyncRun`.

**Example:**
```typescript
// Source: developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile
// + node_modules/googleapis/build/src/apis/gmail/v1.d.ts Schema$Profile.historyId
const profile = await client.getProfile();
const newHistoryId = profile.historyId; // string | null | undefined per the .d.ts
```

### Pattern 3: Windows Task Scheduler — dual trigger, catch-up-only, checked-in setup script

**What:** A single checked-in `scripts/register-task.ps1` the user runs once (elevated) to create the scheduled task with both triggers and the correct settings.

**When to use:** One-time setup step; re-runnable idempotently (unregister-then-register) if the schedule needs changing.

**Example:**
```powershell
# Source: learn.microsoft.com/powershell/module/scheduledtasks (New-ScheduledTaskTrigger,
# New-ScheduledTaskSettingsSet, Register-ScheduledTask) — cross-checked against
# multiple independent PowerShell tutorials describing -StartWhenAvailable/-AtLogOn.
$taskName = "RecruitingDashboard-GmailSync"
$repoPath = "C:\Users\maddy\recruiting-dashboard"

$action = New-ScheduledTaskAction `
  -Execute "npx.cmd" `
  -Argument "tsx scripts/sync.ts" `
  -WorkingDirectory $repoPath

$dailyTrigger = New-ScheduledTaskTrigger -Daily -At "8:00AM"
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn

# StartWhenAvailable = "run ASAP after a missed start" (D4-01 catch-up).
# WakeToRun is deliberately OMITTED (default false) — D4-01 declines the
# wake-timer entirely.
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger @($dailyTrigger, $logonTrigger) `
  -Settings $settings `
  -Description "Recruiting Dashboard: daily + at-logon incremental Gmail sync (ING-05/ING-07)."
```

### Pattern 4: At-logon self-throttle (reads `sync_runs`, not a Task Scheduler condition)

**What:** Task Scheduler has no built-in "only run if the last run of a DIFFERENT trigger wasn't recent" condition. `scripts/sync.ts` checks this itself at the top, before calling `runGmailSync`, and exits early (recording nothing, or recording a lightweight skipped state) if a successful sync happened within the throttle window.

**When to use:** Every invocation of `scripts/sync.ts` — cheap to always check, harmless on the daily-trigger invocation (a daily run is extremely unlikely to be within a few hours of another success by construction).

**Recommended throttle window: 4 hours.** Rationale: long enough that opening/closing the laptop repeatedly through a single work session doesn't re-hit Gmail every few minutes, short enough that a user who opens the laptop once in the morning and again in the evening still gets two real syncs that day (matching "freshest the moment I open the laptop" from D4-02's intent). Confirm during planning per the CONTEXT.md flag.

**Example:**
```typescript
// scripts/sync.ts
const THROTTLE_MS = 4 * 60 * 60 * 1000; // 4 hours — confirm during planning

const previousRun = getLatestSyncRun(db);
if (
  previousRun?.status === "success" &&
  previousRun.finishedAt &&
  Date.now() - previousRun.finishedAt.getTime() < THROTTLE_MS
) {
  console.log(
    `Skipping sync — last success was ${previousRun.finishedAt.toISOString()}, within the ${THROTTLE_MS / 3_600_000}h throttle window.`,
  );
  process.exit(0);
}
```

### Anti-Patterns to Avoid

- **Re-running the entire label backfill on every cursor-expiry fallback:** D4-04 explicitly bounds the fallback to the `lastSync`-windowed re-fetch (both existing passes, same as any ordinary `runGmailSync(db, client, { lastSync })` call) — never drop back to the unbounded first-run label scan, which only fires when `lastSync === null`.
- **A second, forked copy of `runGmailSync` for the scheduled path:** Both `syncGmailAction` and `scripts/sync.ts` must call the exact same orchestrator function so incremental/dedup/fail-loud behavior is provably identical (D4-05) — a fork risks the two paths silently drifting apart.
- **Enabling `-WakeToRun` "just in case":** D4-01 explicitly declines this. Adding it back reintroduces the exact hardware-dependent blocker the phase was designed to route around.
- **Treating any non-404 error from `history.list` as a cursor-expiry signal:** Only branch to the fallback on `GaxiosError.status === 404`; a transient network error, 401 (auth), or 5xx should still fail loud (throw), not silently trigger a full re-sync that could mask a real auth/quota problem.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sleep/wake/missed-trigger scheduling | A custom setInterval/cron loop that checks "was yesterday's run missed" | Windows Task Scheduler's native `StartWhenAvailable` | The OS already tracks whether a trigger's scheduled time passed while the machine was off/asleep and fires it on the next opportunity — reimplementing this in Node requires polling logic that itself needs to survive sleep/wake, which is circular |
| Incremental-vs-full dedup logic | A new "did I already see this in the incremental pass" tracking table | The existing `ingested_messages` unique-on-`message_id` ledger | Already proven in Phase 3 to make the query-pass/label-pass overlap idempotent (D3-06) — the exact same mechanism makes incremental-pass/fallback-pass overlap idempotent for free, with zero new code |
| Detecting an expired Gmail cursor | Heuristics like "if historyId is older than N days, assume expired" | Catching the actual `GaxiosError.status === 404` Gmail returns | Gmail's own retention window is undocumented/variable ("typically a week, sometimes only hours" per Google's own JSDoc) — any heuristic threshold will eventually be wrong in one direction; the 404 is the authoritative, real-time signal |

**Key insight:** Every "don't hand-roll" item in this phase is really the same insight applied three times: Phase 3 and the underlying platforms (Gmail API, Windows) already solved these exact problems, and the temptation in a scheduling/sync phase is to add defensive heuristics (guess an expiry window, guess a "safe" retry loop) where the actual API/OS behavior already gives an authoritative signal to branch on.

## Runtime State Inventory

Not applicable — this phase is not a rename/refactor/migration phase. No strings, keys, or identifiers are being renamed. New state is being *added* (a `history_id` column, a new scheduled task, a new script), not migrated from an old name to a new one.

## Common Pitfalls

### Pitfall 1: Treating `messages` and `messagesAdded` as interchangeable in the history response

**What goes wrong:** Google's own docs note the top-level `history[].messages` field "may duplicate messages in this field. We recommend using the specific change-type fields instead" (`messagesAdded`/`messagesDeleted`/`labelsAdded`/`labelsRemoved`). Reading `messages` instead of `messagesAdded` can pull in ids that were only label-touched, not newly received, producing extra unnecessary fetches (not incorrect, but wasteful and confusing when reasoning about "new mail").
**Why it happens:** `messages` is the first field listed and reads as the obvious one to use.
**How to avoid:** Only read `history[].messagesAdded[].message.id` — confirmed directly in `node_modules/googleapis/build/src/apis/gmail/v1.d.ts` `Schema$History` JSDoc.
**Warning signs:** The historyId-derived id list is noticeably larger than expected for a short gap.

### Pitfall 2: 404 detection catching the wrong exception shape

**What goes wrong:** `googleapis` does not export `GaxiosError` at its top level (`import { GaxiosError } from "googleapis"` does not exist) — it must come from `Common.GaxiosError` (re-exported through `googleapis-common`) or a direct `gaxios` import. Writing `catch (err) { if (err.status === 404) }` without an `instanceof` guard risks silently swallowing an unrelated error object that happens to have a `.status` property.
**Why it happens:** Most googleapis examples online show try/catch without the type guard.
**How to avoid:** `import { Common } from "googleapis"; ... if (err instanceof Common.GaxiosError && err.status === 404)`. Confirmed structurally in `node_modules/googleapis-common/build/src/index.d.ts` (`export { GaxiosError } from 'gaxios'`) and `node_modules/gaxios/build/cjs/src/common.d.ts` (`status?: number` field).
**Warning signs:** A real auth failure or quota error gets silently reclassified as "cursor expired" and triggers an unwanted full re-sync.

### Pitfall 3: Cursor gap between full-fetch seed and first incremental run

**What goes wrong:** If the cursor is seeded from `getProfile().historyId` BEFORE the seeding full-fetch runs (rather than after), any message that arrives during that full-fetch is never covered by either the full-fetch (which already started) or the first incremental call (which starts from a historyId that predates the message).
**Why it happens:** It's tempting to grab `historyId` "at the start" for a clean boundary.
**How to avoid:** Always capture the new cursor via `getProfile()` AFTER a run's fetch/parse/write work completes, immediately before `finishSyncRun` — the ING-05/criterion-3 requirement is symmetric with the existing `lastSync = previousRun.finishedAt` pattern already used in `syncGmailAction` (captured after completion, not before).
**Warning signs:** A message received during a long-running sync never appears until the NEXT day's sync (off-by-one-run lag), or never appears at all if the incremental path is trusted exclusively going forward.

### Pitfall 4: SQLITE_BUSY between the standalone script and a running `next dev`/`next start`

**What goes wrong:** `src/db/open-sqlite.ts` sets `journal_mode = WAL` but does not set a `busy_timeout`. WAL allows concurrent readers during a write, but SQLite still serializes writers process-wide — if `scripts/sync.ts` and the Next.js server (e.g. a manual "Sync now" click) both attempt a write in the same instant, the second one gets an immediate `SQLITE_BUSY` error rather than waiting briefly.
**Why it happens:** WAL is necessary but not sufficient for safe multi-process writes; a busy timeout is a separate, easily-forgotten pragma.
**How to avoid:** Add `sqlite.exec("PRAGMA busy_timeout = 5000")` to `openSqliteFile` (src/db/open-sqlite.ts) alongside the existing `foreign_keys`/`journal_mode` pragmas — a small, safe addition covering every production connection (client.ts, migrate.ts, seed scripts, and the new `scripts/sync.ts`) since they all route through this one function.
**Warning signs:** An intermittent, hard-to-reproduce "database is locked" error specifically when a scheduled sync and a manual "Sync now" overlap.

### Pitfall 5: At-logon trigger storms on Windows lock/unlock

**What goes wrong:** `-AtLogOn` fires on interactive logon; depending on Windows session behavior, a lock-screen unlock is sometimes treated as a fresh logon event by Task Scheduler on some Windows builds, meaning a user who locks/unlocks their laptop many times a day could fire the trigger many times a day without a throttle.
**Why it happens:** Windows session-event semantics for lock vs. logon are not perfectly consistent across builds and are not something Task Scheduler exposes a clean filter for.
**How to avoid:** The D4-02-mandated throttle (Pattern 4 above) is the actual defense here, not the trigger configuration — treat every `-AtLogOn` firing as "might happen often" and let the app-level check in `scripts/sync.ts` be the real gate.
**Warning signs:** `sync_runs` shows many `skipped`/early-exit entries clustered within minutes of each other on a single day.

### Pitfall 6: Testing wake/catch-up without real hardware wake

**What goes wrong:** Since D4-01 deliberately avoids the wake-timer, there is no real "the machine woke itself up" scenario to test against — but the catch-up behavior (missed trigger → runs on next opportunity) still needs verification, and manually sleeping/waking a real laptop on a schedule is not repeatable in CI or during planning.
**Why it happens:** Task Scheduler's missed-trigger catch-up is an OS-level behavior with no clean local simulation hook.
**How to avoid:** Split the verification into two independently testable claims: (1) `StartWhenAvailable` is a Windows built-in guarantee — verify the task's Settings XML has `<StartWhenAvailable>true</StartWhenAvailable>` and `<WakeToRun>false</WakeToRun>` after registration (`Get-ScheduledTask -TaskName ... | Select -Expand Settings`), which is fully automatable and does not require an actual sleep/wake cycle; (2) the actual DATA behavior when a run is "missed" is equivalent to any large-gap incremental run — this is fully testable by directly invoking `scripts/sync.ts` (or `runGmailSync`) with an artificially old `historyId`/`lastSync`, since D4-01's own rationale is "a single catch-up run covers the entire missed gap" regardless of when it actually executes.
**Warning signs:** A plan that requires literally suspending the test machine to "prove" ING-05 — this is neither necessary nor reliable; test the two claims above separately instead.

## Code Examples

Verified patterns from official sources / installed package types:

### Extending `GmailClient` for history + profile

```typescript
// Source: node_modules/googleapis/build/src/apis/gmail/v1.d.ts (installed
// googleapis@173.0.0) — Resource$Users$History.list, Resource$Users.getProfile
// src/gmail/types.ts (existing file) — add alongside listMessages/getMessageRaw/listLabels
export interface GmailHistoryRecord {
  messagesAdded?: { message?: { id?: string | null } }[];
}

export interface GmailHistoryListResult {
  history: GmailHistoryRecord[];
  historyId?: string;
  nextPageToken?: string;
}

export interface GmailClient {
  listMessages(params: GmailListMessagesParams): Promise<GmailListMessagesResult>;
  getMessageRaw(id: string): Promise<string>;
  listLabels(): Promise<GmailLabel[]>;
  // NEW for Phase 4:
  listHistory(params: {
    startHistoryId: string;
    pageToken?: string;
  }): Promise<GmailHistoryListResult>;
  getProfileHistoryId(): Promise<string | undefined>;
}
```

```typescript
// src/gmail/client.ts — real implementation, mirrors the existing
// wrapGmailClient pattern (q at top level, ids-only extraction)
async listHistory({ startHistoryId, pageToken }) {
  const res = await gmail.users.history.list({
    userId: "me",
    startHistoryId,
    historyTypes: ["messageAdded"], // ING-02/03/04 pipeline only cares about new mail
    pageToken,
    maxResults: 500,
  });

  return {
    history: (res.data.history ?? []).map((h) => ({
      messagesAdded: h.messagesAdded ?? [],
    })),
    historyId: res.data.historyId ?? undefined,
    nextPageToken: res.data.nextPageToken ?? undefined,
  };
},

async getProfileHistoryId() {
  const res = await gmail.users.getProfile({ userId: "me" });
  return res.data.historyId ?? undefined;
},
```

### Cursor-expiry-aware `runGmailSync` extension

```typescript
// src/domain/ingestion.ts — extends the existing signature additively;
// { lastSync } callers (syncGmailAction) keep working unchanged since
// historyId defaults to null.
export async function runGmailSync(
  db: NodeSQLiteDatabase,
  client: GmailClient,
  { lastSync, historyId }: { lastSync: Date | null; historyId: string | null },
): Promise<SyncCounts & { newHistoryId?: string; usedFallback: boolean }> {
  const counts: SyncCounts = { newCount: 0, reviewCount: 0, deadLetterCount: 0 };
  let usedFallback = historyId !== null; // flipped false below if history.list succeeds
  const stageIdByLabel = new Map(listStages(db).map((s) => [s.label, s.id]));

  let queryMessageIds: string[];
  if (historyId) {
    try {
      const result = await fetchHistoryMessageIds(client, historyId);
      queryMessageIds = result.messageIds;
      usedFallback = false;
    } catch (err) {
      if (err instanceof Common.GaxiosError && err.status === 404) {
        // D4-04: bounded fallback — same query as an ordinary lastSync run.
        const senderQuery = buildSenderQuery(KNOWN_SENDER_DOMAINS, lastSync ?? undefined);
        queryMessageIds = await listAllMessageIds(client, { q: senderQuery });
      } else {
        throw err; // never silently swallow a non-404 error
      }
    }
  } else {
    const senderQuery = buildSenderQuery(KNOWN_SENDER_DOMAINS, lastSync ?? undefined);
    queryMessageIds = await listAllMessageIds(client, { q: senderQuery });
  }

  // ...unchanged per-message loop, Pass 2 (label backfill), Pass 3 (dead-letter reparse)...

  const newHistoryId = await client.getProfileHistoryId(); // seed/refresh AFTER work completes
  return { ...counts, newHistoryId, usedFallback };
}
```

### Staleness alarm computation

```typescript
// src/components/ingestion-health.tsx — extend SyncHealth + escalation branch
const STALE_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // 2 days — per D4-03 default

function isStale(lastSuccessAt: Date | null): boolean {
  if (!lastSuccessAt) return false; // "never synced" is its own existing state, not "stale"
  return Date.now() - lastSuccessAt.getTime() > STALE_THRESHOLD_MS;
}

// In the render branch, BEFORE the existing lastSyncStatus === "failed" check
// (a stale success is a worse signal than a single recent failure — surface first):
if (isStale(lastSuccessAt)) {
  lastSyncLine = (
    <p className="text-[14px] leading-[1.5] font-semibold text-destructive">
      {`⚠ Sync is stale — last success ${formatRelativeTime(lastSuccessAt!)}`}
    </p>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Date-windowed full re-fetch (`after:YYYY/MM/DD`) on every sync | historyId-based incremental fetch, full re-fetch only as a bounded fallback | This phase (Phase 4) | Every ordinary sync becomes a small `history.list` call instead of re-listing every message since last sync — meaningfully fewer Gmail API calls and no re-processing of already-ingested mail through `isAlreadyIngested` checks (still safe either way, just less wasted work) |
| Manual-only sync ("Sync now" button) | Automatic daily + at-logon triggers via Task Scheduler, manual button still available | This phase (Phase 4) | Directly closes ING-05 — the core "stays accurate without me remembering" value proposition now applies to sync itself, not just parsing |

**Deprecated/outdated:** None — this phase extends rather than replaces prior-phase mechanisms; `syncGmailAction`'s manual trigger and `runGmailSync`'s pipeline both continue to exist and are reused, not deprecated.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 4-hour at-logon throttle window is the right default | Pattern 4 / D4-02 | Too short: Gmail gets hit more often than intended on a laptop that's opened/closed frequently through a workday. Too long: a user who opens the laptop for the first time that day doesn't get a fresh sync until the next daily trigger. Low risk either way since the daily trigger is a backstop, but worth confirming during planning per CONTEXT.md's explicit flag. |
| A2 | 2-day staleness threshold is the right default | Staleness alarm / D4-03 | Too short: the alarm fires after a single normal missed day (e.g. a weekend the laptop stays closed), creating alert fatigue. Too long: a genuinely broken scheduled task goes unnoticed longer than desired. CONTEXT.md already flags this as "confirm during planning." |
| A3 | `historyTypes: ["messageAdded"]` is sufficient (vs. also requesting label-change types) | Code Examples / Pattern 1 | If a message's stage-relevant status changes via a LABEL change rather than a new message arriving (unlikely for this project's ATS-email-based model, but possible for the "Job Search" label pass), restricting to `messageAdded` could miss it. Existing Pass 2 (label backfill) still re-scans the label with its own `after:` window regardless, so this is a low-risk assumption — worth a one-line confirmation during planning, not a redesign. |

## Open Questions

1. **Does the `Resource$Users$History.list` historyTypes filter interact with the existing label-backfill pass (Pass 2) in any way that needs adjustment?**
   - What we know: Pass 2 already independently re-lists the "Job Search" label with its own `after:`/`labelIds` query, entirely separate from the sender-query pass Pattern 1 targets.
   - What's unclear: Whether Pass 2 should ALSO eventually move to a historyId-based label-scoped `history.list({ labelId })` call, or stay as-is (full `after:`-windowed label re-scan every run).
   - Recommendation: Leave Pass 2 unchanged in this phase — CONTEXT.md's phase boundary only calls for the sender-query pass to switch to historyId ("Moving from full-fetch to historyId-based incremental sync" refers to the query pass per the code_context section pointing at `listAllMessageIds`/`buildSenderQuery`). Converting Pass 2 too would be a natural v2 follow-up but isn't required for ING-05/ING-07/criterion 3 as scoped.

2. **Should the fallback flag (`usedFallback`) be a new `sync_runs` boolean column, or folded into `errorMessage`/a note field?**
   - What we know: D4-04 requires the fallback to be "recorded loudly... a flag/note that a full-resync fallback occurred."
   - What's unclear: Exact column shape — a dedicated boolean is cleanest for the health UI to branch on, but adds one more additive column alongside `history_id`.
   - Recommendation: Add a small `used_fallback` boolean column (default false) alongside `history_id` in the same migration — cheap, and lets the health UI show a distinct "cursor expired, ran a full catch-up" state distinct from an ordinary success, without string-parsing a note field.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Windows Task Scheduler / `ScheduledTasks` PowerShell module | ING-05 automatic scheduling | ✓ (Windows 11 Pro, built-in) | Native to Windows 11 | — |
| `googleapis` (history.list, getProfile support) | ING-07, criterion 3 | ✓ | 173.0.0 installed | — |
| Node.js ≥ 24 (`node:sqlite`) | standalone script + existing DB layer | ✓ | v24.14.1 confirmed on this machine | — |
| `tsx` | `npx tsx scripts/sync.ts` invocation | ✓ | 4.23.1 installed | — |
| PowerShell (elevated, for one-time task registration) | Running `register-task.ps1` once | ✓ (PowerShell is the stated primary shell) | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — every dependency this phase needs is already present on the target machine and already installed in the project.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (existing) |
| Config file | `vitest.config.ts` (existing, `environment: "node"`, `@` alias to `src/`) |
| Quick run command | `npx vitest run tests/domain/ingestion.test.ts tests/domain/sync-state.test.ts` |
| Full suite command | `npm test` (`vitest run`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| Criterion 3 | historyId incremental path produces the same transition/review/dead-letter outcome as an equivalent full-fetch over the same messages | unit (fake `GmailClient` fixture, extend `tests/helpers/gmail.ts` with a `listHistory`/`getProfileHistoryId` fixture) | `npx vitest run tests/domain/ingestion.test.ts -t "history"` | ❌ Wave 0 — extend `makeFakeGmailClient` + add new describe block |
| ING-07 | `history.list` throwing a 404-shaped error triggers the bounded full-fetch fallback and records `usedFallback: true` | unit (inject a fake client whose `listHistory` rejects with a `GaxiosError`-shaped error, `status: 404`) | `npx vitest run tests/domain/ingestion.test.ts -t "cursor expiry"` | ❌ Wave 0 |
| ING-07 | A non-404 error from `history.list` still throws (fail-loud), does NOT trigger fallback | unit | `npx vitest run tests/domain/ingestion.test.ts -t "non-404"` | ❌ Wave 0 |
| ING-05 (data-shape half) | A "missed run" (large historyId gap) still produces the same correct event set as if it had run daily | unit — same fixture as criterion 3, just with a wider gap between fixture-seeded historyId and "current" | `npx vitest run tests/domain/ingestion.test.ts -t "catch-up"` | ❌ Wave 0 |
| ING-05 (scheduling half) | Registered task has `StartWhenAvailable=true`, `WakeToRun=false`, both triggers present | manual / smoke (cannot run in CI — no Windows Task Scheduler in the vitest sandbox) | `Get-ScheduledTask -TaskName "RecruitingDashboard-GmailSync" \| Select -Expand Settings` (manual, post-registration verification) | N/A — OS-level, not a vitest test |
| D4-02 throttle | At-logon invocation of `scripts/sync.ts` exits early when last success < throttle window | unit (test the throttle-check function in isolation, not the whole script) | `npx vitest run tests/scripts/sync-throttle.test.ts` (new file) | ❌ Wave 0 |
| D4-03 staleness | Health indicator escalates when no success in > threshold | unit/component (existing `ingestion-health.tsx` has no test file yet — check before assuming one needs to be created) | `npx vitest run tests/components/ingestion-health.test.tsx` (new, if none exists) | ❌ Wave 0 — verify whether a component test harness (jsdom/testing-library) already exists in this project before committing to this exact command |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/domain/ingestion.test.ts tests/domain/sync-state.test.ts`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`; the OS-level Task Scheduler registration check (manual `Get-ScheduledTask` inspection) is a required manual UAT step since it cannot be automated in vitest

### Wave 0 Gaps

- [ ] `tests/helpers/gmail.ts` — extend `FakeGmailFixtures`/`makeFakeGmailClient` with `historyByStartId` and `profileHistoryId` fixtures, plus a way to inject a rejecting `listHistory` (simulating the 404 fallback case) — this is the single foundational gap; every other new test in `ingestion.test.ts` depends on it
- [ ] Confirm whether a component-testing setup (jsdom environment, `@testing-library/react`) exists anywhere in the repo before committing to a D4-03 staleness-alarm component test — `vitest.config.ts` currently declares `environment: "node"` only, so a component test may need its own config block or a separate test file with an environment override comment
- [ ] `tests/scripts/` directory does not exist yet — new for the throttle-check unit test

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | No new surface | Existing `gmail.readonly` OAuth flow (Phase 3) is unchanged by this phase — no new auth code path introduced |
| V3 Session Management | N/A | This phase has no user-facing session; the standalone script runs unattended under the OS scheduler, not a browser session |
| V4 Access Control | Yes | The standalone script MUST mirror the exact `dashboardMode !== "real"` gate `syncGmailAction` already uses before touching `.secrets/`/Gmail — the single-DASHBOARD_MODE-reader invariant (`src/db/client.ts`) already enforces this at the module level, so the script only needs to import `dashboardMode` from the existing module, never re-derive it |
| V5 Input Validation | Yes | `newSyncRunInput` (zod, existing) already validates every `finishSyncRun` call; extend it to cover the new `historyId`/`usedFallback` fields the same way rather than bypassing validation for the new columns |
| V6 Cryptography | No new surface | No new secret/token handling introduced — the existing `.secrets/gmail-token.json` refresh-token storage (Phase 3, `src/gmail/oauth.ts`) is untouched |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Standalone script accidentally running against the demo store (or against real Gmail while `DASHBOARD_MODE=demo`) | Tampering / Information Disclosure | Import `dashboardMode` from the single existing `src/db/client.ts` module (never read `process.env.DASHBOARD_MODE` a second time in `scripts/sync.ts`) and assert `dashboardMode === "real"` before any Gmail/`.secrets/` access, exactly mirroring `syncGmailAction`'s existing gate |
| An unattended scheduled run's failure (e.g. expired OAuth refresh token, quota exceeded) going unnoticed for days | Denial of Service (of the "stays accurate" value prop) | D4-03's staleness alarm is the direct mitigation — a failed/absent run for > threshold escalates visibly in the UI the next time the user opens the dashboard |
| A malformed/adversarial 404 response body from a compromised or misbehaving proxy being misread as a legitimate cursor-expiry signal, triggering an unwanted full re-sync (denial-of-service-by-bandwidth against the user's own Gmail quota, not a real security boundary since this is a single-user local tool over HTTPS to Google's own API) | Tampering (low severity — no cross-user boundary exists in this single-user app) | Branch strictly on `err instanceof Common.GaxiosError && err.status === 404` (a typed, structural check against the actual HTTP response Google's TLS-terminated API returned), never on a string match against an error message |

## Sources

### Primary (HIGH confidence)
- `node_modules/googleapis/build/src/apis/gmail/v1.d.ts` (installed googleapis@173.0.0) — `Resource$Users$History.list`, `Params$Resource$Users$History$List`, `Schema$ListHistoryResponse`, `Schema$History`, `Resource$Users.getProfile`, `Schema$Profile.historyId` — read directly from the exact package version this project has installed
- `node_modules/gaxios/build/cjs/src/common.d.ts` (gaxios@7.3.0, transitive dep of `googleapis-common`) — `GaxiosError.status` field shape
- `node_modules/googleapis-common/build/src/index.d.ts` — confirms `GaxiosError` is re-exported and reachable via `googleapis`'s `Common` namespace export
- `src/domain/ingestion.ts`, `src/domain/sync-state.ts`, `src/app/actions.ts`, `src/gmail/client.ts`, `src/gmail/fetch.ts`, `src/gmail/query.ts`, `src/gmail/oauth.ts`, `src/db/schema.ts`, `src/db/validation.ts`, `src/db/client.ts`, `src/db/open-sqlite.ts`, `src/components/ingestion-health.tsx` — the actual, current repo code this phase extends
- `tests/helpers/gmail.ts`, `tests/domain/sync-state.test.ts`, `tests/domain/ingestion.test.ts` — existing test patterns/fixtures this phase's tests extend

### Secondary (MEDIUM confidence)
- developers.google.com `Method: users.history.list` / `Method: users.getProfile` (Gmail API reference, cross-checked via WebSearch against the installed-package JSDoc, which quotes the same doc text nearly verbatim)
- learn.microsoft.com PowerShell `ScheduledTasks` module docs (`New-ScheduledTaskTrigger`, `New-ScheduledTaskSettingsSet -StartWhenAvailable`) — cross-checked across multiple independent PowerShell tutorial sources describing the same `-Daily`/`-AtLogOn`/`-StartWhenAvailable` pattern
- sqlite.org Write-Ahead Logging docs + multiple independent WAL/busy_timeout explainer articles — cross-checked, consistent description of "one writer at a time, busy_timeout controls the wait"

### Tertiary (LOW confidence)
- None — every finding in this research was either directly verified against the installed package/repo code, or cross-checked across multiple independent web sources before being recorded above MEDIUM confidence.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; `googleapis`/`tsx`/`drizzle-kit` versions confirmed directly from `package.json` and `node_modules`
- Architecture: HIGH — every pattern is a direct, additive extension of code read from the repo (`runGmailSync`, `GmailClient`, `sync_runs`, `ingestion-health.tsx`); the historyId API shape is confirmed against the installed package's own type definitions, not just documentation
- Pitfalls: HIGH for Gmail-API-specific pitfalls (directly sourced from installed-package JSDoc); MEDIUM for the Windows Task Scheduler at-logon-storm pitfall (based on cross-checked but not project-verified Windows session-event behavior)

**Research date:** 2026-08-03
**Valid until:** 30 days (stable APIs — Gmail's `history.list` contract and Windows Task Scheduler are both long-stable surfaces; re-verify `googleapis` version drift if planning is delayed past a `googleapis` major bump)
