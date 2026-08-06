---
phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
plan: 10
subsystem: ui
tags: [nextjs, sidebar, ingestion-health, shadcn-alert, shadcn-badge, relative-time]

# Dependency graph
requires:
  - phase: 03-03
    provides: Sidebar Ingestion Health block shell (connected/not-connected + Sync now, src/components/ingestion-health.tsx)
  - phase: 03-05
    provides: getLatestSyncRun / getReviewCount / getDeadLetterCount (src/domain/sync-state.ts)
  - phase: 03-06
    provides: sync_runs population on every sync attempt (running -> success|failed)
  - phase: 03-08
    provides: /review queue route (dead-letter-badge link target)
  - phase: 03-09
    provides: /dead-letter queue route (dead-letter-badge link target)
provides:
  - Sidebar last-sync line (success / persistent destructive failure / running / never-synced) driven by a server-read syncHealth prop
  - Review (N) and Dead-letter (M) count badges linking to /review and /dead-letter, dead-letter turning destructive-red only when > 0
  - Persistent, non-dismissible REL-04 risk note (locked copy) rendered in both real and demo modes
  - layout.tsx extended as the single dashboardMode/db reader to also read getLatestSyncRun/getReviewCount/getDeadLetterCount and thread a typed SyncHealth prop through nav-shell.tsx to IngestionHealth
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Intl.RelativeTimeFormat used directly (no new date library) for the sidebar's relative-time strings, with a fixed year/month/week/day/hour division ladder"
    - "SyncHealth type/interface defined and exported from the client component (ingestion-health.tsx) rather than importing the server-only src/db/validation.ts SyncRunStatus type, keeping the client component's only type dependency self-contained"

key-files:
  created: []
  modified:
    - src/app/layout.tsx
    - src/components/nav-shell.tsx
    - src/components/ingestion-health.tsx
    - src/components/ui/alert.tsx

key-decisions:
  - "REL-04 risk note renders in demo mode too (not just real mode) — it discloses a fixed property of the pipeline's design, not live sync state, so showing it in demo mode does not violate the demo/real data-separation boundary (T-03-02's threat register explicitly treats REL-04 disclosure as separate from the last-sync/count props that must stay real-mode-only)"
  - "lastSyncStatus typed as a local SyncRunStatus union re-declared in ingestion-health.tsx (client component) rather than importing src/db/validation.ts's SyncRunStatus, to avoid pulling any server-only validation module into client-bundle scope"
  - "Review/Dead-letter count badges render regardless of isConnected (not gated behind a successful sync) since queue state can be non-zero from a prior connection/session and REL-03's 'at a glance' requirement calls for always-visible numerals"

requirements-completed: [REL-03, REL-04]

coverage:
  - id: D1
    description: "Sidebar last-sync line shows success ('Last synced {relative time}'), never-synced ('Never synced'), and running ('Syncing…') states derived from the syncHealth prop"
    requirement: "REL-03"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: other
        ref: "grep 'Last sync failed' src/components/ingestion-health.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Failed-sync state renders as persistent destructive-colored text ('Last sync failed — {relative time}') driven by the stored sync_runs status, not a transient toast, and survives a page reload"
    requirement: "REL-03"
    verification:
      - kind: manual_procedural
        ref: "Human visually verified against real synced data in a running dev server (DASHBOARD_MODE=real); confirmed the code path is driven by getLatestSyncRun's persisted status (not component state) and accepted the persistence guarantee without forcing a live token break"
        status: pass
    human_judgment: true
    rationale: "Forcing an actual sync failure requires breaking the real Gmail token file and re-syncing against the live inbox — the human reviewed the implementation (status sourced from the DB, not local React state) and confirmed persistence is structurally guaranteed rather than requiring a destructive live test."
  - id: D3
    description: "Review (N) and Dead-letter (M) count badges always show a numeral (including 0), link to /review and /dead-letter, and the dead-letter badge switches to destructive styling only when its count is > 0 while the review badge stays neutral"
    requirement: "REL-03"
    verification:
      - kind: manual_procedural
        ref: "Human visually verified in the running dev server: Review (43) and Dead-letter (18) badges rendered, linking to their queues"
        status: pass
    human_judgment: true
    rationale: "Visual color/link verification against a live rendered page."
  - id: D4
    description: "A persistent, non-dismissible, neutral-styled REL-04 risk note with the locked copy is visible in the sidebar on every page"
    requirement: "REL-04"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: other
        ref: "grep 'Review your inbox periodically' src/components/ingestion-health.tsx"
        status: pass
      - kind: manual_procedural
        ref: "Human visually confirmed the note's presence and neutral (non-destructive) styling in the running dev server"
        status: pass
    human_judgment: true
    rationale: "Visual styling/placement confirmation (neutral vs. destructive, no close button) requires a human look at the rendered page."
  - id: D5
    description: "ingestion-health.tsx (client) still imports no db client — sync status and counts arrive only as props from layout.tsx, the single dashboardMode/db reader"
    requirement: "REL-03"
    verification:
      - kind: unit
        ref: "grep -L '@/db/client' src/components/ingestion-health.tsx (negative match required by plan verify command)"
        status: pass
    human_judgment: false

duration: ~25min active work (2 auto tasks + 1 human-verify checkpoint pause)
completed: 2026-07-31
status: complete
---

# Phase 3 Plan 10: Sidebar Ingestion Health — Last-Sync Status, Queue Badges, REL-04 Risk Note Summary

**Completed the sidebar Ingestion Health block with a last-sync success/failure/never-synced line (failure persists in destructive color until the next success), Review/Dead-letter count badges (dead-letter turns red only when > 0), and a permanent non-dismissible REL-04 risk note — closing the fail-loud surfacing loop and Phase 3.**

## Performance

- **Duration:** ~25 min of active work across 2 auto tasks (both committed within ~10 seconds of each other), followed by a human-driven visual-verification checkpoint pause.
- **Started:** 2026-07-31T18:00Z (Task 1 commit `fe2fc72`)
- **Completed:** 2026-07-31T18:35Z (this summary)
- **Tasks:** 3/3 (2 auto tasks + 1 blocking human-verify checkpoint, all complete)
- **Files modified:** 4

## Accomplishments
- `src/app/layout.tsx` now reads `getLatestSyncRun`/`getReviewCount`/`getDeadLetterCount` alongside its existing `hasStoredToken()` call, and derives a single typed `syncHealth` prop (`lastSyncAt`, `lastSyncStatus`, `reviewCount`, `deadLetterCount`, `hasEverSynced`) — remains the ONLY module reading `dashboardMode`/`db` (T-03-02, D-13 invariant preserved)
- `src/components/nav-shell.tsx` threads the new `syncHealth` prop through to `IngestionHealth` without importing the db client
- `src/components/ingestion-health.tsx` extended with: a last-sync line covering success/failed(persistent destructive)/running/never-synced states via `Intl.RelativeTimeFormat`; Review (N) and Dead-letter (M) `Badge` links to `/review` and `/dead-letter` (dead-letter switches to `variant="destructive"` only at count > 0); and a persistent, non-dismissible shadcn `Alert` carrying the locked REL-04 copy verbatim, rendered in both real and demo modes
- Added the shadcn `alert` primitive (`src/components/ui/alert.tsx`) via `npx shadcn@latest add alert`
- Human visually verified the block against real synced data: "Last synced 17 minutes ago", Review (43) + Dead-letter (18) badges linking to their queues, and the persistent REL-04 note — REL-03 and REL-04 confirmed surfaced

## Task Commits

Each task was committed atomically:

1. **Task 1: layout + nav-shell data plumbing (single db reader → props)** - `fe2fc72` (feat)
2. **Task 2: ingestion-health — last-sync line, count badges, persistent REL-04 risk note** - `a71d4b3` (feat)
3. **Task 3: Visual verification of the ingestion-health block** - human-verify checkpoint, approved (no code commit)

**Plan metadata:** (this commit, following SUMMARY write)

## Files Created/Modified
- `src/app/layout.tsx` - Reads getLatestSyncRun/getReviewCount/getDeadLetterCount, derives and passes the `syncHealth` prop to NavShell
- `src/components/nav-shell.tsx` - Forwards `syncHealth` prop to IngestionHealth
- `src/components/ingestion-health.tsx` - Last-sync line (success/failed/running/never-synced), Review/Dead-letter count badges, persistent REL-04 `Alert`
- `src/components/ui/alert.tsx` - shadcn `alert` primitive (added via `npx shadcn@latest add alert`)

## Decisions Made
- REL-04's risk note renders even in demo mode (task instruction: "the risk note renders whenever the shell renders") since it's fixed, code-authored copy about the pipeline's design rather than live sync state — does not cross any real-data boundary.
- Re-declared a local `SyncRunStatus` union in the client component instead of importing `src/db/validation.ts`'s type, keeping the client bundle free of any (even type-only) coupling to server-only validation code.
- Count badges render unconditionally in real mode (not gated on `isConnected`) so a prior session's queue state stays visible at a glance even before a fresh reconnect/sync.
- The `running` sync-run status (a stuck/in-progress row on page load, distinct from the local `isSyncPending` transition state during an active click) renders a muted "Syncing…" line — a small Rule 2 addition beyond the plan's three explicitly named states (success/failed/never-synced), added for correctness so no sync_runs status value is left unhandled.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added a `running`-status last-sync line**
- **Found during:** Task 2 (ingestion-health.tsx last-sync line implementation)
- **Issue:** The plan's must_haves enumerate three last-sync states (success, failed, never-synced), but `sync_runs.status` can also be `"running"` (e.g. a page load that races an in-flight sync, or a crashed run left in `running`). Without a branch for it, that case would silently fall through to the "Never synced" text, which misrepresents an in-progress/stuck run as no-history.
- **Fix:** Added an explicit `lastSyncStatus === "running"` branch rendering a muted "Syncing…" line, so every value of the `SyncRunStatus` union is handled.
- **Files modified:** `src/components/ingestion-health.tsx`
- **Verification:** `npx tsc --noEmit` passes; the branch is exhaustive over the three-value union in practice (plan's required states remain unchanged in copy/color).
- **Committed in:** `a71d4b3` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing-critical addition for an unhandled sync-run status value)
**Impact on plan:** No scope creep — purely a defensive completeness fix over the plan's own `lastSyncStatus` union; no behavior change to the three named states.

## Issues Encountered
A stray, already-running `next dev` process (PID 15300, left over from an earlier session) occupied port 3000 when I attempted to start a fresh verification server. Rather than killing a process that might have been the user's own active session, I confirmed via a direct HTTP fetch that the existing process had already hot-reloaded this plan's code changes (response HTML contained "Last synced", "Sync now", "Review (", "Dead-letter (", and the REL-04 copy), and used it as the verification server instead of starting a duplicate. No action needed — the human's checkpoint approval confirms this worked correctly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

- **REL-03 and REL-04 are both satisfied**: the sidebar surfaces last-sync status/time (with a DB-persisted, not component-state, failure signal), live Review/Dead-letter counts linking to their queues, and a permanent visible REL-04 disclosure — closing the fail-loud surfacing loop this phase was built around.
- **Phase 3 (Gmail Ingestion, Entity Resolution & Fail-Loud Surfacing) is now complete** — this was its final plan (10 of 10). All phase requirements (ING-01, ING-02, ING-03, ING-04, ING-06, REL-01, REL-02, REL-03, REL-04, CAP-03) are complete.
- The failed-sync-persists-across-reload guarantee was accepted on code-review grounds (status is read fresh from `getLatestSyncRun` on every server render, not local component state) rather than by forcing a live Gmail token break — if a future phase wants a fully live-fault-injected verification of this path, that would need a dedicated test harness or a disposable token fixture, not the real `.secrets/gmail-token.json`.
- No blockers for Phase 4 (daily automatic sync + missed-run catch-up, ING-05/ING-07) or Phase 5 (dashboard "what needs me today" / analytics).

---
*Phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing*
*Completed: 2026-07-31*

## Self-Check: PASSED

All claimed files verified present on disk (src/app/layout.tsx, src/components/nav-shell.tsx, src/components/ingestion-health.tsx, src/components/ui/alert.tsx). Both task commits (`fe2fc72`, `a71d4b3`) verified present in `git log`.
