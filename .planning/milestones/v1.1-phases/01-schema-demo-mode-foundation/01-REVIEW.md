---
phase: 01-schema-demo-mode-foundation
reviewed: 2026-07-28T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - drizzle.config.ts
  - next.config.ts
  - vitest.config.ts
  - src/db/schema.ts
  - src/db/validation.ts
  - src/db/paths.ts
  - src/db/migrate.ts
  - src/db/client.ts
  - src/db/seed-lookups.ts
  - src/app/layout.tsx
  - src/app/page.tsx
  - src/app/api/health/route.ts
  - src/domain/applications.ts
  - src/domain/events.ts
  - src/domain/projections.ts
  - src/domain/overrides.ts
  - src/domain/companies.ts
  - src/domain/contacts.ts
  - src/demo/seed/companies.ts
  - src/demo/seed/seed.ts
findings:
  critical: 0
  critical_resolved: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-28T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Reviewed the schema, validation, DB client, migration/seed CLI scripts, and the event-sourcing domain layer (applications, events, projections, overrides, companies, contacts) plus the demo fixture data and walking-skeleton pages/route.

The event-sourcing core is mostly sound: `recomputeCurrentStage` orders by `occurred_at ASC, id ASC` as required, `appendStatusEvent` inserts and recomputes inside one transaction, `setOverride` deliberately avoids the documented `onConflictDoUpdate` composite-key pitfall, and the override allow-list (`OVERRIDABLE_FIELDS`) is enforced via a shared Zod enum. `src/db/client.ts` correctly centralizes `DASHBOARD_MODE` resolution behind `server-only` and fails loud on an invalid/missing mode.

However, two BLOCKER-level defects undercut the project's explicit reliability ("fail loudly") and correctness guarantees:

1. **Every `defaultNow()` timestamp column is silently corrupted** whenever the app omits the field on insert (which it always does for `created_at`, and sometimes for `linked_at`/`set_by_user_at`) — the SQL-level default computes milliseconds, but the `mode: "timestamp"` column's read-path (`mapFromDriverValue`) assumes the raw stored value is seconds and multiplies by 1000 again, producing a wildly wrong (but non-obviously-invalid) `Date` rather than an error.
2. **`PRAGMA foreign_keys = ON` is never set in any production code path** (`src/db/client.ts`, and the CLI bootstraps in `migrate.ts`/`seed-lookups.ts`/`seed.ts`), even though every table declares FK constraints and the test helper (`tests/helpers/db.ts`) explicitly turns it on. This means referential integrity is enforced in tests but not in the real app or demo store — tests give false confidence, and orphaned/invalid references would silently succeed instead of throwing.

Both are provable, not stylistic, and both directly contradict the "must fail loudly" constraint in this project's CLAUDE.md. See Critical Issues below for details and fixes.

**Update:** Both CR-01 and CR-02 have since been fixed and verified with regression tests (see the "Resolved" note under each finding below). The 5 warnings and 3 info items were left untouched this round.

## Critical Issues

**Status: both critical findings below are RESOLVED.** See the "Resolved" note at the end of each finding for the fix commit and regression test. 2 criticals resolved; 5 warnings and 3 info items remain open (not addressed this round — see Warnings/Info sections below).

### CR-01: `defaultNow()` timestamp columns are silently corrupted on read (ms vs. seconds unit mismatch) — RESOLVED

**File:** `src/db/schema.ts:45,79,104,125,153,165,184,200,209`
**Issue:**
Every `createdAt`/`linkedAt`/`setByUserAt` column is declared as:
```ts
createdAt: integer("created_at", { mode: "timestamp" }).notNull().defaultNow(),
```
`drizzle-orm`'s `SQLiteTimestampBuilder.defaultNow()` (deprecated, `node_modules/drizzle-orm/sqlite-core/columns/integer.js`) generates:
```sql
DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
```
— this is epoch **milliseconds**. But for `mode: "timestamp"` (not `"timestamp_ms"`), the column's own driver-value mapping treats the stored integer as epoch **seconds**:
```js
mapFromDriverValue = (value) => {
  if (this.config.mode === "timestamp") return new Date(value * 1e3);
  ...
};
```
So any row inserted **without the app explicitly supplying the timestamp field** falls back to the SQL default (milliseconds), and the next time that row is read through Drizzle, the value is multiplied by 1000 again, producing a `Date` roughly 1000x too far in the future (e.g. today's timestamp reads back as some date tens of thousands of years out) instead of an error.

This affects every write path that omits the timestamp field on insert, which is all of them today:
- `createCompany` (`src/domain/companies.ts:29-35`) never supplies `createdAt`
- `createApplication` (`src/domain/applications.ts:46`) never supplies `createdAt` (not in `newApplicationInput`)
- `appendStatusEvent` (`src/domain/events.ts:31-35`) never supplies `createdAt` on `status_events`
- `addConversation` / `createContact` (`src/domain/contacts.ts`) never supply `createdAt`
- `linkContactToApplication` (`src/domain/contacts.ts:40-46`) omits `linkedAt` in every call in `src/demo/seed/seed.ts:79`
- `setOverride`'s insert branch (`src/domain/overrides.ts:48-54`) never supplies `setByUserAt` on first write (only the update branch explicitly sets `new Date()`, which round-trips correctly)

None of the domain tests assert on the round-tripped value of these columns, so this is currently silent in both the app and the test suite — exactly the kind of silent corruption the project's fail-loud constraint exists to prevent.

**Fix:** Stop relying on the SQL-level `defaultNow()` for `mode: "timestamp"` columns. Either:
```ts
// Option A — always supply the value at the app layer (matches how
// occurredAt/setByUserAt-on-update are already handled):
createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
// ...and pass `createdAt: new Date()` explicitly in every insert site.
```
or, if a DB-level default is preferred, use a default expression that matches the `"timestamp"` mode's seconds-based mapping instead of the deprecated ms-based helper:
```ts
import { sql } from "drizzle-orm";
createdAt: integer("created_at", { mode: "timestamp" })
  .notNull()
  .default(sql`(unixepoch())`),
```
Either fix requires regenerating the migration (`npm run db:generate`) since the existing migration SQL bakes in the ms-based default expression.

**Resolved:** All 9 `mode: "timestamp"` columns (`companies.createdAt`, `applications.createdAt`, `statusEvents.createdAt`, `overrides.setByUserAt`, `contacts.createdAt`, `contactApplications.linkedAt`, `conversations.createdAt`, `reviewQueue.createdAt`, `deadLetter.createdAt`) now use `.default(sql\`(unixepoch())\`)` in `src/db/schema.ts`, which emits epoch seconds and agrees with the column's `mode: "timestamp"` read-path. The migration was regenerated from scratch (no committed data existed) into `drizzle/20260728222830_bent_lester/`, confirmed to still create all 13 tables with `DEFAULT (unixepoch())` on every affected column. Regression test: `tests/db/timestamp-defaults.test.ts` inserts a company via `createCompany` (which never supplies `createdAt`) and asserts the round-tripped `Date` lands in the current UTC year and within seconds of the insert, not ~58543 CE. Fix commit: `dc94bed`. Test commit: `9508817`.

### CR-02: `PRAGMA foreign_keys = ON` is never enabled outside the test helper — RESOLVED

**File:** `src/db/client.ts:44-47`
**Issue:**
```ts
const sqlite = new DatabaseSync(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL");
return drizzle({ client: sqlite });
```
`sqlite.exec` sets WAL mode but never `PRAGMA foreign_keys = ON`. SQLite disables FK enforcement by default regardless of declared `REFERENCES` constraints unless this pragma is set per-connection. The same gap exists in every other place a raw `DatabaseSync` handle is opened outside tests:
- `src/db/migrate.ts:27-29` (`runCli`)
- `src/db/seed-lookups.ts:87-89` (`runCli`)
- `src/demo/seed/seed.ts:100-102` (`runCli`)

Meanwhile `tests/helpers/db.ts:16-17` *does* set it:
```ts
const sqlite = new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys = ON");
```
This means every domain test exercises FK-enforced behavior, but the real app, the real migration/seed CLI scripts, and the demo dataset never do. In practice this means: `linkContactToApplication` can link a nonexistent `contactId`/`applicationId`, `createApplication` can reference a nonexistent `companyId`, `appendStatusEvent` can reference a nonexistent `applicationId`/`stageId`, etc. — all of the declared `.references()` constraints in `src/db/schema.ts` are decorative in production and silently allow orphaned/invalid rows instead of throwing, directly contradicting the project's "must fail loudly" reliability constraint. It also means the test suite is not actually testing the code paths that ship.

**Fix:** Enable the pragma everywhere a connection is opened outside tests, ideally via one shared helper to avoid drift (see WR-03):
```ts
const sqlite = new DatabaseSync(dbPath);
sqlite.exec("PRAGMA foreign_keys = ON");
sqlite.exec("PRAGMA journal_mode = WAL");
```

**Resolved:** Added a centralized `openSqliteFile(dbPath)` helper (`src/db/open-sqlite.ts`) that creates the parent directory, opens the `DatabaseSync` handle, and sets both `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL`. `src/db/client.ts`, `src/db/migrate.ts` (CLI branch), `src/db/seed-lookups.ts` (CLI branch), and `src/demo/seed/seed.ts` (CLI branch) all now open their connection through this helper instead of constructing `DatabaseSync` directly, so the pragma can't be forgotten again at a new call site (this also closes most of WR-03's duplication concern for the connection-opening step specifically, though WR-03 as a whole — full CLI bootstrap dedup — remains open). Regression test: `tests/db/open-sqlite.test.ts` opens a real temp-file DB through `openSqliteFile`, confirms `PRAGMA foreign_keys` reads back as `1`, and asserts that inserting a row with a nonexistent foreign key id throws (`FOREIGN KEY constraint failed`, surfaced via the thrown error's `.cause`). Fix commit: `4d58f73`. Test commit: `9508817`.

## Warnings

### WR-01: `rebuildAllProjections` recomputes each application outside a transaction

**File:** `src/domain/projections.ts:45-54`
**Issue:** `appendStatusEvent` (the primary write path) deliberately runs the event insert and `recomputeCurrentStage` in the same transaction (per its own doc comment, "transaction integrity"). `rebuildAllProjections`, the documented repair path for backfilling projection bugs, calls `recomputeCurrentStage(db, id)` per application using the plain `db` handle — each call's internal select + update is not wrapped in a transaction, and the whole loop is not transactional either. A crash mid-loop leaves a partially-repaired dataset with no atomicity guarantee, inconsistent with the transaction-integrity bar the rest of the module holds itself to.
**Fix:**
```ts
export function rebuildAllProjections(db: NodeSQLiteDatabase): void {
  db.transaction((tx) => {
    const allApplications = tx.select({ id: applications.id }).from(applications).all();
    for (const { id } of allApplications) {
      recomputeCurrentStage(tx, id);
    }
  });
}
```

### WR-02: `addAlias` only checks canonical-name collisions, not alias-vs-alias collisions

**File:** `src/domain/companies.ts:47-72`
**Issue:** `addAlias` queries `companies` for a `normalizedKey` collision and throws a friendly `Error` if found, but never queries `companyAliases` for an existing `normalizedAlias` collision belonging to a *different* company. Since `company_aliases.normalized_alias` also carries a DB-level `.unique()` constraint (`src/db/schema.ts:54`), inserting a second alias that normalizes the same as an existing alias (but not a canonical name) will still fail — just with a raw, low-level SQLite `UNIQUE constraint failed` error instead of the domain-appropriate message the canonical-collision case gets. This is an inconsistent, harder-to-debug failure path for what is conceptually the same class of error.
**Fix:**
```ts
const collidingAlias = db
  .select()
  .from(companyAliases)
  .where(eq(companyAliases.normalizedAlias, normalizedAlias))
  .get();

if (collidingAlias && collidingAlias.companyId !== companyId) {
  throw new Error(
    `Alias "${alias}" already points to a different company (id ${collidingAlias.companyId})`,
  );
}
```

### WR-03: Duplicated CLI bootstrap logic across three scripts

**File:** `src/db/migrate.ts:19-39`, `src/db/seed-lookups.ts:81-100`, `src/demo/seed/seed.ts:94-113`
**Issue:** All three files duplicate the identical `mkdirSync(dirname(dbPath), { recursive: true })` → `new DatabaseSync(dbPath)` → `drizzle({ client: sqlite })` → `isDirectCliInvocation` boilerplate. This is both a maintainability smell and the direct reason CR-02's missing `PRAGMA foreign_keys = ON` is missing in three places instead of one — any future fix (or the WAL pragma, or connection cleanup) has to be applied three times and will drift.
**Fix:** Extract a shared `openSqliteForCli(dbPath: string): DatabaseSync` (or a full `openDbForCli(mode)` returning the drizzle instance) in one module, applying both pragmas, and have all three CLI scripts call it.

### WR-04: `setOverride`'s read-then-write is a TOCTOU race under concurrent callers

**File:** `src/domain/overrides.ts:22-57`
**Issue:** The doc comment explains this pattern was chosen specifically to avoid a documented `onConflictDoUpdate` bug on SQLite composite unique indexes — a reasonable tradeoff. But the resulting read-then-write is not itself race-safe: two concurrent calls for the same `(applicationId, fieldName)` could both see `existing === undefined` and both attempt an `INSERT`, with the second throwing a raw, uncaught `UNIQUE constraint failed` error on `overrides_application_field_unique` rather than gracefully falling back to an update or retry. Low likelihood given this is a single-user local app, but worth a defensive catch given the whole function exists to route around one SQLite edge case already.
**Fix:** Wrap the insert in a try/catch that falls back to an update on a unique-constraint violation, or add a comment explicitly documenting the single-writer assumption this function relies on.

### WR-05: Demo seed silently drops unmatched `roleType`/`source` labels instead of failing loud

**File:** `src/demo/seed/seed.ts:52-58`
**Issue:**
```ts
const applicationId = createApplication(db, {
  companyId,
  roleTitle: fixture.roleTitle,
  roleTypeId: roleTypeIdByLabel[fixture.roleType],
  sourceId: sourceIdByLabel[fixture.source],
  dateApplied: fixture.dateApplied ?? undefined,
});
```
`roleTypeIdByLabel`/`sourceIdByLabel` are plain `Record<string, number>` built from seeded rows (`buildLookupMap`). If a fixture's `roleType`/`source` string doesn't exactly match a seeded label (e.g. a future typo in `src/demo/seed/companies.ts`), the lookup silently returns `undefined`. Because `newApplicationInput.roleTypeId`/`sourceId` are `.optional()` in `src/db/validation.ts:36-37`, Zod treats an explicit `undefined` value as "field omitted" and validation **passes**, silently storing `roleTypeId: null`/`sourceId: null` instead of throwing. (By contrast, `stageIdByLabel[event.stage]` used a few lines below for `appendStatusEvent` is a *required* field in `newStatusEventInput`, so a typo there does correctly throw via Zod — the inconsistency is isolated to the two optional fields.) No fixture currently has such a typo, but the mechanism itself violates the fail-loud principle this project is built around, and a future edit to `src/demo/seed/companies.ts` could regress silently.
**Fix:**
```ts
const roleTypeId = roleTypeIdByLabel[fixture.roleType];
if (roleTypeId === undefined) {
  throw new Error(`Unknown role type label in demo fixture: "${fixture.roleType}"`);
}
const sourceId = sourceIdByLabel[fixture.source];
if (sourceId === undefined) {
  throw new Error(`Unknown source label in demo fixture: "${fixture.source}"`);
}
```

## Info

### IN-01: Deprecated Zod v4 chain methods used for email/URL validation

**File:** `src/db/validation.ts:57-58`
**Issue:** `email: z.string().email().optional()` and `linkedinUrl: z.string().url().optional()` use the Zod v4 `.email()`/`.url()` chain methods, which the installed `zod@4.4.3` types mark `@deprecated` in favor of the top-level `z.email()`/`z.url()` functions. Functionally identical today, but likely to require an update on a future Zod major bump.
**Fix:** `email: z.email().optional()`, `linkedinUrl: z.url().optional()`.

### IN-02: Demo fixture stage/role-type/source fields are untyped strings

**File:** `src/demo/seed/companies.ts:33-51`
**Issue:** `DemoStatusEventFixture.stage`, `DemoCompanyFixture.roleType`, and `DemoCompanyFixture.source` are typed as plain `string` rather than a literal union derived from the seeded label sets (`STAGES`/`SOURCES`/`ROLE_TYPES` in `src/db/seed-lookups.ts`). This is what makes the silent lookup-miss in WR-05 possible in the first place — a compile-time literal union would catch a typo before it ever reached runtime.
**Fix:** Export the label arrays' literal types from `src/db/seed-lookups.ts` (e.g. `type StageLabel = (typeof STAGES)[number]["label"]`) and use them for these fixture fields.

### IN-03: `drizzle.config.ts` hardcodes the real store path only

**File:** `drizzle.config.ts:7-9`
**Issue:** `dbCredentials.url` is hardcoded to `"./data/real.sqlite"`. Harmless today since only `npm run db:generate` (pure schema diffing, doesn't open the file) uses this config, but if `drizzle-kit push` or `drizzle-kit studio` are ever added to scripts, this config would only ever be able to target the real store, not the demo store, without a manual edit.
**Fix:** No action required now; note for future scripts that need to target `data/demo.sqlite`.

---

_Reviewed: 2026-07-28T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
