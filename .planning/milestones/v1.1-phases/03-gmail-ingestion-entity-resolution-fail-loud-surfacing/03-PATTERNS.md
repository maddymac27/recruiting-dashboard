# Phase 3: Gmail Ingestion, Entity Resolution & Fail-Loud Surfacing - Pattern Map

**Mapped:** 2026-07-29
**Files analyzed:** 21
**Analogs found:** 18 / 21

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/gmail/oauth.ts` | service | request-response (OAuth token exchange) | `src/db/client.ts` (server-only singleton pattern) | partial |
| `src/gmail/client.ts` | service | request-response (external API wrapper) | `src/domain/companies.ts` (thin domain wrapper functions) | partial |
| `src/gmail/query.ts` | utility | transform (string building) | `src/domain/companies.ts` `normalizeCompanyName` (pure transform helper) | role-match |
| `src/gmail/fetch.ts` | service | streaming/batch (paginated external fetch) | none — no existing paginated-fetch analog | none |
| `src/gmail/parsers/index.ts` | service | transform (dispatch) | `src/domain/companies.ts` `resolveCompany` (lookup/dispatch shape) | partial |
| `src/gmail/parsers/handshake.ts` | utility | transform (regex extraction) | none — no existing email-parsing analog | none |
| `src/gmail/parsers/workday.ts` | utility | transform (regex extraction) | none | none |
| `src/gmail/parsers/ashby.ts` | utility | transform (regex extraction) | none | none |
| `src/domain/ingestion.ts` | service | event-driven/batch (orchestrator, per-message tx) | `src/domain/applications.ts` `quickSaveApplication` (multi-step atomic write via `db.transaction`) | exact |
| `src/domain/review-queue.ts` | service | CRUD | `src/domain/contacts.ts` (insert/list CRUD-style functions over a simple table) | exact |
| `src/domain/dead-letter.ts` | service | CRUD | `src/domain/contacts.ts` (insert/list CRUD-style functions) | exact |
| `src/domain/sync-state.ts` | service | CRUD | `src/domain/contacts.ts` (insert/list CRUD-style functions) | role-match |
| `src/db/schema.ts` (extend: `ingestedMessages`, `syncRuns`, extend `reviewQueue`/`deadLetter`) | model | CRUD (schema/migration) | existing `reviewQueue`/`deadLetter`/`overrides` table defs in same file | exact |
| `src/db/validation.ts` (extend: parsed-email + review/dead-letter/sync-run schemas) | utility | transform (validation) | existing `newStatusEventInput`/`overrideInput` zod schemas | exact |
| `src/domain/applications.ts` (extend: wire `getMergedField` into `getApplicationDetail`) | service | CRUD (read-path fix, Pitfall 1) | `src/domain/overrides.ts` `getMergedField` (the function being wired in) | exact |
| `src/app/actions.ts` (extend: `syncGmailAction`, `connectGmailAction`) | controller | request-response (Server Action) | `src/app/actions.ts` `quickSaveAction`/`updateApplicationAction` (existing Server Actions in same file) | exact |
| `src/app/api/auth/google/callback/route.ts` | route | request-response (OAuth redirect) | none — no existing Route Handler in codebase | none |
| `src/app/review/page.tsx` | component | request-response (Server Component list page) | `src/components/board-column.tsx` + `src/app/job/[id]/page.tsx`-style Server Component list rendering | role-match |
| `src/app/dead-letter/page.tsx` | component | request-response (Server Component list page) | same as above | role-match |
| `src/components/review-queue-item.tsx` (or dialog) | component | request-response (confirm/reject action UI) | `src/components/contact-conversation-form.tsx` (client dialog, `useTransition` + Server Action + `safeParse` error surfacing) | exact |
| `tests/domain/ingestion.test.ts`, `tests/domain/review-queue.test.ts`, `tests/domain/dead-letter.test.ts`, `tests/domain/sync-state.test.ts`, `tests/gmail/*.test.ts` | test | request-response (unit/integration) | `tests/helpers/db.ts` + existing `tests/domain/overrides.test.ts` pattern | exact |

## Pattern Assignments

### `src/domain/ingestion.ts` (service, event-driven/batch orchestrator)

**Analog:** `src/domain/applications.ts` — `quickSaveApplication` (lines 122-152) and `updateApplication` (lines 165-189)

**Imports pattern:**
```typescript
import { eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { applications, companies, roleTypes, sources, stages } from "@/db/schema";
import { quickSaveApplicationInput, updateApplicationInput, type QuickSaveApplicationInput } from "@/db/validation";
import { createCompany, resolveCompany } from "./companies";
import { appendStatusEventTx } from "./events";
```

**Core atomic-write pattern to copy (applications.ts:122-152):**
```typescript
export function quickSaveApplication(
  db: NodeSQLiteDatabase,
  savedStageId: number,
  input: QuickSaveApplicationInput,
): number {
  const validated = quickSaveApplicationInput.parse(input);

  return db.transaction((tx) => {
    const companyId =
      resolveCompany(tx, validated.companyName) ??
      createCompany(tx, validated.companyName);

    const inserted = tx.insert(applications).values({ ... }).run();
    const applicationId = Number(inserted.lastInsertRowid);

    appendStatusEventTx(tx, {
      applicationId,
      stageId: savedStageId,
      occurredAt: new Date(),
    });

    return applicationId;
  });
}
```

**CRITICAL constraint (per RESEARCH Pitfall 2/3):** `ingestion.ts`'s per-message write function must mirror this exact shape — ALL async work (Gmail fetch, MIME parse, regex, confidence scoring) happens *before* calling this function; the function itself takes only already-computed synchronous values and wraps them in exactly one `db.transaction`, matching `quickSaveApplication`'s synchronous-callback discipline. **One transaction per message**, not one per sync run (Pitfall 2) — same reasoning `updateApplication` uses for combining a field-edit + stage-change atomically, extended here to combining a dedup-ledger insert + routing-decision insert (transition/review/dead-letter) atomically per message.

**Transactional sub-primitive to reuse directly:** `appendStatusEventTx` (`src/domain/events.ts:27-37`) — call this (never the public `appendStatusEvent` wrapper) from inside the per-message transaction for any high-confidence parsed transition, exactly as `updateApplication` calls it for a stage change:
```typescript
appendStatusEventTx(tx, {
  applicationId,
  stageId: derivedStageId,
  occurredAt: parsedEventDate, // NEVER received-time — D3-05
  sourceMessageId: messageId,  // idempotency, DATA-06 — see events.ts's ON CONFLICT DO NOTHING
  confidence,
});
```

**Entity resolution to reuse directly:** `resolveCompany`/`createCompany` (`src/domain/companies.ts:82-103`, `25-38`) — no new fuzzy-matching logic; call these exactly as `quickSaveApplication` does.

---

### `src/domain/review-queue.ts` / `src/domain/dead-letter.ts` (service, CRUD)

**Analog:** `src/domain/contacts.ts` — `createContact` (lines 16-25) and the `get*` list functions (lines 70-137)

**Imports pattern:**
```typescript
import { eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { reviewQueue } from "@/db/schema"; // or deadLetter
import { /* new zod schema */ } from "@/db/validation";
```

**Insert pattern to copy (contacts.ts:16-25):**
```typescript
export function createContact(
  db: NodeSQLiteDatabase,
  input: NewContactInput,
): number {
  const validated = newContactInput.parse(input);
  const result = db.insert(contacts).values(validated).run();
  return Number(result.lastInsertRowid);
}
```
Apply the identical shape for `insertReviewQueueEntry`/`insertDeadLetterEntry`: validate via a new zod schema in `db/validation.ts`, single `db.insert(...).values(validated).run()`, return `Number(result.lastInsertRowid)`.

**List/filter pattern to copy (contacts.ts:100-110, `getConversationsForContact`):**
```typescript
export function getConversationsForContact(db: NodeSQLiteDatabase, contactId: number) {
  return db.select().from(conversations)
    .where(eq(conversations.contactId, contactId))
    .orderBy(asc(conversations.occurredAt))
    .all();
}
```
Use this shape for `listPendingReviewItems(db)`/`listDeadLetterEntries(db)`, filtering `status = 'pending'` and ordering by `createdAt`.

**Existing schema stubs already in place** (`src/db/schema.ts:218-240`) — extend, do not recreate:
```typescript
export const reviewQueue = sqliteTable("review_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceMessageId: text("source_message_id"),
  candidateApplicationId: integer("candidate_application_id").references(() => applications.id),
  confidence: real("confidence"),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultTimestampNow),
});

export const deadLetter = sqliteTable("dead_letter", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceMessageId: text("source_message_id"),
  rawPayload: text("raw_payload"),
  failedStage: text("failed_stage"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultTimestampNow),
});
```
Per RESEARCH's Data Model / ING-04-REL-01/02 needs, this phase must add a `type` discriminator column to `reviewQueue` (e.g. `low_confidence_match` | `unmatched_confirm_create` | `label_mail`) and to `deadLetter` (e.g. `known_sender_failed` | `unparseable`) via a new Drizzle migration — follow the same `text("...")` column style as `failedStage`/`status` above, not an enum.

---

### `src/db/schema.ts` extension — new `ingestedMessages` + `syncRuns` tables

**Analog:** existing `statusEvents` (lines 102-127) for the unique-message-id pattern, and `overrides` (lines 133-153) for the composite-unique-index pattern

```typescript
// statusEvents.ts shows the idempotency-by-unique-index pattern to copy:
uniqueIndex("status_events_source_message_id_unique").on(t.sourceMessageId),

// New table sketch (per RESEARCH Pattern 3 / Don't Hand-Roll):
export const ingestedMessages = sqliteTable("ingested_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: text("message_id").notNull(),
  outcome: text("outcome").notNull(), // transition | review | dead_letter
  applicationId: integer("application_id").references(() => applications.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultTimestampNow),
}, (t) => [
  uniqueIndex("ingested_messages_message_id_unique").on(t.messageId),
]);

export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull().default(defaultTimestampNow),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  status: text("status").notNull().default("running"), // running | success | failed
  newCount: integer("new_count").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  deadLetterCount: integer("dead_letter_count").notNull().default(0),
  errorMessage: text("error_message"),
});
```
Follow the file's established comment-block convention (see `// ---... Structural-only stubs (D-15) ---` header at line 213) to introduce a new section header for these tables, and add their inferred `$inferSelect`/`$inferInsert` types at the bottom of the file alongside the existing type exports (lines 246-283).

---

### `src/db/validation.ts` extension — parsed-email / review / dead-letter / sync-run schemas

**Analog:** `newStatusEventInput` (lines 73-80) and `overrideInput` (lines 104-109)

```typescript
export const newStatusEventInput = z.object({
  applicationId: z.number().int().positive(),
  stageId: z.number().int().positive(),
  occurredAt: z.date(),
  sourceMessageId: z.string().min(1).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});
```
Model a new `parsedEmailResult` schema (company, status/stageId, occurredAt required per D3-05; roleTitle optional) directly on this shape, and a `newReviewQueueEntryInput`/`newDeadLetterEntryInput` schema following `overrideInput`'s minimal-field style (lines 104-109). Every ingestion write path must `.parse()`/`.safeParse()` through these before touching Drizzle — matches the file's stated convention (comment block, lines 24-31).

---

### `src/domain/applications.ts` (extend — wire `getMergedField` into `getApplicationDetail`, Pitfall 1)

**Analog:** `src/domain/overrides.ts` `getMergedField` (lines 65-83) — the function to call, not copy

**Current gap:** `getApplicationDetail` (`src/domain/applications.ts:66-102`) reads raw columns directly and returns them unmerged. Fix pattern:
```typescript
// getMergedField signature (overrides.ts:65-70):
export function getMergedField(
  db: NodeSQLiteDatabase,
  applicationId: number,
  fieldName: OverridableField,
  derivedValue: string | null,
): string | null
```
In `getApplicationDetail`, after building `rest` from the joined row (line 96-101), call `getMergedField(db, id, "company", rest.companyName)` etc. for each of the six `OVERRIDABLE_FIELDS` (`company`, `role_title`, `role_type`, `source`, `date_applied`, `current_stage` — `src/db/validation.ts:13-20`) before returning. This is the single required read-path fix RESEARCH flags as CRITICAL (Pitfall 1) — no new design, just call the existing function at the existing read site.

---

### `src/app/actions.ts` (extend — `syncGmailAction`, `connectGmailAction`)

**Analog:** `quickSaveAction` (lines 57-68) and `updateApplicationAction` (lines 117-141) — same file, same Server Action conventions

```typescript
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, dashboardMode } from "@/db/client";
// ... existing imports

export async function syncGmailAction(): Promise<ActionResult> {
  if (dashboardMode !== "real") {
    return { ok: false, error: "Gmail sync is unavailable in demo mode." }; // DEMO-02 gate, Pitfall 6
  }
  // ... run ingestion orchestrator (src/domain/ingestion.ts), synchronous transaction per message
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath("/dead-letter");
  return { ok: true };
}
```
Follow the file's `ActionResult` return type (`{ ok: true; id?: number } | { ok: false; error: string }`, lines 37-39), the `safeParse`-first convention where applicable, and the `revalidatePath` set at the end of every mutating action (see `quickSaveAction` line 66, `changeStageAction` lines 159-160). Gate every new action on `dashboardMode` per RESEARCH Pitfall 6 — this is a NEW pattern not present in any existing action (none of Phase 1/2's actions needed a mode check), so add it explicitly rather than assuming precedent.

---

### `src/app/job/[id]/actions.ts`-style pattern for review-queue confirm/reject actions

**Analog:** `logContactAction`/`logConversationAction` (`src/app/job/[id]/actions.ts:34-71`) — same `safeParse` → domain write → `revalidatePath` shape; apply this to new `confirmReviewItemAction`/`rejectReviewItemAction` in a new `src/app/review/actions.ts`.

---

### `src/components/review-queue-item.tsx` (client dialog for confirm & create / reassign)

**Analog:** `src/components/contact-conversation-form.tsx` (full file, 400 lines) — client component conventions to copy:
- `"use client"` directive + `useState`/`useTransition` (lines 1-3, 83-86)
- Server Action import + call inside `startTransition(async () => { ... })` (lines 107-159)
- `ActionResult`-shaped response handling: `if (!result.ok) { setError(result.error); toast.error(result.error); return; }` (lines 125-129, 150-154)
- Free text (raw email body) rendered as escaped JSX text only — `{error}` pattern at line 380-384; **never** `dangerouslySetInnerHTML`, per RESEARCH Security Domain — this is the direct analog for rendering a dead-letter "raw email" viewer.
- Dialog primitives (`Dialog`/`DialogContent`/`DialogHeader`/`DialogFooter`, lines 7-15, 161-397) — reuse the same shadcn/ui component set.

---

### `src/app/review/page.tsx` / `src/app/dead-letter/page.tsx` (Server Component list pages)

**Analog:** `src/components/board-column.tsx` (full file) for the list/empty-state rendering shape:
```typescript
{applications.length === 0 ? (
  <div className="flex flex-col gap-1 rounded-md border border-dashed border-border p-4 text-center">
    <p className="text-[20px] leading-[1.2] font-semibold text-foreground">Nothing here yet</p>
    <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">...</p>
  </div>
) : (
  <div className="flex flex-col gap-3">
    {items.map((item) => ( /* row/card */ ))}
  </div>
)}
```
Server Component reads data directly from a `@/domain/*` function (matches `board-column.tsx`'s prop-threading convention — no client component ever imports the DB directly, lines 19-20 comment) and passes rows down to a client dialog component (`review-queue-item.tsx`) for the interactive confirm/reject/reassign controls.

---

### `tests/domain/ingestion.test.ts` etc. (test)

**Analog:** `tests/helpers/db.ts` (full file, unchanged) — reuse `createTestDb()` exactly as-is for every new domain test file:
```typescript
import { createTestDb } from "../helpers/db";

const { db, close } = createTestDb();
// ... run domain function under test
close();
```
For Gmail-API-touching tests (`tests/gmail/query.test.ts`, `tests/gmail/labels.test.ts`, `tests/gmail/parsers/*.test.ts`), no direct analog exists in the codebase (first phase touching an external API) — RESEARCH's Validation Architecture section specifies injecting a narrow `{ listMessages, getMessage, listLabels }` interface so tests substitute a fake object rather than calling `googleapis` directly; there is no existing mock-fixture file to copy from, so `tests/helpers/gmail.ts` must be authored fresh (see "No Analog Found" below).

---

## Shared Patterns

### Server-only / DASHBOARD_MODE gating
**Source:** `src/db/client.ts` (lines 1, 27-31, 45-52)
**Apply to:** `src/gmail/oauth.ts`, `src/gmail/client.ts`, `syncGmailAction`/`connectGmailAction` in `src/app/actions.ts`
```typescript
import "server-only";
// ...
if (dashboardMode !== "real") { /* fail loud / no-op — never touch .secrets/ or attempt a Gmail call */ }
```
All Gmail-token-reading and Gmail-API-calling code must live behind `import "server-only"` exactly like `src/db/client.ts`, and must check `dashboardMode` before doing anything (Pitfall 6) — there is no existing analog for this *specific* check (new to Phase 3), so this is a documented net-new convention, not a copy.

### Transaction discipline: non-owning `*Tx` primitives vs. public wrapper
**Source:** `src/domain/events.ts` (`appendStatusEventTx` lines 27-37 vs. `appendStatusEvent` lines 46-53)
**Apply to:** `src/domain/ingestion.ts`, `src/domain/review-queue.ts`, `src/domain/dead-letter.ts`
Any new domain function meant to be called from inside `ingestion.ts`'s per-message transaction (e.g. a `insertReviewQueueEntryTx(tx, ...)`) must NOT open its own `db.transaction` — mirror `appendStatusEventTx`'s "opens NO transaction of its own" doc comment (lines 6-13) exactly, and only provide a public non-`Tx` wrapper if a caller outside `ingestion.ts` needs a standalone version.

### Zod validate-before-Drizzle-write
**Source:** `src/db/validation.ts` (whole file) + every `src/domain/*.ts` function (`createContact` line 20, `quickSaveApplication` line 127, `setOverride` line 28)
**Apply to:** every new domain write function (`ingestion.ts`, `review-queue.ts`, `dead-letter.ts`, `sync-state.ts`)
```typescript
const validated = someInputSchema.parse(input);
const result = db.insert(table).values(validated).run();
```

### Server Action `ActionResult` + `revalidatePath`
**Source:** `src/app/actions.ts` (lines 37-39, and every action in the file)
**Apply to:** `syncGmailAction`, `connectGmailAction`, `confirmReviewItemAction`, `rejectReviewItemAction`
```typescript
export type ActionResult = { ok: true; id?: number } | { ok: false; error: string };
```

### Escaped raw-content rendering (no `dangerouslySetInnerHTML`)
**Source:** `src/components/contact-conversation-form.tsx` (free-text Notes field, lines 367-378; error text lines 380-384)
**Apply to:** dead-letter "view raw email" viewer, review-queue label-mail body display
Render untrusted email content (dead-letter raw payload, label-mail verbatim body) only inside a plain JSX text node or `<pre>{content}</pre>` — never interpolate into HTML.

## No Analog Found

Files with no close match in the codebase (planner should follow RESEARCH.md's cited patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/gmail/oauth.ts` | service | request-response | First OAuth integration in the project — no existing OAuth2Client wiring; follow RESEARCH's Pattern 1/2 (`google-auth-library` `OAuth2Client`, `tokens` event) directly. |
| `src/gmail/fetch.ts` | service | streaming/batch | No existing paginated-external-API-fetch code; follow RESEARCH's "Paginating messages.list" code example directly. |
| `src/gmail/parsers/{handshake,workday,ashby}.ts` | utility | transform | No existing email-parsing/regex-extraction code anywhere in the codebase; templates are execution-time unknowns per D3-02 — write against real sampled messages (Wave 0), not an existing analog. |
| `src/app/api/auth/google/callback/route.ts` | route | request-response | First Route Handler in the project (everything else is a Server Action) — needed because Google's OAuth redirect requires a GET-able URL; follow RESEARCH Pattern 1's callback-exchange example directly. |
| `tests/helpers/gmail.ts` | test fixture | request-response | No existing external-API mock fixture in the test suite (`tests/helpers/db.ts` only covers the DB); author a narrow `{ listMessages, getMessage, listLabels }` fake per RESEARCH's Validation Architecture guidance. |
| `.secrets/gmail-token.json` handling | config | file-I/O | No existing local-file-secret read/write code (only `.secrets/` OAuth client JSON exists, read once at setup) — use Node's built-in `fs`/`node:fs` per RESEARCH's Supporting Libraries table, no wrapper exists to copy. |

## Metadata

**Analog search scope:** `src/domain/`, `src/db/`, `src/app/`, `src/app/job/[id]/`, `src/components/`, `tests/helpers/`, `tests/domain/`
**Files scanned:** `src/domain/events.ts`, `src/domain/overrides.ts`, `src/domain/applications.ts`, `src/domain/contacts.ts`, `src/domain/companies.ts`, `src/db/schema.ts`, `src/db/validation.ts`, `src/db/client.ts`, `src/app/actions.ts`, `src/app/job/[id]/actions.ts`, `src/components/contact-conversation-form.tsx`, `src/components/board-column.tsx`, `tests/helpers/db.ts`
**Pattern extraction date:** 2026-07-29
