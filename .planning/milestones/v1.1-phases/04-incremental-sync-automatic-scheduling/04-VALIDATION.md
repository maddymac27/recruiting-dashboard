---
phase: 4
slug: incremental-sync-automatic-scheduling
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-03
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already configured — see `vitest.config.*` / Phase 1 harness) |
| **Config file** | existing repo vitest config |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~{N} seconds (fill during planning) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | ING-07 | — | Incremental historyId path yields the SAME deduped event set as full-fetch (criterion 3) | unit | `npm run test` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | ING-07 | — | Expired/invalid startHistoryId (Gaxios 404) triggers bounded full-resync fallback, not silent stop | unit | `npm run test` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 2 | ING-05 | — | Standalone script records a sync_runs row per attempt + at-logon throttle skips within window | unit | `npm run test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*This map is a plan-phase seed — the planner/executor refines Task IDs, requirements, and commands to match the final PLAN.md task breakdown.*

---

## Wave 0 Requirements

- [ ] Test fixtures for a fake Gmail `users.history.list` client (added message ids across pages) — proves incremental == full (criterion 3) deterministically without live Gmail.
- [ ] Test fixture that throws a Gaxios-shaped `{ status: 404 }` from `history.list` — proves the ING-07 fallback branch without waiting for real history to age out.
- [ ] `sync_runs` cursor/fallback columns present via additive migration before tests referencing them run.

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Windows Task Scheduler fires the daily + at-logon triggers and catches up after a missed start | ING-05 | Task Scheduler trigger firing + missed-run catch-up is OS-level behavior that cannot be unit-tested in-process | Register the task via the checked-in PowerShell script; simulate a missed run (leave machine off past the scheduled time, then boot) and confirm a new `sync_runs` row appears on next logon; confirm "run ASAP after missed start" is set and "Wake the computer" is OFF (D4-01). |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
