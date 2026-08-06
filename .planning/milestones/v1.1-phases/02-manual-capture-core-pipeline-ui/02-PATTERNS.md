# Phase 2: Manual Capture + Core Pipeline UI - Pattern Map

**Mapped:** 2026-07-29
**Files analyzed:** 24 (net-new + modified)
**Analogs found:** 10 exact/role-match (domain + db) / 24 total — remaining 14 are new UI surfaces with no in-repo analog (see "No Analog Found")

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/domain/board.ts` (NEW: `listBoardApplications`, `getPipelineSummary`) | service (read model) | CRUD (read/aggregate) | `src/domain/applications.ts` → `getApplicationDetail` | exact |
| `src/domain/lookups.ts` (NEW: `listStages`, `listRoleTypes`, `listSources`) | service (read model) | CRUD (read) | `src/domain/contacts.ts` → `getContactsForApplication` (simple `.select().from().where()` shape) | role-match |
| `src/domain/timeline.ts` (NEW: `getJobTimeline`) | service (composed read model) | CRUD (read, multi-source merge) | `src/domain/applications.ts` → `getApplicationDetail` (multi-join + transform-before-return shape) | role-match |
| `src/domain/contacts.ts` (MODIFY: add `getConversationsForApplication`) | service (read model) | CRUD (read) | same file → `getConversationsForContact` (lines 100-110) | exact |
| `src/domain/applications.ts` (MODIFY: add `quickSaveApplication`, `updateApplication`) | service (write model) | CRUD (transactional write) | `src/domain/events.ts` → `appendStatusEvent` (transaction pattern) + same file's `createApplication` (validate-then-insert pattern) | exact |
| `src/domain/events.ts` (MODIFY: extract `appendStatusEventTx`) | service (write model, refactor) | CRUD (transactional write, extracted helper) | `src/domain/projections.ts` → `DbOrTx` type + `recomputeCurrentStage(tx, ...)` (the exact non-transaction-owning helper shape to copy) | exact |
| `src/db/schema.ts` (MODIFY: add `postingUrl` column to `applications`) | model (schema) | CRUD (schema/migration) | same file, `applications` table definition (lines 72-93), specifically the nullable-text-column convention used by `contacts.notes`/`contacts.channel` | exact |
| `drizzle/<new-migration-folder>` (NEW, generated) | migration | batch (schema migration) | `drizzle/20260728222830_bent_lester/` (existing generated migration) | exact |
| `src/db/validation.ts` (MODIFY: add `quickSaveApplicationInput`, `updateApplicationInput`) | utility (validation schema) | request-response (input validation) | same file → `newApplicationInput` / `newStatusEventInput` (lines 33-49) | exact |
| `src/app/layout.tsx` (MODIFY: add NavShell + Toaster + globals.css import) | component (root layout) | request-response (SSR chrome) | same file, current Phase-1 liveness version (11 lines) — thin analog only, must be substantially rewritten | role-match (weak) |
| `src/app/page.tsx` (REPLACE: becomes Pipeline board) | component (server page) | request-response (SSR read) | same file, current Phase-1 liveness version — shows the `db`-import + async-function-returning-JSX shape only | role-match (weak) |
| `src/app/actions.ts` (NEW: Server Actions) | controller (Server Action) | request-response (mutation) | none — see below | none — see RESEARCH §Pattern 5, §Code Examples |
| `src/app/job/[id]/page.tsx` (NEW) | component (server page, dynamic route) | request-response (SSR read) | none — see below | none — see RESEARCH §Pitfall 6 |
| `src/app/job/[id]/actions.ts` (NEW) | controller (Server Action) | request-response (mutation) | none | none — see RESEARCH §Pattern 5 |
| `src/components/nav-shell.tsx` (NEW) | component (client chrome) | request-response | none | none — see RESEARCH §Pitfall 4 |
| `src/components/kpi-row.tsx` (NEW) | component (server) | request-response | none | none — see RESEARCH §Pattern 1 |
| `src/components/pipeline-board.tsx` (NEW) | component (server) | request-response | none | none — see RESEARCH §Pattern 1 |
| `src/components/board-column.tsx` (NEW) | component (server) | request-response | none | none |
| `src/components/application-card.tsx` (NEW) | component (server + embedded client trigger) | request-response | none | none |
| `src/components/quick-save-dialog.tsx` (NEW) | component (client, form) | request-response (mutation trigger) | none | none — see RESEARCH §Code Examples (`useActionState` pattern) |
| `src/components/application-form-dialog.tsx` (NEW) | component (client, form) | request-response (mutation trigger) | none | none |
| `src/components/stage-change-dialog.tsx` (NEW) | component (client, form) | request-response (mutation trigger) | none | none |
| `src/components/contact-conversation-form.tsx` (NEW) | component (client, form) | request-response (mutation trigger) | none | none |
| `src/components/timeline.tsx` (NEW) | component (server) | request-response | none | none — see RESEARCH §Pattern 4 |
| `src/components/ui/*.tsx` (shadcn-generated: button, card, dialog, input, label, select, textarea, badge, dropdown-menu, separator, skeleton, sonner) | component (vendored primitive) | request-response | none — generated by `shadcn add`, not hand-authored | none — CLI-generated, not analog-mapped |
| `components.json` (NEW, hand-authored) | config | n/a | none | none — see RESEARCH §Architecture Patterns Pattern 0 |
| `postcss.config.mjs` (NEW) | config | n/a | none | none — see RESEARCH §Pattern 0 |
| `src/app/globals.css` (NEW) | config (styles) | n/a | none | none — see RESEARCH §Pattern 0 |

## Pattern Assignments

### `src/domain/board.ts` (service, CRUD read/aggregate)

**Analog:** `src/domain/applications.ts` → `getApplicationDetail`

**Imports pattern** (applications.ts lines 1-10):
```typescript
import { eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import {
  applications,
  companies,
  roleTypes,
  sources,
  stages,
} from "@/db/schema";
import { newApplicationInput, type NewApplicationInput } from "@/db/validation";
```
`board.ts` follows the identical shape but imports `asc, eq` from drizzle-orm (per RESEARCH Pattern 1) and only `applications, companies, stages`.

**Core read-model pattern** (applications.ts lines 57-93, `getApplicationDetail`):
```typescript
export function getApplicationDetail(
  db: NodeSQLiteDatabase,
  id: number,
): ApplicationDetail | undefined {
  const row = db
    .select({ /* explicit column projection incl. joined labels */ })
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .leftJoin(roleTypes, eq(applications.roleTypeId, roleTypes.id))
    .leftJoin(sources, eq(applications.sourceId, sources.id))
    .leftJoin(stages, eq(applications.currentStageId, stages.id))
    .where(eq(applications.id, id))
    .get();

  if (!row) return undefined;

  const { outcomeLabel, ...rest } = row;
  return { ...rest, outcome: outcomeLabel ?? "Active" };
}
```
**Copy this exact shape** for `listBoardApplications` (drop `.where()`, use `.all()` not `.get()`, drop `.innerJoin`/`.leftJoin` on roleTypes/sources since the board doesn't need them per RESEARCH's `BoardApplication` interface). `getPipelineSummary` is a plain `.reduce()` over `listBoardApplications()`'s output — no new SQL (per RESEARCH "Don't Hand-Roll": avoid drizzle-orm 1.0.0-rc.4's unverified groupBy/count surface).

**Note the id-projection convention:** every joined read model explicitly lists output columns in `.select({...})` rather than `.select()` — follow this for both new board functions and `getJobTimeline`.

---

### `src/domain/lookups.ts` (service, CRUD read)

**Analog:** `src/domain/contacts.ts` → `getConversationsForContact` (lines 100-110)

```typescript
export function getConversationsForContact(
  db: NodeSQLiteDatabase,
  contactId: number,
) {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.contactId, contactId))
    .orderBy(asc(conversations.occurredAt))
    .all();
}
```
Copy this plain `.select().from().orderBy().all()` shape for `listStages`/`listRoleTypes`/`listSources` — no joins needed, ordered by `id` ascending per RESEARCH ("preserves seed-lookups.ts's canonical D-05 insertion order"). `listRoleTypes` additionally needs a `.where(eq(roleTypes.isActive, true))` filter — follow the `eq()` usage shown in `companies.ts`'s `resolveCompany` (below) for the where-clause syntax.

---

### `src/domain/timeline.ts` (service, composed read model)

**Analog:** `src/domain/applications.ts` → `getApplicationDetail` (multi-join, post-query transform-before-return)

The "shape join result, strip/rename a field, return a typed object" pattern at applications.ts lines 85-92:
```typescript
if (!row) return undefined;
const { outcomeLabel, ...rest } = row;
return { ...rest, outcome: outcomeLabel ?? "Active" };
```
`getJobTimeline` follows the same "map raw rows into a discriminated-union display shape" idea, but merges TWO queries (`statusEvents` join `stages`, and the new `getConversationsForApplication`) and sorts the combined array — see RESEARCH §Architecture Patterns Pattern 4 for the exact target code. Use `src/domain/contacts.ts`'s `getConversationsForContact` as the direct analog for the new `getConversationsForApplication` helper (swap `contacts.contactId` filter for `conversations.applicationId`, add an `innerJoin(contacts, eq(conversations.contactId, contacts.id))` to pull `contactName` — see RESEARCH's exact code block, already grounded in this schema).

---

### `src/domain/contacts.ts` — add `getConversationsForApplication`

**Analog:** same file, `getConversationsForContact` (lines 100-110, quoted above).

Copy verbatim except: `.where(eq(conversations.applicationId, applicationId))` instead of `contactId`, and add `.innerJoin(contacts, eq(conversations.contactId, contacts.id))` plus an explicit `.select({...})` projection to also return `contactName: contacts.name` (RESEARCH already specifies the exact target function — see 02-RESEARCH.md Pattern 4).

---

### `src/domain/applications.ts` — add `quickSaveApplication`, `updateApplication`

**Analogs (combine two):**
1. **Validate-then-insert pattern** — `createApplication` (applications.ts lines 40-49):
```typescript
export function createApplication(
  db: NodeSQLiteDatabase,
  input: NewApplicationInput,
): number {
  const validated = newApplicationInput.parse(input);
  const result = db.insert(applications).values(validated).run();
  return Number(result.lastInsertRowid);
}
```
2. **Transaction-wrapping pattern** — `appendStatusEvent` (events.ts lines 24-41):
```typescript
export function appendStatusEvent(
  db: NodeSQLiteDatabase,
  input: NewStatusEventInput,
) {
  const validated = newStatusEventInput.parse(input);
  return db.transaction((tx) => {
    const inserted = tx
      .insert(statusEvents)
      .values(validated)
      .onConflictDoNothing({ target: statusEvents.sourceMessageId })
      .run();
    recomputeCurrentStage(tx, validated.applicationId);
    return inserted;
  });
}
```
**Critical constraint (from Phase 1 doc comment on `appendStatusEvent`, lines 19-22):** "The transaction callback below is deliberately synchronous (no async/await) — node:sqlite's driver commits immediately after this callback returns." Both `quickSaveApplication` and `updateApplication` MUST keep their `db.transaction((tx) => {...})` callbacks synchronous — no `await` inside.

`quickSaveApplication` composes `resolveCompany`/`createCompany` (from `companies.ts`, below) + `createApplication`'s insert shape + the new `appendStatusEventTx` — all inside one `db.transaction()`, per RESEARCH Pattern 2 (already-designed exact code, use verbatim).

`updateApplication` splits into direct-field `tx.update(applications).set(directFields).where(eq(applications.id, applicationId)).run()` (mirrors `recomputeCurrentStage`'s `tx.update(applications).set({...}).where(eq(applications.id, applicationId)).run()` at projections.ts lines 31-38) plus a conditional `appendStatusEventTx(tx, {...})` call when `stageId` is present — per RESEARCH Pattern 3 (exact code already designed).

---

### `src/domain/events.ts` — extract `appendStatusEventTx`

**Analog:** `src/domain/projections.ts` — the `DbOrTx` type and the non-transaction-owning helper shape:
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbOrTx = NodeSQLiteDatabase | NodeSQLiteTransaction<any>;

export function recomputeCurrentStage(tx: DbOrTx, applicationId: number): void {
  const events = tx.select().from(statusEvents) /* ... */ .all();
  if (events.length === 0) return;
  const latest = events[events.length - 1];
  tx.update(applications).set({...}).where(eq(applications.id, applicationId)).run();
}
```
`recomputeCurrentStage` is already the exact "helper that takes `tx: DbOrTx` and does NOT open its own transaction" pattern `appendStatusEventTx` must follow. Import `DbOrTx` from `./projections` (already exported there) rather than redefining it. Keep the public `appendStatusEvent(db, input)` as a thin wrapper: `validate → db.transaction((tx) => appendStatusEventTx(tx, validated))`, per RESEARCH Pitfall 2 (exact refactor already specified).

---

### `src/db/schema.ts` — add `postingUrl` column

**Analog:** same file, the `applications` table (lines 72-93), following the nullable-text-column convention used elsewhere in the same file (e.g. `contacts.notes: text("notes")`, `contacts.channel: text("channel")` — both plain nullable `text()` with no `.notNull()`):
```typescript
export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  roleTitle: text("role_title"),
  // ADD HERE, nullable, same convention as roleTitle:
  // postingUrl: text("posting_url"),
  ...
});
```
Add `postingUrl: text("posting_url")` immediately after `roleTitle` (both are optional string fields on the application). No `.notNull()`, no default — additive/nullable-only per RESEARCH Pitfall 1 ("no backfill needed, existing rows simply get NULL").

**Migration pattern analog:** `drizzle/20260728222830_bent_lester/` is the existing generated migration (Phase 1's initial schema). Do not hand-write SQL — run `npx drizzle-kit generate` after the schema edit to produce a new timestamped folder in the same `drizzle/` directory, then apply via the existing `npm run db:migrate` script (referenced in `package.json` scripts, resolves `DASHBOARD_MODE` per Phase 1 convention — run once per mode, demo and real, per RESEARCH Pitfall 1).

---

### `src/db/validation.ts` — add `quickSaveApplicationInput`, `updateApplicationInput`

**Analog:** same file, `newApplicationInput` / `newStatusEventInput` (lines 33-49):
```typescript
export const newApplicationInput = z.object({
  companyId: z.number().int().positive(),
  roleTitle: z.string().min(1).optional(),
  roleTypeId: z.number().int().positive().optional(),
  sourceId: z.number().int().positive().optional(),
  dateApplied: z.date().optional(),
});
export type NewApplicationInput = z.infer<typeof newApplicationInput>;
```
Copy this `z.object({...}); export type X = z.infer<typeof x>` two-line-export convention exactly for both new schemas. RESEARCH already specifies their exact field shapes (`quickSaveApplicationInput`: `companyName`, `roleTitle`, `postingUrl` optional URL; `updateApplicationInput`: all fields `.optional()`/`.nullable().optional()`, `stageId` optional int).

---

## Shared Patterns

### Single DASHBOARD_MODE / `db` reader (D2-04, Pitfall 4)
**Source:** `src/db/client.ts` (full file, 52 lines)
**Apply to:** `nav-shell.tsx`, `layout.tsx`, every new page/domain caller
```typescript
import "server-only";
// ...
export const dashboardMode: DashboardMode = /* resolved once, cached on globalThis */;
export const db: DashboardDb = /* singleton */;
```
**Rule:** only `src/db/client.ts` may read `process.env.DASHBOARD_MODE` or import `@/domain/*`/`@/db/*` into anything with `"use client"`. `nav-shell.tsx` must receive `dashboardMode` as a prop from its parent Server Component (`layout.tsx`), never import it directly (it has `usePathname()` so it must be a Client Component).

### Domain-layer-owns-SQL / no raw SQL in UI
**Source:** every existing `src/domain/*.ts` file — zero raw SQL string queries anywhere; all reads/writes go through Drizzle's query builder against typed `schema.ts` tables.
**Apply to:** all new Server Components (`page.tsx`, `pipeline-board.tsx`, `timeline.tsx`, etc.) and all Server Actions — they call `src/domain/*` functions only, never `db.select()`/`db.insert()` directly.

### Zod-validate-at-write-boundary
**Source:** `src/db/validation.ts` (all schemas) + every domain write function (`createApplication`, `appendStatusEvent`, `createContact`, `addConversation`) which call `.parse()` before any Drizzle write.
**Apply to:** `quickSaveApplication`, `updateApplication`, and every Server Action — Server Actions should `.safeParse()` (not `.parse()`) to return a typed error to the client per RESEARCH's `quickSaveAction` example, while the underlying domain function still `.parse()`s (defense in depth, matches existing convention).

### Event-sourcing invariant (D-09) — never write `currentStageId` directly
**Source:** `src/domain/projections.ts` doc comment (lines 8-18) — "The ONLY writer of applications.current_stage_id ... is `recomputeCurrentStage`"; `src/domain/events.ts` doc comment (lines 6-10).
**Apply to:** `updateApplication`, `quickSaveApplication`, `stage-change-dialog.tsx`'s Server Action — any stage change must go through `appendStatusEventTx`/`appendStatusEvent`, never a direct `.update(applications).set({ currentStageId: ... })`.

### Server Action + revalidatePath mutation pattern
**Source:** none in-repo yet (first Server Actions in this codebase) — use RESEARCH §Pattern 5's `quickSaveAction` example verbatim as the template; every detail-page mutation that can change stage must `revalidatePath("/")` AND `revalidatePath(`/job/${id}`)`.

### Date formatting — server-side only (Pitfall 5)
**Source:** RESEARCH §Common Pitfalls Pitfall 5 — no in-repo analog exists yet (this is the first phase with Date-rendering UI). Format `Date` → string inside Server Components (`page.tsx`, `pipeline-board.tsx`, `timeline.tsx`) before passing to any Client Component; never call `.toLocaleDateString()` inside a `"use client"` file.

## No Analog Found

Files with no close match in the codebase — this is the first UI-layer phase; only two React files exist today (`src/app/layout.tsx`, `src/app/page.tsx`), both trivial Phase-1 liveness stubs. The planner should use RESEARCH.md as the pattern source for all of these, not invent a false internal analog:

| File | Role | Data Flow | Reason / Reference |
|---|---|---|---|
| `src/app/actions.ts`, `src/app/job/[id]/actions.ts` | controller (Server Action) | request-response | No Server Actions exist in the codebase yet — see RESEARCH §Architecture Patterns Pattern 5 (`quickSaveAction` full example) and §Code Examples (`useActionState` wiring) |
| `src/app/job/[id]/page.tsx` | component (dynamic route) | request-response | No dynamic routes exist yet; must `await params` per Next.js 16 — see RESEARCH §Common Pitfalls Pitfall 6 for the exact required shape |
| `src/components/nav-shell.tsx` | component (client chrome) | request-response | First client-boundary component in the app — see RESEARCH §Common Pitfalls Pitfall 4 (props-not-imports rule) |
| `src/components/kpi-row.tsx`, `pipeline-board.tsx`, `board-column.tsx`, `application-card.tsx`, `timeline.tsx` | component (server) | request-response | No prior server components beyond the liveness page — see RESEARCH §Recommended Project Structure and §Architecture Patterns Pattern 1/4 for exact target shapes |
| `src/components/quick-save-dialog.tsx`, `application-form-dialog.tsx`, `stage-change-dialog.tsx`, `contact-conversation-form.tsx` | component (client, form) | request-response (mutation trigger) | No client forms exist yet — see RESEARCH §Code Examples (`useActionState` pattern) as the template for all four |
| `src/components/ui/*.tsx` | component (vendored primitive) | request-response | Generated by `npx shadcn add <component>`, not hand-authored or copied from an internal analog — see RESEARCH §Architecture Patterns Pattern 0 for the non-interactive scaffolding sequence |
| `components.json`, `postcss.config.mjs`, `src/app/globals.css` | config | n/a | First-time Tailwind v4 + shadcn scaffolding in this repo — see RESEARCH §Architecture Patterns Pattern 0 for the exact hand-authored `components.json` and `globals.css` content (already fully specified, copy verbatim then adjust color tokens per UI-SPEC) |
| `src/app/layout.tsx`, `src/app/page.tsx` | component (root layout / server page) | request-response | Existing versions are trivial 11-22 line liveness stubs (shown above) — useful only for the `db`/`dashboardMode` import convention; the actual nav-shell + board layout has no in-repo precedent, follow RESEARCH §Recommended Project Structure |

## Metadata

**Analog search scope:** `src/domain/*.ts` (6 files), `src/db/*.ts` (7 files, incl. `schema.ts`, `client.ts`, `validation.ts`), `src/app/*.tsx` (2 files, the only existing React files), `drizzle/` (1 existing migration folder)
**Files scanned:** 16 (all existing source files in the repo relevant to this phase's scope)
**Pattern extraction date:** 2026-07-29
</content>
