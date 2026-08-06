# 04-04 Summary — Register scheduled task & confirm catch-up-only settings

**Plan:** 04-04 (Wave 4) · **Type:** human-verify checkpoint (blocking) · **Requirement:** ING-05 (OS/scheduling half)
**Completed:** 2026-08-03

## Outcome

The Windows scheduled task **`RecruitingDashboard-GmailSync`** is registered and confirmed correctly configured, closing the OS-config half of ING-05 that cannot be unit-tested in the vitest sandbox (04-VALIDATION Manual-Only row).

Verified via `Get-ScheduledTask` (user's elevated session + orchestrator read-only re-inspection):

| Property | Expected (D4-01/D4-02) | Actual |
|----------|------------------------|--------|
| `StartWhenAvailable` | True (missed-run catch-up) | **True** ✓ |
| `WakeToRun` | False (no wake-timer) | **False** ✓ |
| Daily trigger | present, 8:00 AM | `MSFT_TaskDailyTrigger`, DaysInterval 1, 08:00 ✓ |
| AtLogOn trigger | present | `MSFT_TaskLogonTrigger` ✓ |
| Action | `tsx scripts/sync.ts`, real mode, repo cwd | `cmd.exe /c set "DASHBOARD_MODE=real" && npx.cmd tsx --conditions=react-server scripts/sync.ts`, WorkingDirectory = repo ✓ |
| State | — | Ready ✓ |

All `must_haves` (truths + artifacts + key_links) satisfied; the `WakeToRun=False` prohibition is explicitly confirmed.

## Deviation surfaced & fixed during the gate

The first (non-elevated) registration attempt hit `Register-ScheduledTask : Access is denied (0x80070005)` — but `scripts/register-task.ps1` **still printed a "Registered scheduled task ..." success line**, a false-success that violates the project's fail-loud constraint. The top-level `$ErrorActionPreference = "Stop"` did not catch the CIM-layer error, and there was no post-check.

**Fix (commit `106d6f4`, `fix(04-04): fail-loud register-task.ps1`):**
- Added an Administrator elevation guard at the top — refuses with an actionable "Run as administrator" message + `exit 1` instead of proceeding.
- Added `-ErrorAction Stop` on `Register-ScheduledTask` **plus** a post-registration `Get-ScheduledTask` existence check — the script now never prints success unless the task is actually present.

After re-running in an elevated PowerShell, registration succeeded and all settings/triggers verified as above.

## Notes / carried-forward

- **OAuth-in-Production prerequisite (Phase 3):** for unattended runs to keep working, the Gmail consent screen must be published to Production so refresh tokens don't expire after 7 days. If a run still fails on token expiry, the 04-03 staleness banner + the recorded failed `sync_runs` row surface it loudly (fail-loud, D4-03) — it does not silently stop.
- No repo files were produced by this plan beyond the `register-task.ps1` fail-loud fix; it registers/verifies OS state created from the 04-03 script.

## Tasks

- [x] Task 1 (human-verify, blocking): Register the scheduled task and confirm StartWhenAvailable=True, WakeToRun=False, and both Daily + AtLogOn triggers.
