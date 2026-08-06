---
phase: 3
slug: gmail-ingestion-entity-resolution-fail-loud-surfacing
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-29
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already configured in Phase 1) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run <changed-test-file> --exclude '**/.claude/**'` |
| **Full suite command** | `npx vitest run --exclude '**/.claude/**'` |
| **Estimated runtime** | ~2–5 seconds (full suite currently 55 tests) |

> NOTE: always pass `--exclude '**/.claude/**'` — an unrelated stray worktree under `.claude/worktrees/` pollutes vitest discovery with stale duplicate tests (documented in `deferred-items.md`). `npm test` alone will report false failures.

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched domain/db test.
- **After every plan wave:** Run the full suite command.
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** ~10 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _pending_ | — | — | — | — | — | — | — | — | ⬜ pending |

> Populated from PLAN task `<verify><automated>` blocks by `/gsd-validate-phase` after planning/execution. Every requirement (ING-01/02/03/04/06, REL-01/02/03/04, CAP-03) must map to at least one automated command or a documented manual-only entry below.

---

## Wave 0 Requirements

- [ ] Gmail API integration tests need a fake/stubbed Gmail transport (do not hit the live API in unit tests) — establish a test double for `users.messages.list/get` and `users.labels.list`.
- [ ] Per-sender parser fixtures — captured real (redacted) Handshake / Workday / Ashby sample emails as test inputs, added at execution time from real-inbox sampling (D3-02).
- [ ] Dead-letter / review-queue domain tests reuse the existing `tests/helpers/db.ts` `createTestDb` harness.

*Framework already installed (vitest) — no framework bootstrap needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| One-time OAuth connect + refresh-token mint | ING-01 | Requires a real Google consent grant signed in as the job-search account; cannot be automated without live credentials | Click "Connect Gmail" → complete Google consent as the job-search account → confirm the sidebar switches to a connected/last-sync state and a token persists in `.secrets/` |
| First real manual sync end-to-end | ING-02/03/04/06 | Depends on live inbox contents | Click "Sync now" → confirm ATS mail + labeled mail import into transitions/review/dead-letter as expected |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
