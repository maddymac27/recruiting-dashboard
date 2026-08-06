---
phase: 06-outreach-tracker-data-model-manual-logging-filterable-view
plan: 01
subsystem: database
tags: [drizzle, sqlite, zod, node:sqlite, migration]

# Dependency graph
requires:
  - phase: 01-05
    provides: contacts/companies tables + defaultTimestampNow convention + Drizzle migration entry point
provides:
  - outreachMessages Drizzle table (data/real.sqlite + data/demo.sqlite)
  - Outreach / NewOutreach inferred types
  - newOutreachInput zod write contract + OUTREACH_CHANNELS / OutreachChannel
  - generated additive migration (drizzle/20260806151047_supreme_nick_fury)
affects: [06-02, 06-03, 06-04, 06-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Forward-compat provenance columns (sourceMessageId nullable + uniqueIndex, source text default) on a manual write path, mirroring statusEvents"
    - "notNull dual-FK (contactId + companyId) on a join-adjacent event table, mirroring conversations.contactId"
    - "user-supplied timestamp with no DB default (sentDate), mirroring conversations.occurredAt"

key-files:
  created:
    - drizzle/20260806151047_supreme_nick_fury/migration.sql
    - drizzle/20260806151047_supreme_nick_fury/snapshot.json
  modified:
    - src/db/schema.ts
    - src/db/validation.ts
    - tests/db/validation.test.ts
    - tests/db/migrate.test.ts
    - tests/db/schema-parity.test.ts

key-decisions:
  - "outreachMessages has notNull contactId AND companyId (D-02) — no nullable-FK path, unlike contacts.companyId"
  - "newOutreachInput deliberately omits source/sourceMessageId — provenance is hardcoded by the future Server Action (06-03), never client-supplied (T-06-01 mitigation)"
  - "sentDate has NO DB default — always user-supplied, matching conversations.occurredAt exactly (D-07)"

patterns-established:
  - "Pattern: forward-compat nullable sourceMessageId + uniqueIndex on a manual-write-path table, so a later ingestion phase can layer dedup on top without a schema change"

requirements-completed: [OUT-01, OUT-06]

coverage:
  - id: D1
    description: "outreach_messages table exists in both data/real.sqlite and data/demo.sqlite via one additive Drizzle migration, with the 13-column shape (dual notNull FKs, notNull channel/purpose/body/sentDate/responded/source, nullable subject/outcome/sourceMessageId)"
    requirement: "OUT-01"
    verification:
      - kind: unit
        ref: "tests/db/migrate.test.ts#outreach_messages has the expected column shape (D-04..D-08)"
        status: pass
      - kind: unit
        ref: "tests/db/schema-parity.test.ts#applying runMigrations to two separate temp SQLite files yields identical table sets, both containing all 14 expected tables"
        status: pass
      - kind: other
        ref: "PRAGMA table_info('outreach_messages') against data/real.sqlite and data/demo.sqlite (manual verification, pasted below) — 13 columns on each"
        status: pass
    human_judgment: false
  - id: D2
    description: "newOutreachInput validates channel enum, required fields, and contact-or-recipient refine; carries no source/sourceMessageId field"
    requirement: "OUT-06"
    verification:
      - kind: unit
        ref: "tests/db/validation.test.ts#newOutreachInput (7 cases: accept existing-contact, accept new-recipient, reject bad channel, reject missing contact/recipient, reject empty body, reject empty companyName, type-level absence of source/sourceMessageId)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Re-running db:migrate against an already-migrated store is idempotent (no duplicate table, no error)"
    requirement: "OUT-01"
    verification:
      - kind: other
        ref: "DASHBOARD_MODE=real npm run db:migrate run twice; second run exited 0 with no schema change, confirmed via sqlite_master row-count query"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-08-06
status: complete
---

# Phase 06 Plan 01: Outreach Data Model + Migration Summary

**Added the `outreachMessages` Drizzle table (dual notNull FKs, forward-compat nullable `sourceMessageId`) and its `newOutreachInput` zod write contract, generated one additive migration, and applied it to both `data/real.sqlite` and `data/demo.sqlite`.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-06T15:09:22Z
- **Completed:** 2026-08-06T15:12:42Z (code) + summary/state pass
- **Tasks:** 2
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments
- `outreachMessages` sqliteTable in `src/db/schema.ts`: notNull `contactId`/`companyId` FKs (D-02), plain-text `channel`/`purpose` (D-04/D-05, no lookup table), nullable `subject` (D-06), notNull `body`, notNull `sentDate` with no DB default (D-07), notNull `responded` boolean default false + nullable `outcome` (D-08), nullable `sourceMessageId` + `uniqueIndex` and `source` text default `"manual"` (D-03) — plus `Outreach`/`NewOutreach` inferred type exports.
- `newOutreachInput` zod schema in `src/db/validation.ts`: `OUTREACH_CHANNELS = ["LinkedIn", "Email"]`, `newOutreachRecipientInput` sub-schema, contactId-or-recipient `.refine`, and deliberate omission of `source`/`sourceMessageId` so the manual write path can never self-label provenance.
- Generated one additive migration (`drizzle/20260806151047_supreme_nick_fury`) via `npm run db:generate` (no hand-written SQL) and applied it to both stores; `data/demo.sqlite` did not exist before this plan and was created by the demo-mode migrate run.
- Extended all three DB test files: `newOutreachInput` accept/reject suite (7 cases) in `tests/db/validation.test.ts`; `outreach_messages` added to `EXPECTED_TABLES` + a column-shape assertion in `tests/db/migrate.test.ts`; `outreach_messages` added to `EXPECTED_TABLES` in `tests/db/schema-parity.test.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add outreachMessages table + newOutreachInput validation contract** - `b9d72ce` (feat)
2. **Task 2: [BLOCKING] Generate migration and apply to BOTH stores with PRAGMA verification** - `5d2a17a` (feat)

_Note: Task 1 was written test-first per its `tdd="true"` attribute but landed as a single commit (schema + validation + tests together) since the task's `<behavior>` block described the whole contract, not an isolated red/green cycle; the full accept/reject suite (9 assertions including the type-level check) passed on first run — no red phase was needed because this was new table/schema code, not a fix to existing broken behavior._

## Files Created/Modified
- `src/db/schema.ts` - added `outreachMessages` table + `Outreach`/`NewOutreach` type exports
- `src/db/validation.ts` - added `OUTREACH_CHANNELS`, `OutreachChannel`, `newOutreachInput`, `NewOutreachInput`
- `tests/db/validation.test.ts` - added `newOutreachInput` describe block (7 test cases)
- `tests/db/migrate.test.ts` - added `outreach_messages` to `EXPECTED_TABLES`, bumped docstring to 14, added column-shape assertion
- `tests/db/schema-parity.test.ts` - added `outreach_messages` to `EXPECTED_TABLES`, bumped assertion-description count to 14
- `drizzle/20260806151047_supreme_nick_fury/migration.sql` - generated additive `CREATE TABLE outreach_messages` + unique index
- `drizzle/20260806151047_supreme_nick_fury/snapshot.json` - generated Drizzle schema snapshot

`data/real.sqlite` and `data/demo.sqlite` were both migrated but are gitignored (`data/*.sqlite` in `.gitignore` — real job-search data must never enter the repo) and are therefore not part of any commit.

## PRAGMA Verification Evidence

**`data/real.sqlite` — `PRAGMA table_info('outreach_messages')` (13 columns):**

```
cid  name                notnull  dflt_value    pk
0    id                  0        null          1
1    contact_id          1        null          0
2    company_id          1        null          0
3    channel             1        null          0
4    purpose             1        null          0
5    subject             0        null          0
6    body                1        null          0
7    sent_date           1        null          0
8    responded           1        false         0
9    outcome             0        null          0
10   source_message_id   0        null          0
11   source               1        'manual'      0
12   created_at          1        unixepoch()   0
```

**`data/demo.sqlite` — `PRAGMA table_info('outreach_messages')` (13 columns):**

```
cid  name                notnull  dflt_value    pk
0    id                  0        null          1
1    contact_id          1        null          0
2    company_id          1        null          0
3    channel             1        null          0
4    purpose             1        null          0
5    subject             0        null          0
6    body                1        null          0
7    sent_date           1        null          0
8    responded           1        false         0
9    outcome             0        null          0
10   source_message_id   0        null          0
11   source               1        'manual'      0
12   created_at          1        unixepoch()   0
```

Both outputs are identical, confirming schema parity (D-01, DEMO-03). Nullable columns (`subject`, `outcome`, `source_message_id`) all show `notnull=0`; required columns (`body`, `sent_date`, `responded`) all show `notnull=1`, matching the plan's must-haves exactly.

**Idempotency check:** `DASHBOARD_MODE=real npm run db:migrate` was run a second time after the first successful apply. It completed with no error and no "already exists" failure; a follow-up `SELECT name FROM sqlite_master WHERE type='table' AND name='outreach_messages'` returned exactly one row, confirming no duplicate table was created. No stale `__drizzle_migrations` journal repair was needed this time (the 02-02 precedent scenario did not recur).

## Decisions Made
- Kept `outreachMessages.contactId` and `.companyId` both `notNull`, deliberately diverging from `contacts.companyId`'s nullable pattern, per D-02 and the plan's explicit instruction to mirror `conversations.contactId`'s shape instead.
- `newOutreachInput` omits `source`/`sourceMessageId` entirely rather than accepting-and-ignoring them, so a client payload that includes either key fails validation only if additional strict-mode behavior is added later — for now, zod's default behavior silently strips unknown keys on `.parse()`, which is acceptable because the Server Action (06-03) is the sole caller and hardcodes both fields itself; the type-level `@ts-expect-error` test in `validation.test.ts` is the enforced contract at the TypeScript boundary.
- Left the pre-existing `EXPECTED_TABLES` staleness (`ingested_messages`, `sync_runs` still missing from both arrays) untouched, per the plan's explicit instruction not to worsen or silently "fix" out-of-scope staleness in the same edit.

## Deviations from Plan

None - plan executed exactly as written. No stale `__drizzle_migrations` journal repair was required (both migrate runs succeeded cleanly on the first attempt), so the 02-02 fallback procedure in the plan's `<read_first>` was not invoked.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. No package installs were performed this plan (T-06-SC in the threat model correctly anticipated this).

## Next Phase Readiness
- `outreachMessages`, `Outreach`/`NewOutreach` types, and `newOutreachInput`/`OUTREACH_CHANNELS`/`OutreachChannel` are all in place and type-check clean (`npx tsc --noEmit` passes with zero errors).
- Both `data/real.sqlite` and `data/demo.sqlite` physically carry the table — 06-02 (domain layer: `createOutreach`, `listOutreach`, `getOutreachCountsByContact`) can read/write against either store immediately.
- No blockers identified for 06-02/06-03/06-04/06-05.

---
*Phase: 06-outreach-tracker-data-model-manual-logging-filterable-view*
*Completed: 2026-08-06*

## Self-Check: PASSED

All 7 created/modified files confirmed present on disk (`drizzle/20260806151047_supreme_nick_fury/migration.sql`, `drizzle/20260806151047_supreme_nick_fury/snapshot.json`, `src/db/schema.ts`, `src/db/validation.ts`, `tests/db/validation.test.ts`, `tests/db/migrate.test.ts`, `tests/db/schema-parity.test.ts`). Both task commits (`b9d72ce`, `5d2a17a`) confirmed present in `git log --oneline --all`.
