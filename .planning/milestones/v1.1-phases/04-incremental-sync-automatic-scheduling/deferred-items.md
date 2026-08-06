# Deferred Items — Phase 4

Out-of-scope discoveries logged during plan execution (per executor scope-boundary rule — not fixed, only recorded).

## 04-02

- **Pre-existing full-suite failures from a stray worktree copy** — `npm test` (full suite) reports 3 failures, all originating from `.claude/worktrees/hopeful-mestorf-9a8ba0/tests/db/seed.test.ts` and `.claude/worktrees/hopeful-mestorf-9a8ba0/tests/domain/companies.test.ts`. These are a leftover copy of test files inside a stale Claude Code worktree directory (not this project's actual `tests/` tree), unrelated to any 04-01/04-02 change. Confirmed pre-existing via `git stash` + `npm test` before any 04-02 edit — identical 3 failures present. Out of scope for this plan (scope boundary: only auto-fix issues directly caused by the current task's changes). Root cause / cleanup of the stray worktree directory is a separate housekeeping item, not an ING-05/ING-07 concern.
