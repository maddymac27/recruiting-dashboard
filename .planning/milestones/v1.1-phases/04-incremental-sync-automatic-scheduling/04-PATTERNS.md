# Phase 4: Incremental Sync & Automatic Scheduling - Pattern Map

**Mapped:** 2026-08-03
**Files analyzed:** 9 (new + modified)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `scripts/sync.ts` (NEW) | utility / standalone entrypoint | request-response (batch, no HTTP) | `src/db/migrate.ts` (CLI bootstrap) + `src/app/actions.ts` `syncGmailAction` (sync lifecycle) | role-match (composite — no existing standalone-script-that-calls-domain-sync exists, so this is assembled from two exact partial analogs) |
| `scripts/register-task.ps1` (NEW) | config / infra | event-driven (OS scheduler) | none | no analog — new infra, not TS |
| `src/gmail/client.ts` (MODIFY — add `listHistory`, `getProfileHistoryId`) | service (transport wrapper) | request-response | itself (`wrapGmailClient`'s existing `listMessages`/`getMessageRaw`/`listLabels` methods) | exact |
| `src/gmail/fetch.ts` (MODIFY — add `fetchHistoryMessageIds`) | utility (data transform) | transform / pagination | itself (`listAllMessageIds`) | exact |
| `src/gmail/types.ts` (MODIFY — extend `GmailClient` interface) | model/type | — | itself (`GmailListMessagesParams`/`GmailListMessagesResult`) | exact |
| `src/domain/ingestion.ts` (MODIFY — `runGmailSync` gains `historyId` param + 404 fallback) | service (orchestrator) | event-driven / batch | itself (existing three-pass `runGmailSync` body) | exact |
| `src/domain/sync-state.ts` (MODIFY — cursor read/write, throttle helper) | service (state accessor) | CRUD | itself (`getLatestSyncRun`/`finishSyncRun`/`startSyncRun`) | exact |
| `src/db/schema.ts` (MODIFY — add `history_id`, `used_fallback` to `syncRuns`) + new Drizzle migration | model / migration | CRUD | itself (`syncRuns` table definition); migration analog = Phase 3's additive `sync_runs`/`ingested_messages` migration (see `drizzle/` dir, generated via `drizzle-kit generate`) | exact |
| `src/db/validation.ts` (MODIFY — extend `newSyncRunInput`) | utility (validation schema) | — | itself (`newSyncRunInput`) | exact |
| `src/db/open-sqlite.ts` (MODIFY — add `busy_timeout` pragma) | utility (DB bootstrap) | — | itself (existing `foreign_keys`/`journal_mode` pragma block) | exact |
| `src/app/actions.ts` (MODIFY — route `syncGmailAction` through cursor) | controller (server action) | request-response | itself (`syncGmailAction`) | exact |
| `src/components/ingestion-health.tsx` (MODIFY — staleness escalation) | component | request-response (server-computed prop → render) | itself (existing `lastSyncStatus === "failed"` branch) | exact |
| `tests/domain/ingestion.test.ts` (MODIFY — history/fallback/catch-up describe blocks) | test | — | itself (existing describe blocks) | exact |
| `tests/helpers/gmail.ts` (MODIFY — extend `FakeGmailFixtures` with `listHistory`/`getProfileHistoryId`) | test fixture | — | itself | exact |
| `tests/scripts/sync-throttle.test.ts` (NEW) | test | — | any existing `tests/domain/*.test.ts` file shape (plain vitest `describe`/`it`, no DB needed for a pure throttle-check function) | role-match |

## Pattern Assignments

### `scripts/sync.ts` (NEW — utility, standalone entrypoint)

**Analogs:** `src/db/migrate.ts` (CLI bootstrap shape) + `src/app/actions.ts` `syncGmailAction` (sync lifecycle logic to mirror, NOT import — Server Actions can't be invoked outside Next.js)

**CLI bootstrap pattern** (`src/db/migrate.ts` lines 1-34):
```typescript
import { drizzle, type NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { pathToFileURL } from "node:url";
import { assertMode, resolveDbPath } from "./paths";
import { openSqliteFile } from "./open-sqlite";

function runCli() {
  const mode = process.env.DASHBOARD_MODE;
  assertMode(mode);
  const dbPath = resolveDbPath(mode);

  const sqlite = openSqliteFile(dbPath);
  const db = drizzle({ client: sqlite });
  runMigrations(db);
  console.log(`Migrations applied to ${dbPath}`);
}

const isDirectCliInvocation =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectCliInvocation) {
  runCli();
}
```
Use this exact `isDirectCliInvocation` guard + `assertMode`/`resolveDbPath`/`openSqliteFile`/`drizzle({ client })` bootstrap in `scripts/sync.ts`. **Real-mode gate**: assert `dashboardMode === "real"` (import from `src/db/client.ts`'s exported `dashboardMode`, or re-derive via `assertMode` the same way `migrate.ts` does — either is consistent with existing precedent since `migrate.ts` itself re-derives mode rather than importing the cached singleton) and `process.exit(1)` loudly if not, mirroring `syncGmailAction`'s `if (dashboardMode !== "real") return { ok:false, ... }` gate but as a hard exit since there's no caller to hand a result object to.

**Sync lifecycle to mirror** (`src/app/actions.ts` lines 217-255, `syncGmailAction`):
```typescript
const previousRun = getLatestSyncRun(db);
const lastSync =
  previousRun?.status === "success" ? (previousRun.finishedAt ?? null) : null;

const runId = startSyncRun(db);

try {
  const counts = await runGmailSync(db, getGmailClient(), { lastSync });
  finishSyncRun(db, runId, {
    status: "success",
    newCount: counts.newCount,
    reviewCount: counts.reviewCount,
    deadLetterCount: counts.deadLetterCount,
  });
} catch (error) {
  console.error("Gmail sync failed:", error);
  finishSyncRun(db, runId, {
    status: "failed",
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1; // scripts/sync.ts equivalent — no revalidatePath call (no Next.js request context)
}
```
Adapt: pass `historyId` from `previousRun?.historyId` alongside `lastSync`; drop the three `revalidatePath` calls (no Next.js request context in a standalone script); use `getGmailClient()` from `src/gmail/client.ts` exactly as `syncGmailAction` does — same server-only Gmail client construction, no fork.

**At-logon throttle** (new logic, no direct analog — RESEARCH Pattern 4 gives the shape):
```typescript
const THROTTLE_MS = 4 * 60 * 60 * 1000; // confirm exact window during planning
const previousRun = getLatestSyncRun(db);
if (
  previousRun?.status === "success" &&
  previousRun.finishedAt &&
  Date.now() - previousRun.finishedAt.getTime() < THROTTLE_MS
) {
  console.log(`Skipping sync — within throttle window.`);
  process.exit(0);
}
```
Extract this check into its own small exported function (e.g. `shouldThrottle(previousRun, now)`) so `tests/scripts/sync-throttle.test.ts` can unit-test it without spinning up a DB — same "pure function, no I/O" shape as `matchApplication`/`classifyParsedResult` in `src/domain/ingestion.ts`.

---

### `src/gmail/client.ts` (MODIFY — add `listHistory` + `getProfileHistoryId`)

**Analog:** itself — existing `listMessages`/`getMessageRaw`/`listLabels` methods (lines 16-60)

**Pattern to copy** (same file, lines 18-33 for the shape; lines 49-58 for the "collect into a clean array, never leak raw googleapis types" convention):
```typescript
async listMessages({ q, labelIds, pageToken }) {
  const res = await gmail.users.messages.list({
    userId: "me",
    q,
    labelIds,
    pageToken,
    maxResults: 500,
  });
  const ids: string[] = [];
  for (const message of res.data.messages ?? []) {
    if (message.id) ids.push(message.id);
  }
  return { ids, nextPageToken: res.data.nextPageToken ?? undefined };
},
```
Add sibling methods following the exact same shape (params destructured at top level per RESEARCH Pitfall 4, results mapped into the narrow `GmailClient`-interface shape, never returning raw `googleapis` response objects):
```typescript
async listHistory({ startHistoryId, pageToken }) {
  const res = await gmail.users.history.list({
    userId: "me",
    startHistoryId,
    historyTypes: ["messageAdded"],
    pageToken,
    maxResults: 500,
  });
  return {
    history: (res.data.history ?? []).map((h) => ({ messagesAdded: h.messagesAdded ?? [] })),
    historyId: res.data.historyId ?? undefined,
    nextPageToken: res.data.nextPageToken ?? undefined,
  };
},

async getProfileHistoryId() {
  const res = await gmail.users.getProfile({ userId: "me" });
  return res.data.historyId ?? undefined;
},
```
404 detection belongs in the caller (`src/domain/ingestion.ts`), NOT swallowed here — `client.ts` must let a `GaxiosError` propagate unchanged, exactly like every other method in this file never catches its own googleapis errors.

---

### `src/gmail/types.ts` (MODIFY — extend `GmailClient` interface)

**Analog:** itself, lines 12-33 (`GmailListMessagesParams`/`GmailListMessagesResult`/`GmailClient`)

```typescript
export interface GmailListMessagesParams {
  q?: string;
  labelIds?: string[];
  pageToken?: string;
}

export interface GmailListMessagesResult {
  ids: string[];
  nextPageToken?: string;
}

export interface GmailClient {
  listMessages(params: GmailListMessagesParams): Promise<GmailListMessagesResult>;
  getMessageRaw(id: string): Promise<string>;
  listLabels(): Promise<GmailLabel[]>;
}
```
Add matching new interfaces (`GmailHistoryRecord`, `GmailHistoryListParams`, `GmailHistoryListResult`) and extend `GmailClient` with `listHistory(...)` and `getProfileHistoryId(): Promise<string | undefined>` — same doc-comment convention as the existing block ("Gmail's `messages.list` never returns content" style note explaining the `messagesAdded`-only read, per RESEARCH Pitfall 1).

---

### `src/gmail/fetch.ts` (MODIFY — add `fetchHistoryMessageIds`)

**Analog:** itself, `listAllMessageIds` (lines 12-26)

```typescript
export async function listAllMessageIds(
  client: GmailClient,
  opts: { q?: string; labelIds?: string[] } = {},
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await client.listMessages({ ...opts, pageToken });
    ids.push(...res.ids);
    pageToken = res.nextPageToken;
  } while (pageToken);

  return ids;
}
```
Same do/while pagination shape, same "pure over the `GmailClient` interface, fully testable against an injected fake" doc-comment convention:
```typescript
export async function fetchHistoryMessageIds(
  client: GmailClient,
  startHistoryId: string,
): Promise<{ messageIds: string[]; newHistoryId: string }> {
  const messageIds = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = startHistoryId;

  do {
    const res = await client.listHistory({ startHistoryId, pageToken });
    for (const record of res.history) {
      for (const added of record.messagesAdded ?? []) {
        if (added.message?.id) messageIds.add(added.message.id);
      }
    }
    if (res.historyId) latestHistoryId = res.historyId;
    pageToken = res.nextPageToken;
  } while (pageToken);

  return { messageIds: [...messageIds], newHistoryId: latestHistoryId };
}
```
Note: read `messagesAdded` only, never the top-level `messages` field (RESEARCH Pitfall 1) — same defensive-read discipline `listAllMessageIds` already applies to `res.data.messages ?? []`.

---

### `src/domain/ingestion.ts` (MODIFY — `runGmailSync` signature + 404 fallback)

**Analog:** itself — the existing `runGmailSync` function (lines 441-510) and its Pass-1 sender-query block (lines 451-465)

**Current signature/Pass 1** (lines 441-465):
```typescript
export async function runGmailSync(
  db: NodeSQLiteDatabase,
  client: GmailClient,
  { lastSync }: { lastSync: Date | null },
): Promise<SyncCounts> {
  const counts: SyncCounts = { newCount: 0, reviewCount: 0, deadLetterCount: 0 };
  const stageIdByLabel = new Map(
    listStages(db).map((stage) => [stage.label, stage.id]),
  );

  const senderQuery = buildSenderQuery(KNOWN_SENDER_DOMAINS, lastSync ?? undefined);
  const queryMessageIds = await listAllMessageIds(client, { q: senderQuery });

  for (const messageId of queryMessageIds) {
    if (isAlreadyIngested(db, messageId)) continue;
    const msg = await fetchParsedMessage(client, messageId);
    const decision = classifyQueryMessage(db, msg, stageIdByLabel);
    db.transaction((tx) => {
      writeDecision(tx, messageId, decision, counts);
    });
  }
  // ...Pass 2 (label backfill), Pass 3 (dead-letter reparse) unchanged...
  return counts;
}
```
**Extension per RESEARCH Pattern 1/Code Examples** — additive `historyId` param, `queryMessageIds` resolution becomes conditional, everything downstream (per-message loop, Pass 2, Pass 3, dedup ledger) untouched:
```typescript
export async function runGmailSync(
  db: NodeSQLiteDatabase,
  client: GmailClient,
  { lastSync, historyId }: { lastSync: Date | null; historyId: string | null },
): Promise<SyncCounts & { newHistoryId?: string; usedFallback: boolean }> {
  const counts: SyncCounts = { newCount: 0, reviewCount: 0, deadLetterCount: 0 };
  let usedFallback = historyId !== null;
  const stageIdByLabel = new Map(listStages(db).map((s) => [s.label, s.id]));

  let queryMessageIds: string[];
  if (historyId) {
    try {
      const result = await fetchHistoryMessageIds(client, historyId);
      queryMessageIds = result.messageIds;
      usedFallback = false;
    } catch (err) {
      if (err instanceof Common.GaxiosError && err.status === 404) {
        const senderQuery = buildSenderQuery(KNOWN_SENDER_DOMAINS, lastSync ?? undefined);
        queryMessageIds = await listAllMessageIds(client, { q: senderQuery });
      } else {
        throw err; // never silently swallow a non-404 error
      }
    }
  } else {
    const senderQuery = buildSenderQuery(KNOWN_SENDER_DOMAINS, lastSync ?? undefined);
    queryMessageIds = await listAllMessageIds(client, { q: senderQuery });
  }

  // per-message loop, Pass 2, Pass 3 — copy verbatim, unchanged

  const newHistoryId = await client.getProfileHistoryId(); // AFTER all work (RESEARCH Pitfall 3)
  return { ...counts, newHistoryId, usedFallback };
}
```
Import `Common` from `googleapis` for the `GaxiosError` type guard (RESEARCH Pitfall 2: `import { Common } from "googleapis"` — never a bare `.status` duck-type check without `instanceof`).

**Callers unaffected structurally**: every existing per-message classify/write/dedup helper (`classifyQueryMessage`, `writeDecision`, `isAlreadyIngested`, `recordIngestedTx`) is reused verbatim — zero changes to lines 296-510 beyond the message-id-source block shown above.

---

### `src/domain/sync-state.ts` (MODIFY — cursor read/write + throttle helper)

**Analog:** itself — `finishSyncRun`/`getLatestSyncRun` (lines 41-76)

**Current `finishSyncRun`** (lines 41-59):
```typescript
export function finishSyncRun(
  db: NodeSQLiteDatabase,
  id: number,
  input: FinishSyncRunInput,
): void {
  const validated = newSyncRunInput.parse(input);

  db.update(syncRuns)
    .set({
      finishedAt: new Date(),
      status: validated.status ?? input.status,
      newCount: validated.newCount ?? 0,
      reviewCount: validated.reviewCount ?? 0,
      deadLetterCount: validated.deadLetterCount ?? 0,
      errorMessage: validated.errorMessage,
    })
    .where(eq(syncRuns.id, id))
    .run();
}
```
Extend the `.set({...})` object with `historyId: validated.historyId` and `usedFallback: validated.usedFallback ?? false` — same "validate via zod before it reaches Drizzle" pattern (V5), extending `FinishSyncRunInput`/`newSyncRunInput` (see `src/db/validation.ts` pattern below) rather than bypassing validation for the two new columns.

`getLatestSyncRun` (lines 69-76) needs NO changes — `db.select()` (no explicit column list) already returns every column including the two new ones once added to the schema; `scripts/sync.ts` reads `previousRun.historyId` directly off its existing return shape.

---

### `src/db/schema.ts` (MODIFY — `syncRuns` + additive migration)

**Analog:** itself, `syncRuns` table definition (lines 286-297)

```typescript
export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .default(defaultTimestampNow),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  status: text("status").notNull().default("running"),
  newCount: integer("new_count").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  deadLetterCount: integer("dead_letter_count").notNull().default(0),
  errorMessage: text("error_message"),
});
```
Add two additive, nullable-or-defaulted columns (mirrors how `reviewQueue.type`/`deadLetter.type` were added nullable in the Phase 3 additive migration per the schema's own comment at lines 228-232 — "nullable at DB level so this additive migration applies cleanly to a possibly-non-empty real.sqlite"):
```typescript
  historyId: text("history_id"),
  usedFallback: integer("used_fallback", { mode: "boolean" }).notNull().default(false),
```
Generate the migration via the project's existing `db:generate` script (`drizzle-kit generate`) — same flow as every prior schema change; do not hand-write SQL.

---

### `src/db/validation.ts` (MODIFY — extend `newSyncRunInput`)

**Analog:** itself, lines 171-181

```typescript
export const SYNC_RUN_STATUSES = ["running", "success", "failed"] as const;
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number];

export const newSyncRunInput = z.object({
  status: z.enum(SYNC_RUN_STATUSES).optional(),
  newCount: z.number().int().nonnegative().optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  deadLetterCount: z.number().int().nonnegative().optional(),
  errorMessage: z.string().optional(),
});
```
Add fields following the same optional-field convention:
```typescript
  historyId: z.string().min(1).optional(),
  usedFallback: z.boolean().optional(),
```

---

### `src/db/open-sqlite.ts` (MODIFY — add `busy_timeout` pragma)

**Analog:** itself, lines 28-36 (existing pragma block)

```typescript
export function openSqliteFile(dbPath: string): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec("PRAGMA journal_mode = WAL");

  return sqlite;
}
```
Add one line per RESEARCH Pitfall 4 (`sqlite.exec("PRAGMA busy_timeout = 5000")`) — this single centralized function is the reason every production connection (client.ts, migrate.ts, seed-lookups.ts, and the new scripts/sync.ts) picks up the fix automatically; no per-call-site change needed elsewhere.

---

### `src/app/actions.ts` (MODIFY — `syncGmailAction` routes through cursor)

**Analog:** itself, lines 217-255 (see full excerpt under `scripts/sync.ts` above — same function, both callers of `runGmailSync` must stay structurally identical per D4-05's "one code path" requirement)

Change: read `previousRun?.historyId` (in addition to the existing `lastSync` derivation) and pass `historyId` through to `runGmailSync`; on success, also pass `historyId: result.newHistoryId` and `usedFallback: result.usedFallback` into `finishSyncRun`'s input object alongside the existing `newCount`/`reviewCount`/`deadLetterCount`.

---

### `src/components/ingestion-health.tsx` (MODIFY — staleness escalation)

**Analog:** itself, the existing `lastSyncStatus === "failed"` branch (lines 152-163) and `formatRelativeTime` helper (lines 67-78)

```typescript
} else if (lastSyncStatus === "failed") {
  lastSyncLine = (
    <p className="text-[14px] leading-[1.5] font-normal text-destructive">
      {lastSyncAt
        ? `Last sync failed — ${formatRelativeTime(lastSyncAt)}`
        : "Last sync failed"}
    </p>
  );
} else if (lastSyncStatus === "success" && lastSyncAt) {
  lastSyncLine = (
    <p className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
      {`Last synced ${formatRelativeTime(lastSyncAt)}`}
    </p>
  );
}
```
Add a `lastSuccessAt`/staleness prop to `SyncHealth` (computed server-side, same tier that already computes `lastSyncAt`/`reviewCount`/`deadLetterCount` before passing them down — this component never queries the DB itself) and insert a staleness branch BEFORE the `failed` check (RESEARCH: "a stale success is a worse signal than a single recent failure — surface first"):
```typescript
const STALE_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000;

function isStale(lastSuccessAt: Date | null): boolean {
  if (!lastSuccessAt) return false;
  return Date.now() - lastSuccessAt.getTime() > STALE_THRESHOLD_MS;
}

if (isStale(lastSuccessAt)) {
  lastSyncLine = (
    <p className="text-[14px] leading-[1.5] font-semibold text-destructive">
      {`⚠ Sync is stale — last success ${formatRelativeTime(lastSuccessAt!)}`}
    </p>
  );
} else if (lastSyncStatus === "failed") {
  // ...existing branch unchanged
}
```
Reuses the exact `formatRelativeTime` helper already in this file — no new date-formatting utility needed. Same Tailwind text-size/leading convention as every other line in this component (`text-[14px] leading-[1.5]`), `font-semibold` instead of `font-normal` to visually outrank the plain failed-state line per the "surface first" requirement.

---

### `tests/helpers/gmail.ts` (MODIFY — extend `FakeGmailFixtures`)

**Analog:** itself, `makeFakeGmailClient` (lines 33-56)

```typescript
export function makeFakeGmailClient(fixtures: FakeGmailFixtures = {}): GmailClient {
  const { labels = [], messagesByQuery = {}, rawById = {}, pageSize = 2 } = fixtures;

  return {
    async listMessages(params) { /* ... */ },
    async getMessageRaw(id) { /* ... */ },
    async listLabels() { return labels; },
  };
}
```
Add `historyByStartId` and `profileHistoryId` fixture fields (mirrors `messagesByQuery`'s "full unpaginated list, sliced by pageSize" convention) plus a way to make `listHistory` reject with a `GaxiosError`-shaped object (a plain object with `status: 404` is sufficient since the domain code's `instanceof Common.GaxiosError` check needs a REAL `GaxiosError` instance to pass — tests should `import { Common } from "googleapis"` and `throw new Common.GaxiosError(...)` or a minimal subclass, not a duck-typed plain object, so the fixture accurately exercises the `instanceof` guard rather than accidentally always taking the non-404 `throw err` branch).

---

## Shared Patterns

### Real-mode gate (V4 Access Control)
**Source:** `src/app/actions.ts` lines 185-188, 218-220 (`connectGmailAction`/`syncGmailAction`)
```typescript
if (dashboardMode !== "real") {
  return { ok: false, error: "Gmail sync is unavailable in demo mode." };
}
```
**Apply to:** `scripts/sync.ts` — same gate, adapted to a hard `process.exit(1)` + `console.error` since there's no `ActionResult` caller to return to. Never re-derive `DASHBOARD_MODE` a second time outside `src/db/client.ts`'s single-reader module (D-13) — `migrate.ts` is the existing precedent for a standalone script that instead calls `assertMode`/`resolveDbPath` directly rather than importing the cached `dashboardMode` singleton; either approach is acceptable but must not add a second `process.env.DASHBOARD_MODE` read site with different logic.

### Fail-loud sync-run recording
**Source:** `src/app/actions.ts` lines 230-254 (`syncGmailAction`'s `startSyncRun`/try/`finishSyncRun` success+catch shape)
**Apply to:** `scripts/sync.ts` — every invocation (daily or at-logon, once past the throttle check) MUST call `startSyncRun`/`finishSyncRun` exactly like the manual action, recording `status: "failed"` with `errorMessage` on any thrown error rather than letting the script crash silently.

### Validate-before-write (V5 Input Validation)
**Source:** `src/domain/sync-state.ts` line 46 (`newSyncRunInput.parse(input)` inside `finishSyncRun`)
**Apply to:** the extended `finishSyncRun` call sites in both `syncGmailAction` and `scripts/sync.ts` — the new `historyId`/`usedFallback` fields must flow through the same zod schema, never bypass it with a raw Drizzle `.set()` of unvalidated values.

### 404-only error-type narrowing (never string-match)
**Source:** RESEARCH Pitfall 2 / Code Examples — `import { Common } from "googleapis"; if (err instanceof Common.GaxiosError && err.status === 404)`
**Apply to:** `src/domain/ingestion.ts`'s history-fetch try/catch — this is the ONLY place that decides "cursor expired vs. real failure"; every other error (401, 5xx, network) must re-throw unchanged so it still hits the existing fail-loud `finishSyncRun({ status: "failed" })` path in the caller.

### Doc-comment convention (design-decision traceability)
**Source:** every file in `src/domain/*` and `src/gmail/*` — dense block comments above each function citing the requirement ID (ING-05/ING-07/D4-0x) and RESEARCH pitfall numbers being addressed.
**Apply to:** all new/modified functions this phase touches — follow the same citation style (e.g. "RESEARCH Pitfall 3", "D4-04") so a future reader can trace a design choice back to CONTEXT.md/RESEARCH.md without re-deriving it.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `scripts/register-task.ps1` | config/infra | event-driven (OS scheduler) | No PowerShell files exist anywhere in this repo yet — this is genuinely new infra. Use RESEARCH.md's Pattern 3 code example (`Register-ScheduledTask`/`New-ScheduledTaskTrigger`/`New-ScheduledTaskSettingsSet`) directly; there is no codebase convention to defer to. |
| `tests/scripts/sync-throttle.test.ts` | test | — | `tests/scripts/` directory does not exist yet (confirmed via Glob — no `scripts/*.ts` files exist prior to this phase). Structure the test file the same as any existing `tests/domain/*.test.ts` (plain Vitest `describe`/`it`, no DB/fixture needed since the throttle check is a pure function over a `previousRun`-shaped object and a `now` timestamp). |

## Metadata

**Analog search scope:** `src/domain/`, `src/gmail/`, `src/db/`, `src/app/`, `src/components/`, `tests/domain/`, `tests/helpers/`, `scripts/` (confirmed empty), root (no `.ps1` files)
**Files scanned:** `src/domain/ingestion.ts`, `src/domain/sync-state.ts`, `src/gmail/client.ts`, `src/gmail/fetch.ts`, `src/gmail/types.ts`, `src/db/schema.ts`, `src/db/validation.ts`, `src/db/client.ts`, `src/db/open-sqlite.ts`, `src/db/migrate.ts`, `src/app/actions.ts`, `src/components/ingestion-health.tsx`, `tests/helpers/gmail.ts`
**Pattern extraction date:** 2026-08-03
