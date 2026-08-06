---
phase: 06-outreach-tracker-data-model-manual-logging-filterable-view
plan: 02
subsystem: database
tags: [drizzle-orm, node-sqlite, domain-layer, outreach]

# Dependency graph
requires:
  - phase: 06-01
    provides: outreachMessages table (src/db/schema.ts) with Outreach/NewOutreach types, newOutreachInput/OUTREACH_CHANNELS/OutreachChannel (src/db/validation.ts)
provides:
  - createOutreach(db, input) — DB writer for outreach_messages, defaults responded/outcome/subject/sourceMessageId/source
  - listOutreach(db, opts?) — joined read (contactName, companyName), optional contactId scoping
  - getOutreachCountsByContact(db) — Map<contactId, count> via TypeScript reduce (no SQL aggregate)
affects: [06-03 (Server Action), 06-04 (page/table), 06-05 (contact cross-link)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reduce-not-groupBy aggregation (drizzle-orm pinned 1.0.0-rc.4) — mirrors listContactsWithOutreach in src/domain/contacts.ts"
    - "Two explicit query branches instead of one query builder + conditional .where() — avoids drizzle-orm's dynamic-query-builder type surface at this pinned RC version"

key-files:
  created:
    - src/domain/outreach.ts
    - tests/domain/outreach.test.ts
  modified: []

key-decisions:
  - "listOutreach writes two full query chains (contactId-filtered / unfiltered) rather than building one query and conditionally chaining .where() onto a stored variable, avoiding reliance on drizzle-orm's dynamic-query-builder typing at the pinned 1.0.0-rc.4 release."

patterns-established:
  - "Domain-layer aggregation always uses a flat select + TypeScript Map reduce, never GROUP BY — codebase-wide convention given the pinned drizzle-orm RC."

requirements-completed: [OUT-01, OUT-03, OUT-06]

coverage:
  - id: D1
    description: "createOutreach inserts one outreach_messages row from an already-resolved input and returns the new id, defaulting responded/outcome/subject/sourceMessageId/source when omitted"
    requirement: "OUT-01"
    verification:
      - kind: unit
        ref: "tests/domain/outreach.test.ts#createOutreach / listOutreach > round-trips: create then list returns the row with contactName/companyName populated from the joins (OUT-01, OUT-03)"
        status: pass
    human_judgment: false
  - id: D2
    description: "listOutreach returns every row joined to contactName/companyName, or only a given contact's rows when opts.contactId is supplied"
    requirement: "OUT-03"
    verification:
      - kind: unit
        ref: "tests/domain/outreach.test.ts#createOutreach / listOutreach > listOutreach() returns all rows; listOutreach({ contactId }) returns only that contact's rows (OUT-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "getOutreachCountsByContact returns Map<contactId, count> via a TypeScript reduce over a flat select, never a SQL aggregate"
    requirement: "OUT-06"
    verification:
      - kind: unit
        ref: "tests/domain/outreach.test.ts#getOutreachCountsByContact > returns a Map<contactId, count> built via TypeScript reduce, not a SQL aggregate (D-11, OUT-06)"
        status: pass
    human_judgment: false
  - id: D4
    description: "responded/outcome round-trip through createOutreach->listOutreach unchanged, including responded=false/outcome=null"
    requirement: "OUT-06"
    verification:
      - kind: unit
        ref: "tests/domain/outreach.test.ts#responded/outcome round-trip (OUT-06) > responded=true with an outcome persists and reads back unchanged"
        status: pass
      - kind: unit
        ref: "tests/domain/outreach.test.ts#responded/outcome round-trip (OUT-06) > responded=false reads back responded=false and outcome=null (empty + adjacency edge)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Free-text body/subject/outcome persist and read back byte-identical — unicode, emoji, and newlines preserved"
    requirement: "OUT-01"
    verification:
      - kind: unit
        ref: "tests/domain/outreach.test.ts#createOutreach / listOutreach > a body containing unicode + emoji + embedded newlines reads back byte-identical (encoding edge)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-08-06
status: complete
---

# Phase 06 Plan 02: Outreach Domain Layer (create/list/count) Summary

**src/domain/outreach.ts with createOutreach (insert-then-return-id), listOutreach (dual-innerJoin to contacts/companies, optional contactId filter), and getOutreachCountsByContact (Map-reduce, no SQL aggregate) — proven by 7 unit tests covering round-trip, filtering, unicode encoding, null fields, count aggregation, and responded/outcome persistence.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-06T10:14:00-05:00 (approx.)
- **Completed:** 2026-08-06T10:19:45-05:00
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments
- `createOutreach(db, input)` inserts one `outreach_messages` row and returns `Number(result.lastInsertRowid)`, defaulting `responded` to false, `outcome`/`subject`/`sourceMessageId` to null, and `source` to `"manual"` when omitted (T-06-04 mitigation).
- `listOutreach(db, opts?)` returns every outreach row joined to `contacts.name` (as `contactName`) and `companies.canonicalName` (as `companyName`); with `{ contactId }` it scopes to that contact only — the exact shape 06-04's table and 06-05's cross-link deep-link need.
- `getOutreachCountsByContact(db)` builds a `Map<contactId, count>` via a TypeScript `reduce` over a flat `{ contactId }` select — no grouped/aggregate SQL, consistent with the codebase's RC-pinned-drizzle-orm convention.
- 7 unit tests prove: create→list round-trip with joined names, all-vs-contactId-filtered listing, unicode/emoji/newline body encoding fidelity, `subject`/`outcome` null round-trip, count aggregation (including a 0-count contact absent from the Map), and `responded=true/false` + `outcome` persistence.

## Task Commits

Each task was committed atomically:

1. **Task 1: createOutreach + listOutreach with contact-scoped filter** - `ca212b7` (test)
2. **Task 2: getOutreachCountsByContact (reduce-not-groupBy) + responded coverage** - `bbe2d79` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified
- `src/domain/outreach.ts` - `CreateOutreachInput`, `createOutreach`, `OutreachRow`, `listOutreach`, `getOutreachCountsByContact`
- `tests/domain/outreach.test.ts` - unit tests for all of the above

## Decisions Made
- `listOutreach` is written as two full, separate query chains (one with `.where(eq(outreachMessages.contactId, opts.contactId))`, one without) rather than building a single query-builder variable and conditionally chaining `.where()` onto it. This avoids depending on drizzle-orm's dynamic-query-builder (`.$dynamic()`) type surface, which is unused anywhere else in this codebase given the pinned `1.0.0-rc.4` release — consistent with the codebase's broader pattern of avoiding advanced/unstable ORM type-level features (mirrors the reduce-not-groupBy convention for aggregation).

## Deviations from Plan

None - plan executed exactly as written. `CreateOutreachInput` was defined as a plain `interface` (as the plan's action text specifies — "the already-resolved insert shape", not `newOutreachInput`), matching the plan's explicit instruction not to reuse the client-facing zod schema for this DB-level type.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 06-03 (Server Action) can now import `createOutreach` from `@/domain/outreach` and compose it with company/contact resolution, hardcoding `source: "manual"` / `sourceMessageId: null` exactly as `CreateOutreachInput` expects.
- 06-04 (page/table) can call `listOutreach(db, { contactId })` directly — `OutreachRow` already carries `contactName`/`companyName`, so no second fetch is needed.
- 06-05 (contact cross-link) can import `getOutreachCountsByContact` from `@/domain/outreach` into `src/domain/contacts.ts`'s `listContactsWithOutreach`, per the cross-module function-call convention confirmed in 06-PATTERNS.md.
- No blockers.

---
*Phase: 06-outreach-tracker-data-model-manual-logging-filterable-view*
*Completed: 2026-08-06*

## Self-Check: PASSED

- FOUND: src/domain/outreach.ts
- FOUND: tests/domain/outreach.test.ts
- FOUND commit: ca212b7
- FOUND commit: bbe2d79
