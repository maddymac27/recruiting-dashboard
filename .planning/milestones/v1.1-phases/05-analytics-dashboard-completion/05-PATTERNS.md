# Phase 5: Analytics & Dashboard Completion - Pattern Map

**Mapped:** 2026-08-03
**Files analyzed:** 13 (7 new, 6 modified)
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/lib/application-staleness.ts` (NEW) | utility (pure predicate) | transform | `src/lib/staleness.ts` | exact |
| `src/domain/today.ts` (NEW) | service (read model) | CRUD (read/aggregate) | `src/domain/board.ts` (`listBoardApplications`/`getPipelineSummary`) | exact |
| `src/domain/analytics.ts` (NEW) | service (read model / aggregation) | batch (TS-side reduce) | `src/domain/board.ts` (`getPipelineSummary`'s TS-reduction convention) | exact |
| `src/domain/contacts.ts` (MODIFIED — add `getLatestConversationDateByApplication`) | service | batch (flat query → Map reduce) | same file's existing `getConversationsForApplication` | exact |
| `src/domain/board.ts` (MODIFIED — add `currentStageSince` to `BoardApplication`) | service | CRUD (read) | same file (self-extension, precedent: 02-05 companyId/roleTypeId/sourceId/postingUrl extension) | exact |
| `src/app/page.tsx` (REPLACED — new Today view) | route/page (Server Component) | request-response | current `src/app/page.tsx` (Pipeline board) — becomes the template for `board/page.tsx`, and the new Today view mirrors its `readXData()` / empty-state / error-state shape | exact |
| `src/app/board/page.tsx` (NEW — verbatim move) | route/page (Server Component) | request-response | current `src/app/page.tsx` | exact (verbatim copy) |
| `src/app/analytics/page.tsx` (NEW) | route/page (Server Component) | request-response | current `src/app/page.tsx` (`readPipelineData` + empty/error-state pattern) | role-match |
| `src/components/today-list.tsx` (NEW) | component (Server Component, row list) | request-response | `src/components/application-card.tsx` (card/row shape, truncate+title, Link click-through) | role-match |
| `src/components/funnel-chart.tsx` (NEW) | component (`"use client"` chart) | transform (props → chart) | none in codebase (first client-chart component) — follows RESEARCH's shadcn `chart` block example directly | no analog (see below) |
| `src/components/nav-shell.tsx` (MODIFIED — activate Today/Analytics links, reorder) | component (`"use client"` nav) | request-response | same file (self-extension of existing `Link`/`cn(...)` active-state pattern) | exact |
| `src/components/application-card.tsx` (MODIFIED — gone-quiet badge) | component (Server Component card) | request-response | same file (self-extension) | exact |
| `tests/lib/application-staleness.test.ts` (NEW) | test | transform | `tests/lib/staleness.test.ts` | exact |
| `tests/domain/today.test.ts` (NEW) | test | CRUD/integration | `tests/domain/board.test.ts` + `tests/helpers/db.ts` | exact |
| `tests/domain/analytics.test.ts` (NEW) | test | CRUD/integration | `tests/domain/board.test.ts` + `tests/helpers/db.ts` | exact |

## Pattern Assignments

### `src/lib/application-staleness.ts` (utility, pure predicate, NEW)

**Analog:** `src/lib/staleness.ts` (full file, 25 lines — read in its entirety above)

**Whole-file pattern to mirror:**
```typescript
// src/lib/staleness.ts (lines 1-24)
export const STALE_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // D4-A2

export function isSyncStale(
  lastSuccessAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!lastSuccessAt) return false;
  return now.getTime() - lastSuccessAt.getTime() > STALE_THRESHOLD_MS;
}
```
**What to copy:**
- Top-of-file comment banner explaining *why* this is a standalone pure module (no server-only/DB imports; safe to import from both Server Components and `"use client"` components; vitest runs `environment: "node"`).
- Named-constant-for-threshold convention (`export const ..._MS` / `..._DAYS`).
- `now: Date = new Date()` default-param pattern for testability (tests pass a fixed `now`, production callers omit it).
- Null-safe early return (`if (!lastSuccessAt) return false` → for application-staleness, `if (!stageLabel || isTerminal) return { kind: "none" }`).
- RESEARCH.md Pattern 1 (lines 199-265 of 05-RESEARCH.md) already gives the exact target implementation — use it verbatim as the shape, just copy the header-comment convention and default-param idiom from this analog.

**Do NOT** import this module from `src/lib/staleness.ts` or vice versa — they are functionally unrelated (RESEARCH Pitfall 4).

---

### `src/domain/today.ts` (service/read-model, NEW)

**Analog:** `src/domain/board.ts` (full file, 93 lines — read above)

**Imports pattern** (lines 1-3):
```typescript
import { eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { applications, companies, stages } from "@/db/schema";
```
For `today.ts`, the equivalent is importing `listBoardApplications`/`BoardApplication` from `./board`, `getLatestConversationDateByApplication` from `./contacts`, and `getStalenessStatus` from `@/lib/application-staleness` — RESEARCH.md's Code Examples section (lines 484-519) gives the exact target shape; use `board.ts`'s doc-comment style (explaining *why* the shape is what it is, citing decision IDs) for the new file's own comments.

**Core read-model pattern** (lines 32-53, `listBoardApplications`):
```typescript
export function listBoardApplications(
  db: NodeSQLiteDatabase,
): BoardApplication[] {
  return db
    .select({ /* ... */ })
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .leftJoin(stages, eq(applications.currentStageId, stages.id))
    .all();
}
```
Mirror this: one flat `.select().from().join().all()` query per aggregate, never `WHERE` inside a loop (avoids N+1 — RESEARCH Pitfall 3).

**Derived-summary pattern** (lines 62-92, `getPipelineSummary`):
```typescript
/**
 * Derived entirely from `listBoardApplications()` in TypeScript (D2-07:
 * "derived from the board read model, not stored") — deliberately avoids a
 * second grouped-aggregate SQL query against the unverified
 * drizzle-orm 1.0.0-rc.4 group-by/count surface.
 */
export function getPipelineSummary(db: NodeSQLiteDatabase): PipelineSummary {
  const rows = listBoardApplications(db);
  return rows.reduce<PipelineSummary>(
    (acc, row) => { /* bucket logic */ return acc; },
    { applied: 0, savedNotApplied: 0, inProgress: 0, closed: 0 },
  );
}
```
`getTodayItems` in `today.ts` should follow this exact "call an existing flat read model, then `.map()`/`.filter()`/reduce in TypeScript" shape — never a second grouped SQL query. This is a hard codebase constraint (RESEARCH Pattern 3, `groupBy`/`MAX(` grep returns zero hits outside zod).

---

### `src/domain/analytics.ts` (service/aggregation, NEW)

**Analog:** `src/domain/board.ts`'s `getPipelineSummary` (same excerpt as above) — the funnel computation is the same "flat select + TypeScript reduce" shape, scanning `statusEvents` joined to `stages` instead of `applications` joined to `stages`. RESEARCH.md's Pattern 3 code example (lines 299-344) is the ready-to-use target implementation (`getFunnelCounts`) — copy its `FUNNEL_STAGE_ORDER` constant + `Map<number, number>` furthest-rank-per-application reduction shape directly; the pattern to *learn from the codebase* is `getPipelineSummary`'s reduce-not-groupBy convention shown above.

**Error handling pattern to mirror** (from `src/app/page.tsx` lines 29-43, `readPipelineData`):
```typescript
function readPipelineData(): PipelineData | null {
  try {
    return { /* multiple domain reads */ };
  } catch {
    // A read-fetch failure surfaces the UI-SPEC error/board backstop copy
    // rather than an unhandled crash or a blank page.
    return null;
  }
}
```
`src/app/analytics/page.tsx` should wrap its `getFunnelCounts`/summary calls in the identical try/catch-returns-null shape, then render the UI-SPEC "Couldn't load this page. Refresh to try again." copy on `null` — same as the Pipeline board's existing error state.

---

### `src/domain/contacts.ts` (MODIFIED — add `getLatestConversationDateByApplication`)

**Analog:** same file's existing `getConversationsForApplication` (lines 121-137, read above).

**Query + doc-comment pattern to mirror:**
```typescript
export function getConversationsForApplication(
  db: NodeSQLiteDatabase,
  applicationId: number,
) {
  return db
    .select({
      occurredAt: conversations.occurredAt,
      channel: conversations.channel,
      notes: conversations.notes,
      contactName: contacts.name,
    })
    .from(conversations)
    .innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(eq(conversations.applicationId, applicationId))
    .orderBy(asc(conversations.occurredAt))
    .all();
}
```
The new function drops the `.where(...)` (cross-application, per-page-load flat query — RESEARCH Pitfall 3) and instead reduces the flat rows into a `Map<number, Date>` client-side, following the same `.select({...}).from().all()` shape and the file's terse JSDoc-with-rationale comment style (e.g. "Deliberately separate from X... rather than changing that existing function's shape" — see `getContactSummariesForApplication`'s comment at lines 139-146 for the exact voice/structure to copy). RESEARCH.md's Code Examples section (lines 456-481) has the ready target implementation — reuse verbatim, just adapt the file's comment voice.

---

### `src/domain/board.ts` (MODIFIED — extend `BoardApplication` with `currentStageSince`)

**Analog:** self — the file's own precedent, documented in its interface doc-comment (lines 19-31):
```typescript
/**
 * ...
 * `companyId`/`roleTypeId`/`sourceId`/`postingUrl` are included alongside
 * the display fields so the 02-05 write slice's inline "edit" dialog can
 * pre-fill every editable field directly from the board's own read model,
 * without a second per-card `getApplicationDetail` fetch.
 */
```
Add `currentStageSince: applications.currentStageSince` to both the `BoardApplication` interface (after `currentStageIsTerminal`) and the `.select({...})` in `listBoardApplications` — do not re-derive it from `statusEvents` (RESEARCH Pitfall 2/5: it's already maintained by `recomputeCurrentStage`). Update the doc-comment to note the Phase 5 addition, mirroring the existing "included alongside... so X doesn't need a second fetch" phrasing.

---

### `src/app/page.tsx` (REPLACED with new Today view) / `src/app/board/page.tsx` (NEW, verbatim move)

**Analog:** current `src/app/page.tsx` (full file, 161 lines, read above).

**Server Component read + error-state + empty-state pattern to copy verbatim into `board/page.tsx`:**
```typescript
function readPipelineData(): PipelineData | null {
  try {
    return { stages: listStages(db), /* ... */ };
  } catch {
    return null;
  }
}
// ...
export default function HomePage() {
  const data = readPipelineData();
  if (!data) {
    return (
      <main className="flex flex-col gap-6 p-8">
        <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">Pipeline</h1>
        <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
          Couldn&apos;t load this page. Refresh to try again.
        </p>
      </main>
    );
  }
  // ...empty-state branch, then populated branch
}
```
**Sequencing (RESEARCH Pitfall 6 — critical):**
1. Copy this file's content unchanged into `src/app/board/page.tsx` (only the route changes — `<h1>` stays "Pipeline").
2. Replace `src/app/page.tsx` with a NEW Today-view implementation that follows the identical `read...Data(): X | null` → try/catch → error-state `<main>` → empty-state `<main>` → populated `<main>` structural shape, but calls `getTodayItems` from the new `src/domain/today.ts` instead of `readPipelineData`.
3. Same-commit companion change: `nav-shell.tsx`'s `pipelineActive` check must move from `pathname === "/"` to `pathname.startsWith("/board")`, and a new `todayActive = pathname === "/"` drives the new Today link.

**Page title pattern:** `<h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">` — identical Tailwind arbitrary-value classes for every new page (`Today`, `Analytics`) matching Typography's Display role (28px/600).

---

### `src/app/analytics/page.tsx` (NEW)

**Analog:** `src/app/page.tsx`'s `readPipelineData` + KpiRow composition (lines 29-43, 92, 152).

Copy the `read...Data(): X | null` try/catch shape (above) for `getFunnelCounts`/summary metrics, and copy the `<KpiRow summary={summary} />` composition pattern (`src/app/page.tsx:152`, `<KpiRow summary={summary} />` right after the page header) as the template for the new summary-metrics grid, then add `<FunnelChart data={funnel} />` below it (RESEARCH Pattern 4, lines 385-391 of 05-RESEARCH.md, gives the exact Server Component → Client Component prop-passing shape).

---

### `src/components/today-list.tsx` (NEW)

**Analog:** `src/components/application-card.tsx` (full file, 113 lines, read above).

**Card shape + truncate/title + click-through pattern to mirror** (lines 74-93):
```tsx
<Card className="gap-2 py-4 transition-colors hover:border-primary/40">
  <CardContent className="flex flex-col gap-2 px-4">
    <Link href={`/job/${id}`} className="block">
      <p className="truncate text-[20px] leading-[1.2] font-semibold text-foreground" title={companyName}>
        {companyName}
      </p>
      <p className="truncate text-[16px] leading-[1.5] font-normal text-foreground" title={roleLabel}>
        {roleLabel}
      </p>
      <p className="text-[14px] leading-[1.5] font-normal text-muted-foreground">{dateLabel}</p>
    </Link>
    <div className="flex items-center gap-2">
      {/* inline action controls, OUTSIDE the Link, so they don't also trigger navigation */}
    </div>
  </CardContent>
</Card>
```
For today-list rows: keep the `Card`/`CardContent` + truncate+title company/role text + `<Link href={/job/${id}}>` wrapping the display text, but the inline actions become "Log a follow-up" (opens `ContactConversationForm` — see below) and "Change stage" (`StageChangeDialog`, reused verbatim) instead of `ApplicationFormDialog`. Add the "Gone quiet · {N} days" / "Saved · {N} days ago" `Badge` per UI-SPEC Surface 1 — same `Badge` import already used elsewhere (`nav-shell.tsx` imports `Badge` from `@/components/ui/badge`).

**Reused inline actions — no new logic, just composition:**
- `src/components/contact-conversation-form.tsx` — full file read above. Its trigger button is currently `<Button type="button" variant="secondary">Log Contact</Button>` (line 164-166) opened via internal `useState` `open`. RESEARCH Open Question #1 recommends: today-list renders its OWN "Log a follow-up" trigger button and lifts/wraps `ContactConversationForm`'s dialog state rather than editing that file's own "Log Contact" label (still correct in the job-detail context).
- `src/components/stage-change-dialog.tsx` — full file read above; reuse verbatim as `<StageChangeDialog applicationId={id} currentStageId={currentStageId} stages={stages} />` exactly as `application-card.tsx` does at lines 104-108. Per UI-SPEC, keep it `variant`/styling as-is (outline/secondary, not accent) — "Change stage" is not this row's primary action.

---

### `src/components/funnel-chart.tsx` (NEW — no direct in-codebase analog)

**No analog found** — this is the first Recharts/`"use client"` chart component in the codebase. Follow RESEARCH.md's Pattern 4 code example (lines 351-384 of 05-RESEARCH.md) directly, which is itself grounded in the official shadcn `chart` block docs:
```tsx
"use client";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const chartConfig = {
  count: { label: "Applications", color: "#2563eb" },
} satisfies ChartConfig;

export function FunnelChart({ data }: FunnelChartProps) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[240px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="stageLabel" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
```
For the "use client" boundary discipline itself (props are plain serializable data only, no DB handle), mirror `src/components/nav-shell.tsx`'s own header comment (lines 11-14): *"Client chrome only — receives X as a prop from the root Server Component... must never directly import the db client module."* Apply the same discipline note to `funnel-chart.tsx`.

---

### `src/components/nav-shell.tsx` (MODIFIED — activate Today/Analytics links)

**Analog:** self (full file, 108 lines, read above).

**Active-link pattern to replicate for two more links** (lines 28-31, 54-87):
```tsx
const pathname = usePathname();
const pipelineActive = pathname === "/"; // → CHANGE to pathname.startsWith("/board")
// ADD: const todayActive = pathname === "/";
// ADD: const analyticsActive = pathname.startsWith("/analytics");
...
<Link
  href="/"
  className={cn(
    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
    pipelineActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-black/5",
  )}
>
  Pipeline
</Link>
```
Replace the two `aria-disabled` inert `<span>` placeholders (lines 88-101) with real `<Link>`s using this exact `cn(...)` pattern, reordered per UI-SPEC's Nav table (Today first, then Pipeline, then Analytics, then Review, then Dead-letter).

---

### `src/components/application-card.tsx` (MODIFIED — gone-quiet badge overlay)

**Analog:** self (full file, read above) + the `Badge` usage precedent from `nav-shell.tsx` (`import { Badge } from "@/components/ui/badge";` / `<Badge>DEMO</Badge>`, lines 7, 44).

Add an optional `stalenessStatus: StalenessStatus` (or equivalent) prop, and inside `CardContent` (after the existing `<Link>` block, lines 76-93) render a `Badge` with `variant` chosen per UI-SPEC (Destructive styling, `#DC2626`) only when `stalenessStatus.kind === "gone-quiet"` — positioned so it does not cover the truncating company-name `<p>`. No badge is rendered for the "saved-nudge" state on the board (Today-view-only per UI-SPEC Surface 3).

---

### Shared Patterns

### Server Action reuse (no new Server Actions this phase)
**Source:** `src/app/actions.ts` (`changeStageAction`, lines 161-177) + `src/app/job/[id]/actions.ts` (`logConversationAction`, lines 58-71)
**Apply to:** `src/components/today-list.tsx`'s two inline actions — call these EXACT existing exports, unmodified. Both already `safeParse` + `revalidatePath` + return `ActionResult`/ `{ ok, error }` shape:
```typescript
export async function changeStageAction(id: number, stageId: number): Promise<ActionResult> {
  const parsed = updateApplicationInput.pick({ stageId: true }).safeParse({ stageId });
  if (!parsed.success) return { ok: false, error: VALIDATION_ERROR };
  updateApplication(db, id, parsed.data);
  revalidatePath("/"); revalidatePath(`/job/${id}`);
  return { ok: true, id };
}
```
Note: `revalidatePath("/")` already covers the new Today view once it lives at `/` — no Server Action changes needed for the route move.

### Error/toast pattern for client-side action results
**Source:** `src/components/stage-change-dialog.tsx` lines 62-80 and `src/components/contact-conversation-form.tsx` lines 103-159
**Apply to:** Any new client wiring in `today-list.tsx` around these reused dialogs:
```typescript
startTransition(async () => {
  const result = await someAction(...);
  if (!result.ok) {
    setError(result.error);
    toast.error(result.error);
    return;
  }
  setError(null);
  setOpen(false);
});
```

### TypeScript-side aggregation (never SQL GROUP BY)
**Source:** `src/domain/board.ts:62-92` (`getPipelineSummary`'s doc comment + reduce)
**Apply to:** `src/domain/analytics.ts` (funnel + summary metrics) and `src/domain/contacts.ts`'s new aggregate — see Pattern excerpt above. This is a HARD constraint (drizzle-orm pinned at `1.0.0-rc.4`, a release candidate whose `GROUP BY` surface is unverified in this codebase).

### Test file mirroring convention
**Source:** `tests/lib/staleness.test.ts` (full file, read above) + `tests/domain/board.test.ts` (first 60 lines, read above) + `tests/helpers/db.ts` (full file, read above)
**Apply to:** `tests/lib/application-staleness.test.ts`, `tests/domain/today.test.ts`, `tests/domain/analytics.test.ts`
```typescript
// Pure predicate test shape (tests/lib/staleness.test.ts)
import { describe, expect, it } from "vitest";
import { isSyncStale, STALE_THRESHOLD_MS } from "@/lib/staleness";
describe("isSyncStale (D4-03, D4-A2)", () => {
  const now = new Date(1_800_000_000_000);
  it("is not stale at exactly the threshold", () => { /* boundary test */ });
  it("is stale just past the threshold", () => { /* boundary test */ });
});
```
```typescript
// Domain/integration test shape (tests/domain/board.test.ts)
import { describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import { getPipelineSummary, listBoardApplications } from "@/domain/board";
function seedLookups(db: TestDb["db"]) {
  const savedStageId = Number(
    db.insert(stages).values({ label: "Saved", isTerminal: false, outcomeLabel: null }).run().lastInsertRowid,
  );
  // ...manually insert stages/companies/applications rows (no seedLookups() helper used in unit tests)
}
```
Test files MUST live in the top-level `tests/` mirror directory (`tests/lib/application-staleness.test.ts`, `tests/domain/today.test.ts`, `tests/domain/analytics.test.ts`) — never co-located inside `src/`. Use `createTestDb()` from `tests/helpers/db.ts` (in-memory `node:sqlite`, fully migrated) for any `src/domain/*` integration test, and hand-seed `stages`/`companies`/`applications` rows exactly as `tests/domain/board.test.ts`'s `seedLookups` helper does — do not rely on the separate opt-in `seedLookups` production script.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/components/funnel-chart.tsx` | component (`"use client"` chart) | transform | First Recharts/chart component in this codebase — no prior client-chart precedent exists. Use RESEARCH.md's Pattern 4 code example (grounded in official shadcn `chart` block docs) as the template instead of an in-repo analog. |

## Metadata

**Analog search scope:** `src/lib/`, `src/domain/`, `src/app/`, `src/components/`, `src/components/ui/`, `tests/lib/`, `tests/domain/`, `tests/helpers/` — all read directly via the Read tool (no Glob/Grep needed; RESEARCH.md already named every exact analog path, confirmed by direct reads above).
**Files scanned:** 13 (all named in RESEARCH.md's canonical_refs and Sources sections, each opened and excerpted directly — `src/lib/staleness.ts`, `src/domain/board.ts`, `src/domain/contacts.ts`, `src/app/page.tsx`, `src/components/nav-shell.tsx`, `src/components/application-card.tsx`, `src/components/kpi-row.tsx`, `src/app/actions.ts`, `src/app/job/[id]/actions.ts`, `src/components/contact-conversation-form.tsx`, `src/components/stage-change-dialog.tsx`, `tests/lib/staleness.test.ts`, `tests/domain/board.test.ts`, `tests/helpers/db.ts`)
**Pattern extraction date:** 2026-08-03
