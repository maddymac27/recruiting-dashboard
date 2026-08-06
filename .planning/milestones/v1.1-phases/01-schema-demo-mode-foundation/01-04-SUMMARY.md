---
phase: 01-schema-demo-mode-foundation
plan: 04
subsystem: database

tags: [drizzle-orm, node-sqlite, zod, vitest, overrides, company-aliases, contacts]

# Dependency graph
requires:
  - phase: 01-01
    provides: Drizzle schema (overrides, companies, company_aliases, contacts, contact_applications, conversations), Zod validation schemas (overrideInput/OVERRIDABLE_FIELDS, newContactInput, newConversationInput), createTestDb() in-memory test harness
provides:
  - "setOverride / getMergedField (src/domain/overrides.ts) — read-then-write override storage with read-time precedence over derived values (DATA-07)"
  - "normalizeCompanyName / createCompany / addAlias / resolveCompany (src/domain/companies.ts) — company alias resolution, variants resolve to one canonical entity (DATA-04)"
  - "createContact / linkContactToApplication / addConversation / getApplicationsForContact / getContactsForApplication / getConversationsForContact (src/domain/contacts.ts) — many-to-many contact-application graph with dated conversations (DATA-05)"
affects: [01-05, phase-2-manual-capture-core-ui, phase-3-gmail-ingestion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Domain functions accept the Drizzle db/tx handle as first parameter (dependency injection), matching the 01-03 pattern"
    - "Override write path is explicit read-then-write inside db.transaction(), never onConflictDoUpdate on a composite unique index (RESEARCH Pattern 3, Pitfall 2)"
    - "Ingestion/derive write paths never read overrides before writing their own derived value — only the read path (getMergedField) enforces precedence, so overrides structurally cannot be touched by a re-sync"
    - "Company alias collision with another company's canonical name is enforced as an app-level invariant in addAlias, not a cross-table DB constraint (SQLite cannot express that without a trigger)"

key-files:
  created:
    - src/domain/overrides.ts
    - src/domain/companies.ts
    - src/domain/contacts.ts
    - tests/domain/overrides.test.ts
    - tests/domain/companies.test.ts
    - tests/domain/contacts.test.ts
  modified: []

key-decisions:
  - "setOverride/getMergedField take the OverridableField union type (not a bare string) so a caller gets a compile-time nudge toward the allow-list, while overrideInput.parse still enforces it at the runtime write boundary for any caller that bypasses the type (e.g. from an API route parsing untyped JSON)"
  - "getApplicationsForContact/getContactsForApplication return the full contact_applications row set (contactId, applicationId, linkedAt) rather than joining to contacts/applications tables — kept minimal per the plan's scope; joined detail views are a later plan's concern (mirrors 01-03's precedent of building only what the current plan's must-haves require)"

requirements-completed: [DATA-04, DATA-05, DATA-07]

coverage:
  - id: D1
    description: "setOverride validates field_name against the OVERRIDABLE_FIELDS allow-list and stores via explicit read-then-write transaction (never onConflictDoUpdate); getMergedField returns the override value over a differing derived value, and continues to do so across a simulated re-derive (DATA-07)"
    requirement: "DATA-07"
    verification:
      - kind: unit
        ref: "tests/domain/overrides.test.ts#override precedence: override wins over a different derived value"
        status: pass
      - kind: unit
        ref: "tests/domain/overrides.test.ts#survives re-derive: override row is untouched by a simulated parser re-run"
        status: pass
      - kind: unit
        ref: "tests/domain/overrides.test.ts#allow-list: rejects a field_name outside the allow-list"
        status: pass
      - kind: unit
        ref: "tests/domain/overrides.test.ts#single row per field: setting the same field twice updates in place"
        status: pass
      - kind: unit
        ref: "tests/domain/overrides.test.ts#returns the derived value when no override exists"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolveCompany normalizes an incoming name then checks companies.normalized_key, then company_aliases.normalized_alias — two name variants (canonical + alias) resolve to the same company id; addAlias rejects an alias colliding with another company's canonical name (DATA-04)"
    requirement: "DATA-04"
    verification:
      - kind: unit
        ref: "tests/domain/companies.test.ts#alias resolves: two name variants resolve to one canonical company (DATA-04)"
        status: pass
      - kind: unit
        ref: "tests/domain/companies.test.ts#returns null for a genuinely new company name"
        status: pass
      - kind: unit
        ref: "tests/domain/companies.test.ts#rejects an alias colliding with another company's canonical name"
        status: pass
      - kind: unit
        ref: "tests/domain/companies.test.ts#normalizeCompanyName lowercases, trims, collapses whitespace, and strips punctuation"
        status: pass
    human_judgment: false
  - id: D3
    description: "linkContactToApplication preserves linked_at across a many-to-many contact<->application graph (one contact to 2+ applications, one application to 2+ contacts); addConversation stores dated one-to-many entries per contact returned in occurred_at order (DATA-05, D-01)"
    requirement: "DATA-05"
    verification:
      - kind: unit
        ref: "tests/domain/contacts.test.ts#multi-job linkage: one contact links to two applications, one application to two contacts, dates preserved (DATA-05)"
        status: pass
      - kind: unit
        ref: "tests/domain/contacts.test.ts#dated conversations: two conversations attach to a contact and return in occurred_at order (D-01)"
        status: pass
    human_judgment: false

duration: ~65 min
completed: 2026-07-27
status: complete
---

# Phase 01 Plan 04: Override Precedence, Company Aliases, Contact Graph Summary

**Read-then-write override storage that structurally cannot be clobbered by a re-derive, an alias table that resolves company name variants to one canonical entity, and a many-to-many contact-application graph with preserved link dates and dated conversations.**

## Performance

- **Duration:** ~65 min
- **Completed:** 2026-07-27
- **Tasks:** 3 (all TDD RED->GREEN, all completed)
- **Files modified:** 6 created (3 domain modules, 3 test files)

## Accomplishments

- `setOverride`/`getMergedField` (`src/domain/overrides.ts`) implement DATA-07's correction model: `setOverride` validates `field_name` against the `OVERRIDABLE_FIELDS` allow-list via `overrideInput.parse`, then writes through an explicit read-then-write `db.transaction()` — reading the existing `(application_id, field_name)` row and UPDATE-ing it if present, else INSERT — deliberately never using `onConflictDoUpdate` on the composite unique index (RESEARCH Pattern 3, Pitfall 2, T-01-15). `getMergedField` returns the override's `value_text` when a row exists, otherwise the caller-supplied derived value. Proven with a "survives re-derive" test: after setting an override, two successive calls to `getMergedField` with two different simulated derived values both still return the original override value, because the override row itself is never touched by anything except `setOverride` (T-01-13). An out-of-allow-list `field_name` throws at the write boundary (T-01-14), and setting the same field twice leaves exactly one row.
- `normalizeCompanyName`/`createCompany`/`addAlias`/`resolveCompany` (`src/domain/companies.ts`) implement DATA-04's alias resolution: `normalizeCompanyName` lowercases, trims, collapses whitespace, and strips punctuation to a stable key. `resolveCompany` normalizes the incoming name, checks `companies.normalized_key` first, then `company_aliases.normalized_alias`, returning `null` for a genuinely new name (creation/routing left to the caller). Proven that "Meta" (canonical) + "Facebook" (alias) both resolve `resolveCompany('Facebook')` and `resolveCompany('meta')` to the same company id. `addAlias` enforces the app-level invariant (T-01-16) that an alias cannot collide with another company's canonical name/normalized_key — checked in code since SQLite cannot express a cross-table UNIQUE without a trigger (RESEARCH Pattern 4, Don't Hand-Roll). No fuzzy matching (Levenshtein/Jaro-Winkler) was implemented, per the plan's explicit instruction.
- `createContact`/`linkContactToApplication`/`addConversation`/`getApplicationsForContact`/`getContactsForApplication`/`getConversationsForContact` (`src/domain/contacts.ts`) implement DATA-05's contact graph: `createContact` validates against `newContactInput` (D-02 fields; `company_id` optional per D-03). `linkContactToApplication` inserts into the `contact_applications` join table preserving an optional `linkedAt` timestamp. Proven with a multi-job linkage test: one contact linked to two applications and one application linked to two contacts, with each link's distinct `linked_at` date round-tripping correctly through both `getApplicationsForContact` and `getContactsForApplication` (DATA-05). `addConversation` stores dated entries (D-01) validated against `newConversationInput`; `getConversationsForContact` returns them ordered by `occurred_at` ascending, proven by inserting a later conversation first and an earlier one second, then asserting the read-back order is chronological, not insertion order.
- Full repo test suite: 26/26 passing (15 from 01-01/01-02/01-03, 11 new for 01-04: 5 overrides + 4 companies + 2 contacts). `npx tsc --noEmit` exits 0 after every task.

## Task Commits

Each task followed a strict TDD RED (test commit, confirmed failing on "Cannot find package") -> GREEN (feat commit, confirmed passing) cycle, executed and committed in plan task order:

1. **Task 1: Override storage + read-time precedence (DATA-07)**
   - RED: `bde92d1` (test) — `tests/domain/overrides.test.ts`, confirmed failing (module not found)
   - GREEN: `043cc67` (feat) — `src/domain/overrides.ts`, confirmed 5/5 passing
2. **Task 2: Company alias resolution (DATA-04)**
   - RED: `705ccc4` (test) — `tests/domain/companies.test.ts`, confirmed failing (module not found)
   - GREEN: `4af136f` (feat) — `src/domain/companies.ts`, confirmed 4/4 passing
3. **Task 3: Contact graph — multi-job linkage + dated conversations (DATA-05)**
   - RED: `d572569` (test) — `tests/domain/contacts.test.ts`, confirmed failing (module not found)
   - GREEN: `2335fe3` (feat) — `src/domain/contacts.ts`, confirmed 2/2 passing

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP/REQUIREMENTS update)

## TDD Gate Compliance

**Fully satisfied.** Every task's `test(...)` (RED) commit was verified failing via `npx vitest run` before its paired `feat(...)` (GREEN) commit was written and verified passing. No fail-fast trips (no test passed unexpectedly during RED). All three RED and all three GREEN commits are present in git log in the correct order, per task.

## Files Created/Modified

- `src/domain/overrides.ts` - `setOverride(db, applicationId, fieldName, value)` (allow-list-validated, read-then-write transaction) and `getMergedField(db, applicationId, fieldName, derivedValue)` (override wins if present)
- `src/domain/companies.ts` - `normalizeCompanyName(name)`, `createCompany(db, canonicalName)`, `addAlias(db, companyId, alias)` (rejects canonical-name collisions), `resolveCompany(db, name)` (canonical key -> alias key -> null)
- `src/domain/contacts.ts` - `createContact(db, input)`, `linkContactToApplication(db, contactId, applicationId, linkedAt?)`, `addConversation(db, input)`, `getApplicationsForContact(db, contactId)`, `getContactsForApplication(db, applicationId)`, `getConversationsForContact(db, contactId)` (ordered by `occurred_at` ASC)
- `tests/domain/overrides.test.ts` - override precedence, survives-re-derive, allow-list rejection, single-row-per-field, no-override-fallback tests
- `tests/domain/companies.test.ts` - normalization, alias-resolves-to-canonical (two variants), unknown-name-returns-null, alias-collision-rejected tests
- `tests/domain/contacts.test.ts` - multi-job linkage (bidirectional, dates preserved) and dated-conversations-return-in-order tests

## Decisions Made

- `setOverride`/`getMergedField` type their `fieldName` parameter as `OverridableField` (the Zod-derived union) rather than a bare `string`, giving compile-time guidance toward the allow-list on top of the runtime `overrideInput.parse` enforcement that any untyped caller (e.g. a future API route) still goes through.
- `getApplicationsForContact`/`getContactsForApplication` return raw `contact_applications` rows (contactId, applicationId, linkedAt) rather than joining out to full application/contact detail — this plan's must-haves only require proving the link and its date survive; joined detail views are left to whichever later plan actually renders them, mirroring 01-03's precedent of building only what the current plan's must-haves require.
- No architectural deviations from the plan. Implementation followed `01-04-PLAN.md`'s `<action>` blocks directly for all three tasks.

## Deviations from Plan

None - plan executed exactly as written. No Rule 1/2/3 auto-fixes were needed; no Rule 4 architectural questions arose.

## Issues Encountered

None. All three tasks passed on the first GREEN implementation attempt; no debugging iterations were needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/domain/overrides.ts`, `src/domain/companies.ts`, and `src/domain/contacts.ts` are ready for reuse by the Phase 1 demo seed (01-05) to populate a realistic demo dataset exercising overrides, aliased companies, and a multi-job contact.
- `resolveCompany`/`createCompany`/`addAlias` are the exact functions the future Gmail-ingestion resolver (Phase 3) will call to route an incoming sender/company name to the correct existing company or flag it as new.
- `setOverride`/`getMergedField` are ready for the Phase 2 manual-capture UI to call directly when a user corrects a field, and for CAP-03 (override persistence across re-syncs) to be verified against in Phase 3 once a real parser/sync exists.
- No blockers.

## Self-Check: PASSED

All 6 declared artifact files verified present on disk (`src/domain/overrides.ts`, `src/domain/companies.ts`, `src/domain/contacts.ts`, `tests/domain/overrides.test.ts`, `tests/domain/companies.test.ts`, `tests/domain/contacts.test.ts`); all 6 task commit hashes (`bde92d1`, `043cc67`, `705ccc4`, `4af136f`, `d572569`, `2335fe3`) verified present in `git log --oneline`.

---
*Phase: 01-schema-demo-mode-foundation*
*Completed: 2026-07-27*
