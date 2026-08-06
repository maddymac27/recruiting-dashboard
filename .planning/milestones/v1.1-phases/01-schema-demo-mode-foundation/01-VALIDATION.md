---
phase: 1
slug: schema-demo-mode-foundation
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-22
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed test designs live in `01-RESEARCH.md` §"Validation Architecture". This is the sampling contract.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (latest) — matches the TypeScript/Node stack; no browser/UI test harness needed for a data-layer phase |
| **Config file** | none yet — Wave 0 installs vitest + creates `vitest.config.ts` |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5–15 seconds (in-memory / temp-file SQLite, no network) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

Task IDs are finalized by the planner; this maps each phase requirement to its validating behavior so no requirement lands without an automated check.

| Requirement | Secure/Correct Behavior to prove | Test Type | Automated Command | Status |
|-------------|----------------------------------|-----------|-------------------|--------|
| DATA-01 | Inserting an application persists all analysis dimensions (source, role type, company, date applied, current stage, outcome) in one round-trip | unit | `npx vitest run` | ⬜ pending |
| DATA-02 | Status change writes a new `status_events` row; no code path UPDATEs a status field in place | unit | `npx vitest run` | ⬜ pending |
| DATA-03 | Inserting events out of real-world order still derives the correct current stage (ordered by `occurred_at`) | unit | `npx vitest run` | ⬜ pending |
| DATA-04 | Two company name variants linked as aliases resolve to one canonical entity | unit | `npx vitest run` | ⬜ pending |
| DATA-05 | One contact links to ≥2 jobs and one job to ≥2 contacts, dates preserved; dated conversations attach to a contact | unit | `npx vitest run` | ⬜ pending |
| DATA-06 | Re-inserting a message with an existing `source_message_id` is a no-op (no duplicate event/record) | unit | `npx vitest run` | ⬜ pending |
| DATA-07 | An override value takes precedence over the parser-derived value at read time | unit | `npx vitest run` | ⬜ pending |
| DEMO-01/02/03 | Selecting demo mode points the Drizzle client at a separate seeded SQLite file; no code path can read/write both stores in one session | unit/integration | `npx vitest run` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install vitest + `tsx`; create `vitest.config.ts`
- [ ] Shared test helper to spin up an isolated in-memory / temp-file `node:sqlite` DB with migrations applied
- [ ] Seed-data fixture usable by both demo mode and tests

*Foundation phase: no prior test infrastructure exists, so Wave 0 establishes it.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Walking-skeleton liveness page renders a real DB value | (walking skeleton) | Requires `npm run dev` + browser; not a data-layer assertion | Run `npm run dev`, open the served page, confirm it shows a value read from the DB via Drizzle |

*All data-layer behaviors have automated verification; only the liveness page is manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
