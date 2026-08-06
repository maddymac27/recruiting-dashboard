<#
  Recruiting Dashboard — Gmail sync scheduled task registration (ING-05).

  Registers a Windows Task Scheduler task that runs scripts/sync.ts:
    - once a day (daily trigger), and
    - once at every logon/unlock (at-logon trigger, throttled internally by
      scripts/sync.ts's shouldThrottle — a 4-hour window, D4-02/D4-A1).

  D4-01 (catch-up only, no wake-timer): -StartWhenAvailable makes a missed
  trigger fire on the next available opportunity (the machine wakes/boots)
  instead of waking the machine at the scheduled time. -WakeToRun is
  deliberately OMITTED below — this task declines the hardware-dependent
  wake-timer entirely (D4-01's whole rationale: an incremental catch-up run
  covers the entire missed gap regardless of when it actually executes).

  scripts/sync.ts dynamically imports src/gmail/client.ts and
  src/gmail/oauth.ts at runtime, both of which carry `import "server-only"` —
  a guard whose conditional-exports map only no-ops under Next.js's own
  "react-server" bundler resolution condition. A plain `tsx` process must be
  told to use that same condition via --conditions=react-server, or that
  import throws (discovered empirically during 04-03 execution). The
  DASHBOARD_MODE=real assignment below is scoped to this one cmd.exe child
  process only — it is never written as a persistent machine/user
  environment variable, so no other process or shell is affected.

  Run ONCE, in an elevated PowerShell session (any working directory is
  fine — $repoPath below is resolved from this script's own location):

    powershell -ExecutionPolicy Bypass -File scripts/register-task.ps1

  Idempotent / re-runnable: unregisters any existing task of the same name
  before re-registering, so re-running this after an edit (e.g. a new daily
  time) is safe.

  Verify after registering (fully automatable, no real sleep/wake needed —
  RESEARCH Pitfall 6):

    Get-ScheduledTask -TaskName "RecruitingDashboard-GmailSync" |
      Select-Object -ExpandProperty Settings |
      Select-Object StartWhenAvailable, WakeToRun
    # Expect: StartWhenAvailable = True, WakeToRun = False
#>

$ErrorActionPreference = "Stop"

# Fail loud on the #1 setup mistake: registering a task in the root task
# folder requires an elevated (Administrator) session. A non-elevated run
# gets "Access is denied" (0x80070005) from the CIM layer, which does NOT
# reliably honor $ErrorActionPreference above — so guard explicitly here and
# refuse with an actionable message rather than pressing on to a false
# "Registered ..." success line.
$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent() `
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Error @"
This script must be run in an ELEVATED PowerShell (Run as administrator).
Registering a scheduled task in the root task folder requires admin rights;
a normal session fails with 'Access is denied' (0x80070005).

Fix: close this window, right-click Windows PowerShell -> 'Run as
administrator', then:
  cd $((Resolve-Path (Join-Path $PSScriptRoot '..')).Path)
  ./scripts/register-task.ps1
"@
  exit 1
}

$taskName = "RecruitingDashboard-GmailSync"
$repoPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

# DASHBOARD_MODE=real is set for this cmd.exe invocation only (D4-05,
# real-mode only). --conditions=react-server unblocks the server-only-guarded
# dynamic imports inside scripts/sync.ts (see header comment above).
$action = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument '/c set "DASHBOARD_MODE=real" && npx.cmd tsx --conditions=react-server scripts/sync.ts' `
  -WorkingDirectory $repoPath

$dailyTrigger = New-ScheduledTaskTrigger -Daily -At "8:00AM"
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn

# StartWhenAvailable = "run ASAP after a missed start" (D4-01 catch-up).
# WakeToRun is deliberately OMITTED (defaults to false) — DO NOT add
# -WakeToRun here; D4-01 declines the wake-timer entirely.
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
  Write-Host "Unregistering existing task '$taskName' before re-registering..."
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger @($dailyTrigger, $logonTrigger) `
  -Settings $settings `
  -Description "Recruiting Dashboard: daily + at-logon incremental Gmail sync (ING-05/ING-07)." `
  -ErrorAction Stop `
  | Out-Null

# Fail loud: never announce success unless the task is actually present. The
# Register-ScheduledTask CIM error can surface without terminating the script,
# so confirm the task exists before printing the success line.
$registered = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $registered) {
  Write-Error "Registration did not create task '$taskName' (no error was thrown, but the task is absent). Refusing to report success. Re-run in an elevated PowerShell, or paste this output back."
  exit 1
}

Write-Host "Registered scheduled task '$taskName' (daily 8:00 AM + at-logon, catch-up only, no wake-timer)."
Write-Host "Verify: Get-ScheduledTask -TaskName '$taskName' | Select-Object -ExpandProperty Settings"
