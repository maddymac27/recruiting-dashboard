# Phase 4: Incremental Sync & Automatic Scheduling - Context

**Gathered:** 2026-08-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade the existing **manual, date-windowed full-fetch** sync (Phase 3's `syncGmailAction` → `runGmailSync`) into a self-running system that: (1) syncs automatically once daily with missed-run catch-up when the laptop was asleep/off (ING-05), (2) switches the fetch path from full-fetch to **historyId-based incremental** while producing the same correct, deduplicated event set (success criterion 3), and (3) **falls back to a full re-sync when the historyId cursor expires** instead of silently stopping (ING-07).

**Requirements:** ING-05, ING-07 (plus success criterion 3 — incremental correctness parity).

**In this phase:** Windows Task Scheduler wiring (daily + at-logon triggers, catch-up), a standalone sync script that reuses the existing `runGmailSync` domain path, historyId cursor storage + `users.history.list` incremental fetch, cursor-expiry → full-resync fallback, and fail-loud surfacing of failed/stale **unattended** runs.

**NOT in this phase:** New parsers or sender coverage (Phase 3 scope). Analytics / today-view / staleness-of-*applications* (Phase 5 — distinct from sync staleness). The REL-04 unlisted-domain recall gap remains a carried-forward open risk, not closed here.
</domain>

<decisions>
## Implementation Decisions

### Wake + catch-up behavior (discussed)
- **D4-01: Catch-up only — do NOT enable the Task Scheduler wake-timer.** Schedule the daily task but rely on Settings → *"Run task as soon as possible after a scheduled start is missed"* so a sync fires on the next wake/boot rather than waking the machine. Rationale: because the fetch path is incremental, a single catch-up run covers the entire missed gap (all history since the stored cursor), so waking at a fixed time and catching-up-on-open produce identical **data** — just at different moments. This deliberately sidesteps the Phase 3 open blocker (*"wake-timer reliability is hardware-dependent, needs direct hardware testing"*): with wake-timer off, there is nothing hardware-flaky to depend on. Do **not** enable *"Wake the computer to run this task"* (Conditions tab).
- **D4-02: Two triggers — daily schedule + at-logon.** Add an at-logon (login/unlock) trigger alongside the daily schedule so data is freshest the moment the user actually opens the laptop (best serves "stays accurate without me remembering"). The at-logon trigger MUST be **throttled**: skip if a sync already ran successfully within the last few hours (planner to pick the exact window — a few hours is the intent), so opening/locking repeatedly doesn't hammer Gmail. Both triggers route through the same standalone script and the same `runGmailSync` path.

### Claude's Discretion — DEFAULTS set for the three areas not deep-dived (user to CONFIRM during planning)

- **D4-03: Unattended failure visibility (fail-loud) — extend the existing in-app health surfacing with a staleness alarm; no OS notification this phase.** The Phase 3 ingestion-health indicator (03-10) already shows last-sync success/failure/time by reading the latest `sync_runs` row. Requirements for this phase:
  1. The **standalone scheduled script MUST record every attempt as a `sync_runs` row** (running → success|failed, with `errorMessage`) exactly like `syncGmailAction` does — so the indicator has truth to read even for runs the user never watched. A failed unattended run leaves a visible failed row; it is never swallowed.
  2. Add a **staleness alarm**: if there has been **no successful sync in > ~2 days** (i.e. more than one missed daily cycle), the health indicator escalates to a prominent "⚠ Sync is stale — last success N days ago" state, distinct from a normal "last synced X ago" line. This is the fail-loud backstop for the catch-up-only model: if the machine was off for a week OR the task silently stopped firing, the staleness banner makes it impossible to miss on next open. Threshold is a default — confirm during planning.
  3. **In-app only** for this phase (no Windows toast / OS-level notification) to stay low-effort and add no new dependency. OS-level notification captured as a **deferred idea**.
  ⚠️ Confirm during planning.

- **D4-04: Cursor-expiry full-resync scope = bounded by last successful sync, NOT the entire label.** When `users.history.list` returns 404 / the stored historyId is expired-or-invalid, fall back to the **existing date-windowed full-fetch** path with `after:` = the last successful run's window (the mechanism Phase 3 already uses via `getLatestSyncRun` → `lastSync`). Rationale: the `ingested_messages` dedup ledger already guarantees no duplicates regardless of window size, so re-fetching only since last success is correct AND fast; re-fetching the whole "Job Search" label on every expiry would be needlessly slow. Cold start / no prior successful sync = the same first-run backfill Phase 3 already handles. The fallback MUST be **recorded loudly** on the sync run (e.g. a flag/note that a full-resync fallback occurred) so cursor-expiry events are observable, not invisible. ⚠️ Confirm during planning.

- **D4-05: Scheduling mechanism = Windows Task Scheduler + standalone `tsx` sync script reusing `runGmailSync` (per CLAUDE.md); NOT node-cron.** One code path for both manual and scheduled sync so incremental/dedup/fail-loud behavior is provably identical. Specifics (all Claude's discretion, confirm in planning):
  - Script lives under a new `scripts/` dir (e.g. `scripts/sync.ts`), invoked as `npx tsx scripts/sync.ts` by the scheduled task. It imports and calls the **same** `runGmailSync` + sync-run lifecycle used by `syncGmailAction`, owning its own DB write via the server-only client. **Real-mode only** — the script must never touch the demo store (mirror the `dashboardMode !== "real"` gate).
  - **historyId cursor storage:** default is to carry the cursor on the successful `sync_runs` row (add a `history_id` column; `getLatestSyncRun`/last-successful-run already the natural read point), avoiding a new table. Planner may instead use a dedicated single-row sync-state/settings table if that reads cleaner — either is acceptable; the constraint is "one authoritative cursor, real-mode, read from the last *successful* sync."
  - **Incremental mechanism (success criterion 3):** use Gmail `users.history.list` with `startHistoryId` = stored cursor to enumerate changed message ids since last sync, then feed those ids through the existing fetch/parse/route/dedup pipeline. Seed/refresh the cursor from a current historyId (e.g. `users.getProfile().historyId` or the newest message's historyId) captured on each successful run. First run with no cursor → full-fetch path seeds the first cursor. Research/planning to finalize the exact seeding call and 404-detection.
  ⚠️ Confirm during planning.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project constraints & recommended stack
- `.claude/CLAUDE.md` — §Scheduling / §Stack Patterns by Variant / §What NOT to Use: **Windows Task Scheduler running a standalone Node/`tsx` script** is the recommended scheduler (enable "run ASAP after a missed start"; note it also recommends "wake the computer" — **this phase declined the wake-timer per D4-01**). Explicitly rejects hand-rolling a cron loop and `node-cron` unless already running an always-on service. Also documents the sync script owning the DB write path while the Next.js app just reads the same SQLite file.
- `.planning/PROJECT.md` — core value ("stays accurate without me remembering to update it") and the **fail-loud reliability constraint** ("a silently missed email recreates the exact forgetting problem… while creating false confidence") — the direct rationale for D4-03's staleness alarm.
- `.planning/REQUIREMENTS.md` §Ingestion — ING-05 (daily auto-sync + missed-run catch-up) and ING-07 (cursor-expiry → full-resync fallback) full definitions.
- `.planning/ROADMAP.md` §Phase 4 — goal + three success criteria (incl. criterion 3: incremental path must produce the same deduplicated event set as a full sync).

### Prior-phase context this builds directly on
- `.planning/phases/03-gmail-ingestion-entity-resolution-fail-loud-surfacing/03-CONTEXT.md` — D3-01 (regex-only, **no LLM / nothing leaves the machine** — still binding), D3-05 (min parse bar company+status+date; real event date required), D3-06 (dedup on message id; query↔label overlap handling), and the OAuth "published to Production" refresh-token note.

### Existing code to reuse / extend (real relative paths)
- `src/domain/ingestion.ts` — `runGmailSync(db, client, { lastSync })`: the single orchestrator the scheduled script MUST reuse. Currently full-fetch via `listAllMessageIds`; this phase adds the historyId-incremental path in front of it and the expiry fallback into it.
- `src/domain/sync-state.ts` — `startSyncRun` / `finishSyncRun` / `getLatestSyncRun` (health-indicator source), plus `isAlreadyIngested` / `recordIngestedTx` (the dedup ledger that makes any window size safe).
- `src/db/schema.ts` — `syncRuns` table (add `history_id` per D4-05 option A) and `ingestedMessages` ledger.
- `src/app/actions.ts` — `syncGmailAction`: the existing manual trigger + window logic (`lastSync` = last *successful* run's `finishedAt`) that the fallback path (D4-04) reuses and the script mirrors.
- `src/gmail/client.ts` / `src/gmail/fetch.ts` / `src/gmail/query.ts` — `listMessages` (needs a sibling `history.list` call), `listAllMessageIds`, `buildSenderQuery(domains, afterDate)`.
- `src/components/ingestion-health.tsx` — the surface D4-03's staleness alarm extends.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Whole sync path (`runGmailSync`)** is already a clean, transaction-per-message orchestrator with dead-letter reparse — reuse verbatim from both the Server Action and the new script (no fork).
- **Dedup ledger (`ingested_messages`)** already guarantees "no duplicates on re-run at any window size" — this is what makes the incremental↔fallback switch safe (success criterion 3 largely rests on it).
- **`sync_runs` lifecycle + `getLatestSyncRun`** already power the health indicator; extend rather than replace for unattended-run visibility.

### Established Patterns
- Server-only DB access, `node:sqlite` + Drizzle (Node ≥ 24), Zod-validate before every write, real-mode gate (`dashboardMode !== "real"`) before any `.secrets/` / Gmail access — the standalone script must honor all of these.
- Fail-loud: every attempt recorded as a `sync_runs` row; failures surfaced, never swallowed.

### Integration Points
- New `scripts/sync.ts` (Task Scheduler entry) → existing domain layer.
- New `history.list` fetch + cursor storage → in front of existing `runGmailSync`.
- Staleness alarm → existing `ingestion-health.tsx` reading `sync_runs`.

</code_context>

<specifics>
## Specific Ideas

- "Catch-up only, no wake-timer" and "daily + throttled at-logon trigger" are firm user choices (D4-01/D4-02), chosen specifically to route around the hardware-dependent wake-timer blocker.

</specifics>

<deferred>
## Deferred Ideas

- **OS-level (Windows toast) notification on sync failure/staleness** — considered under D4-03; deferred to keep this phase in-app and dependency-free. Candidate for a later polish phase if the in-app staleness banner proves insufficient because the user isn't opening the app.
- **Periodic wider-net subject-keyword inbox scan** to partially mitigate the REL-04 unlisted-domain recall gap — already a roadmap-level carried-forward risk (v2 candidate), not this phase.

</deferred>

---

*Phase: 4-Incremental Sync & Automatic Scheduling*
*Context gathered: 2026-08-03*
