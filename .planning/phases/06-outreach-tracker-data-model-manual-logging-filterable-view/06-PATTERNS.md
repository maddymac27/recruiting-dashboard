# Phase 6: Outreach Tracker — Pattern Map

**Mapped:** 2026-08-05
**Files analyzed:** 15 (7 new, 5 modified, tests below)
**Analogs found:** 15 / 15 (all direct in-repo mirrors — no external pattern needed)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/db/schema.ts` (+ `outreachMessages` table) | model | CRUD | `statusEvents` table shape (nullable `sourceMessageId` + `uniqueIndex`), `contacts`/`conversations` column style | exact |
| `src/db/validation.ts` (+ `newOutreachInput`, `OUTREACH_CHANNELS`) | model/validation | request-response | `newContactInput` / `newConversationInput` | exact |
| `src/domain/outreach.ts` (NEW: `createOutreach`, `listOutreach`, `getOutreachCountsByContact`) | service | CRUD | `src/domain/contacts.ts` (`createContact`, `getConversationsForApplication`, `listContactsWithOutreach`'s reduce) | exact |
| `src/domain/contacts.ts` (EXTEND `listContactsWithOutreach` → `outreachCount`) | service | CRUD | itself — extend existing reduce-not-groupBy aggregation | exact |
| `src/app/actions.ts` (+ `logOutreachAction`) | controller (Server Action) | request-response | `quickSaveAction`/`addApplicationAction` (company resolution) + `logContactAction` (`src/app/job/[id]/actions.ts`, new-contact creation) | exact |
| `src/app/outreach/page.tsx` (NEW) | route/controller | request-response | `src/app/contacts/page.tsx` | exact |
| `src/app/outreach/loading.tsx` (NEW) | route | request-response | `src/app/board/loading.tsx` | exact |
| `src/components/outreach-table.tsx` (NEW) | component | request-response | `src/components/application-table.tsx` | exact |
| `src/components/outreach-log-form.tsx` (NEW, Dialog) | component | request-response | `src/components/contact-conversation-form.tsx` | exact |
| `src/components/outreach-view-dialog.tsx` (NEW, read-only Dialog) | component | request-response | `src/components/contact-conversation-form.tsx`'s Dialog shell (props-only variant, no domain read pattern in-repo yet — nearest is the Dialog scaffolding itself) | role-match |
| `src/components/contacts-table.tsx` (EXTEND: + "Outreach" column) | component | request-response | itself — extend existing "Touchpoints" badge column | exact |
| `src/components/nav-shell.tsx` (EXTEND: + "Outreach" nav link) | component | request-response | itself — extend `NAV_ITEMS` array | exact |
| `src/components/ui/checkbox.tsx` (NEW via `npx shadcn add checkbox`) | component (primitive) | — | shadcn official registry generator, not hand-written | n/a (generated) |
| `src/demo/seed/seed.ts` + `src/demo/seed/companies.ts` (EXTEND: outreach fixtures) | config/seed | batch | itself — extend `seedDemo()`'s per-fixture replay loop + `DemoCompanyFixture` interface | exact |
| `tests/db/migrate.test.ts` + `tests/db/schema-parity.test.ts` (EXTEND `EXPECTED_TABLES`) | test | — | itself — both files' existing `EXPECTED_TABLES` const arrays | exact |

## Pattern Assignments

### `src/db/schema.ts` — add `outreachMessages` table (model, CRUD)

**Analog:** `statusEvents` table (nullable `sourceMessageId` + `uniqueIndex` shape, lines 102-127) + `contacts`/`conversations` plain-column style (lines 159-211)

**Imports** (top of file, lines 1-10) — already imports everything needed:
```typescript
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
```

**`defaultTimestampNow` convention** (line 18) — reuse verbatim, do not use `.defaultNow()` (epoch-ms bug, CR-01 comment):
```typescript
const defaultTimestampNow = sql`(unixepoch())`;
```

**Forward-compat nullable `sourceMessageId` + unique index pattern** (`statusEvents`, lines 102-127 — exact precedent to mirror for D-03):
```typescript
export const statusEvents = sqliteTable(
  "status_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id").notNull().references(() => applications.id),
    stageId: integer("stage_id").notNull().references(() => stages.id),
    occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
    // nullable — null for manually-created events. SQLite treats NULLs as
    // distinct from each other, so many NULL rows never collide with the
    // UNIQUE index below.
    sourceMessageId: text("source_message_id"),
    confidence: real("confidence"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultTimestampNow),
  },
  (t) => [
    uniqueIndex("status_events_source_message_id_unique").on(t.sourceMessageId),
  ],
);
```

**`contacts`/`conversations` plain-column, no-lookup-table style** (lines 159-176, 198-211) — mirror for `channel`/`purpose` (D-05 anti-pattern note: do NOT add a lookup table):
```typescript
export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").references(() => companies.id), // nullable pattern for optional FK
  name: text("name").notNull(),
  channel: text("channel"), // plain text, not an enum/lookup table
  relationshipType: text("relationship_type"),
  source: text("source"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultTimestampNow),
});

export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  applicationId: integer("application_id").references(() => applications.id), // nullable FK example
  occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(), // notNull, no default — user-supplied
  channel: text("channel"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(defaultTimestampNow),
});
```

**Inferred-type export convention** (lines 339-346) — add matching pair for the new table:
```typescript
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
```

**Apply to `outreach_messages`:** two `notNull` FKs (`contactId` → `contacts.id`, `companyId` → `companies.id`, both mirroring `conversations.contactId`'s `notNull` shape, not `contacts.companyId`'s nullable shape — D-02 requires both present), `channel`/`purpose` as plain `text().notNull()` (D-04/D-05, no lookup table), `subject` nullable `text()` (D-06), `body` `text().notNull()`, `sentDate` `integer(mode:"timestamp").notNull()` with **no default** (mirrors `conversations.occurredAt` — always user-supplied, D-07), `responded` `integer(mode:"boolean").notNull().default(false)` (D-08), `outcome` nullable `text()`, `sourceMessageId` nullable `text()` + `uniqueIndex` (mirrors `statusEvents` exactly, D-03), `source` `text().notNull().default("manual")`, `createdAt` with `defaultTimestampNow`.

---

### `src/db/validation.ts` — add `newOutreachInput` (model/validation, request-response)

**Analog:** `newContactInput` (lines 82-93) + `newConversationInput` (lines 95-102)

**Exact excerpt to mirror:**
```typescript
export const newContactInput = z.object({
  companyId: z.number().int().positive().optional(),
  name: z.string().min(1),
  roleTitle: z.string().min(1).optional(),
  channel: z.string().min(1).optional(),
  notes: z.string().optional(),
  email: z.string().email().optional(),
  linkedinUrl: z.string().url().optional(),
  relationshipType: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
});
export type NewContactInput = z.infer<typeof newContactInput>;

export const newConversationInput = z.object({
  contactId: z.number().int().positive(),
  applicationId: z.number().int().positive().optional(),
  occurredAt: z.date(),
  channel: z.string().min(1).optional(),
  notes: z.string().optional(),
});
export type NewConversationInput = z.infer<typeof newConversationInput>;
```

**Critical constraint (Common Pitfall #4, security V5):** `newOutreachInput` must **NOT** include `source` or `sourceMessageId` fields — compare against `newStatusEventInput` (lines 73-80), which DOES accept `sourceMessageId` because it's the ingestion write path; `newOutreachInput` is exclusively the *manual* write path this phase, so the Server Action hardcodes both fields itself (see actions.ts pattern below). The `postingUrlSchema` pattern (lines 45-50, http/https-only refine) is the model for any future URL-field validation, not needed here since outreach carries no URL field directly.

**Target shape** (per RESEARCH's confirmed proposal, validated against real `newContactInput`/`newConversationInput` conventions above):
```typescript
export const OUTREACH_CHANNELS = ["LinkedIn", "Email"] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

const newOutreachRecipientInput = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  linkedinUrl: z.string().url().optional(),
});

export const newOutreachInput = z
  .object({
    contactId: z.number().int().positive().optional(),
    recipient: newOutreachRecipientInput.optional(),
    companyName: z.string().min(1),
    channel: z.enum(OUTREACH_CHANNELS),
    purpose: z.string().min(1),
    subject: z.string().optional(),
    body: z.string().min(1),
    sentDate: z.date(),
    responded: z.boolean().optional(),
    outcome: z.string().optional(),
    // Deliberately NO `source` / `sourceMessageId` — see Common Pitfall #4.
  })
  .refine((v) => v.contactId !== undefined || v.recipient !== undefined, {
    message: "Either an existing contactId or new recipient fields are required",
  });
export type NewOutreachInput = z.infer<typeof newOutreachInput>;
```

---

### `src/domain/outreach.ts` (NEW) — service, CRUD

**Analog:** `src/domain/contacts.ts` (full file read — `createContact` lines 21-30, `addConversation` lines 60-69, `getConversationsForApplication` lines 126-142, `listContactsWithOutreach`'s reduce lines 221-266)

**Imports pattern** (`contacts.ts` lines 1-14):
```typescript
import { asc, eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { companies, contactApplications, contacts, conversations } from "@/db/schema";
import {
  newContactInput,
  newConversationInput,
  type NewContactInput,
  type NewConversationInput,
} from "@/db/validation";
```

**Create pattern** (`createContact`, lines 21-30 — validate-then-insert-then-return-id):
```typescript
export function createContact(db: NodeSQLiteDatabase, input: NewContactInput): number {
  const validated = newContactInput.parse(input);
  const result = db.insert(contacts).values(validated).run();
  return Number(result.lastInsertRowid);
}
```

**Joined list-read pattern** (`getConversationsForApplication`, lines 126-142 — join to contact name for display):
```typescript
export function getConversationsForApplication(db: NodeSQLiteDatabase, applicationId: number) {
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

**Reduce-not-groupBy aggregation pattern** (`listContactsWithOutreach`, lines 221-266 — the exact shape `getOutreachCountsByContact` must follow, NEVER `GROUP BY` per RC-pinned drizzle-orm):
```typescript
const convRows = db
  .select({ contactId: conversations.contactId, occurredAt: conversations.occurredAt })
  .from(conversations)
  .all();

const agg = new Map<number, { latest: Date; count: number }>();
for (const row of convRows) {
  const cur = agg.get(row.contactId);
  if (!cur) {
    agg.set(row.contactId, { latest: row.occurredAt, count: 1 });
  } else {
    cur.count += 1;
    if (row.occurredAt.getTime() > cur.latest.getTime()) cur.latest = row.occurredAt;
  }
}
```
For `getOutreachCountsByContact`, this simplifies to a flat `Map<number, number>` count (no `latest` needed) — select only `contactId` from `outreachMessages`, reduce with `counts.set(row.contactId, (counts.get(row.contactId) ?? 0) + 1)`.

**`listOutreach` with optional contact filter** — mirror the `contactId`-scoped `where` conditional already used elsewhere in this file (`getApplicationsForContact`, lines 75-84) plus the two-table inner join style from `getConversationsForApplication` above, joining `outreachMessages` → `contacts` (for `contactName`) and → `companies` (for `companyName`).

---

### `src/domain/contacts.ts` — EXTEND `listContactsWithOutreach` with `outreachCount`

**Exact target function** (lines 221-266, current shape shown in full above under domain/outreach.ts). Add a call to `getOutreachCountsByContact(db)` from the new `outreach.ts` module (cross-module function-call convention — this file already imports `companies` from `@/db/schema` directly, and `src/app/actions.ts` already imports functions from three different `@/domain/*` modules, so importing `getOutreachCountsByContact` from `@/domain/outreach` here is the established pattern per RESEARCH Open Question 1). Extend the `ContactOutreachRow` interface (lines 210-219) with an `outreachCount: number` field, and the final `.map()` (lines 258-265) to include it, mirroring the existing `touchpoints: a?.count ?? 0` line exactly.

---

### `src/app/actions.ts` — add `logOutreachAction` (controller/Server Action, request-response)

**Analog A — company resolution** (`addApplicationAction`, lines 91-124, specifically lines 106-107):
```typescript
const companyId =
  resolveCompany(db, companyName) ?? createCompany(db, companyName);
```

**Analog B — validation gate + revalidate shape** (`quickSaveAction`, lines 72-83):
```typescript
export async function quickSaveAction(input: unknown): Promise<ActionResult> {
  const parsed = quickSaveApplicationInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  const savedStage = requireSavedStage();
  const id = quickSaveApplication(db, savedStage.id, parsed.data);

  revalidatePath("/"); // board + KPI row both read from "/"
  return { ok: true, id };
}
```

**Analog C — new-contact creation from a Server Action** (`logContactAction`, `src/app/job/[id]/actions.ts` lines 34-49):
```typescript
export async function logContactAction(
  applicationId: number,
  companyId: number,
  input: unknown,
): Promise<ActionResult> {
  const parsed = newContactInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  const contactId = createContact(db, { ...parsed.data, companyId });
  linkContactToApplication(db, contactId, applicationId);

  revalidatePath(`/job/${applicationId}`);
  return { ok: true, contactId };
}
```

**`VALIDATION_ERROR` constant** (line 42-43) — reuse verbatim, do not invent a new string:
```typescript
const VALIDATION_ERROR =
  "Couldn't save this change. Check the fields below and try again.";
```

**Composed target for `logOutreachAction`** (combines A + B + C, hardcodes `source`/`sourceMessageId` per Common Pitfall #4):
```typescript
export async function logOutreachAction(input: unknown): Promise<ActionResult> {
  const parsed = newOutreachInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: VALIDATION_ERROR };
  }
  const { companyName, contactId, recipient, ...rest } = parsed.data;

  const companyId =
    resolveCompany(db, companyName) ?? createCompany(db, companyName);

  const resolvedContactId =
    contactId ?? createContact(db, { companyId, ...recipient! });

  const id = createOutreach(db, {
    ...rest,
    companyId,
    contactId: resolvedContactId,
    source: "manual",      // never accepted from client input
    sourceMessageId: null,
  });

  revalidatePath("/outreach");
  revalidatePath("/contacts"); // badge count changes too
  return { ok: true, id };
}
```
Add `import { newOutreachInput } from "@/db/validation";` and `import { createOutreach } from "@/domain/outreach";` to this file's existing import block (lines 1-24), and `createContact` from `@/domain/contacts` (not currently imported here — currently only `src/app/job/[id]/actions.ts` imports it).

---

### `src/app/outreach/page.tsx` (NEW) — route/controller, request-response

**Analog:** `src/app/contacts/page.tsx` (full file, 63 lines) — mirror the try/catch → null → error-copy → empty-state → populated-table structure exactly:
```typescript
import { db } from "@/db/client";
import { listContactsWithOutreach, type ContactOutreachRow } from "@/domain/contacts";
import { ContactsTable } from "@/components/contacts-table";

function readContacts(): ContactOutreachRow[] | null {
  try {
    return listContactsWithOutreach(db);
  } catch (error) {
    console.error("Failed to load Contact Database:", error);
    return null;
  }
}

export default function ContactsPage() {
  const contacts = readContacts();

  if (contacts === null) {
    return (
      <main className="flex flex-col gap-6 p-8">
        <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">Contact Database</h1>
        <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
          Couldn&apos;t load this page. Refresh to try again.
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">Contact Database</h1>
        <p className="text-[14px] text-muted-foreground">…</p>
      </div>

      {contacts.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border bg-card p-8">
          <p className="text-[20px] leading-[1.2] font-semibold text-foreground">No contacts yet</p>
          <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">…</p>
        </div>
      ) : (
        <ContactsTable contacts={contacts} />
      )}
    </main>
  );
}
```

For `/outreach/page.tsx`: swap `listContactsWithOutreach` → `listOutreach(db, { contactId: parsedContactId })`, add the `async` + `searchParams: Promise<{ contactId?: string }>` signature (Next.js 15 App Router convention, per RESEARCH Code Examples), swap copy per UI-SPEC Copywriting Contract ("No outreach logged yet" / "Couldn't load outreach. Refresh to try again."), and render `<OutreachTable rows={rows} />` in place of `<ContactsTable>`. Add the deep-link "Filtered by {contact name} ✕" dismissible chip above the table per UI-SPEC Surface 1 when `contactId` is present.

---

### `src/app/outreach/loading.tsx` (NEW) — route

**Analog:** `src/app/board/loading.tsx` (full file, 23 lines):
```typescript
import { PipelineBoardSkeleton } from "@/components/pipeline-board";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="flex flex-col gap-6 p-8">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16 rounded-lg" />
        ))}
      </div>
      <PipelineBoardSkeleton />
    </main>
  );
}
```
For `/outreach/loading.tsx`: drop the 4-KPI-card grid (Outreach has no KPI row), keep the `<Skeleton className="h-8 w-32" />` page-title placeholder, replace `<PipelineBoardSkeleton />` with a plain table-shaped skeleton (a handful of `<Skeleton className="h-10 w-full rounded-md" />` rows inside the same `rounded-xl border border-border bg-card` wrapper `application-table.tsx` uses) — there is no existing `*TableSkeleton` component in this repo to import verbatim, so this one small skeleton block should be written inline in `loading.tsx` itself, matching the `Skeleton` primitive's existing usage convention.

---

### `src/components/outreach-table.tsx` (NEW) — component, request-response

**Analog:** `src/components/application-table.tsx` (full file, 283 lines) — mirror **exactly**, per UI-SPEC Surface 1 and RESEARCH Don't Hand-Roll.

**`"use client"` + imports header** (lines 1-10):
```typescript
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
```

**Avatar color-hash helper** (lines 33-46) — reuse verbatim, same `AVATAR_COLORS` array and `avatarColor()` function, for the Recipient cell's avatar chip:
```typescript
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
}
```

**`formatDate` helper** (lines 48-55) — reuse verbatim.

**Sort/filter state + `useMemo`** (lines 79-143) — same `useState<SortKey>`/`useState<SortDir>`/`useState(query)`/`useState(stageFilter)` shape, same `toggleSort` click-to-flip-direction function (lines 84-91), same `filtered`→`sort` two-stage `useMemo` (lines 96-143). For Outreach: `SortKey = "company" | "channel" | "sentDate" | "responded"`, default `sortKey="sentDate"` / `sortDir="desc"` (matches D-13's "recency" default and `application-table.tsx`'s own `dateApplied` desc default), filters = search input + Channel `<select>` + Responded `<select>` (two selects instead of one, otherwise identical DOM/class structure to lines 147-170).

**Table shell classes** (lines 172-204) — reuse verbatim: `overflow-x-auto rounded-xl border border-border bg-card`, header row `border-b border-border`, `th` classes `px-4 py-3 text-[12px] font-medium tracking-wide text-muted-foreground uppercase whitespace-nowrap`, sort button `inline-flex items-center gap-1 hover:text-foreground` with `ArrowUp`/`ArrowDown`/`ChevronsUpDown size-3` icons.

**Row + cell classes** (lines 210-274) — reuse verbatim: row `border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40`, cell `px-4 py-3`, truncating text cell `<span className="truncate" title={...}>`, trailing right-aligned action cell `px-4 py-3 text-right whitespace-nowrap` with a `Button variant="ghost" size="sm"` (was "Change stage", becomes "View" per UI-SPEC).

**Deviation from analog (per UI-SPEC Surface 4 Direction A / Common Pitfall #5):** the Recipient cell is **plain text**, not a `<Link>` — `application-table.tsx`'s Company cell links to `/job/${app.id}` because that route exists; `/contacts/[id]` does NOT exist, so do not wrap the Recipient avatar+name in a `Link`.

---

### `src/components/outreach-log-form.tsx` (NEW, Dialog) — component, request-response

**Analog:** `src/components/contact-conversation-form.tsx` (full file, 417 lines) — mirror structure, trim the new-contact sub-form fields per UI-SPEC Surface 2.

**`"use client"` + imports header** (lines 1-25):
```typescript
"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { logContactAction, logConversationAction } from "@/app/job/[id]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
```
For outreach: swap the actions import to `import { logOutreachAction } from "@/app/actions";`, add `import { Checkbox } from "@/components/ui/checkbox";` (new shadcn primitive) for the "Responded" field.

**"pick existing or add new" sentinel + Select pattern** (lines 51-52, 198-224) — reuse `NEW_CONTACT_VALUE` sentinel verbatim:
```typescript
const NEW_CONTACT_VALUE = "__new__";
// ...
<Select value={values.contactSelection} onValueChange={(value) => setValues((prev) => ({ ...prev, contactSelection: value }))}>
  <SelectTrigger id="..." className="w-full"><SelectValue placeholder="Select a contact" /></SelectTrigger>
  <SelectContent>
    <SelectItem value={NEW_CONTACT_VALUE}>+ New contact</SelectItem>
    {existingContacts.map((contact) => (
      <SelectItem key={contact.contactId} value={String(contact.contactId)} className="whitespace-normal">
        {contact.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**Progressive-disclosure conditional block pattern** (lines 102, 227-347 — `isNewContact && (<>...</>)`) — reuse this exact conditional-render shape for: (1) the trimmed new-contact sub-form (Name/Email/LinkedIn only — UI-SPEC explicitly says omit Role/Relationship/Source/Channel, unlike this analog's full 6-field block at lines 229-345), (2) the "Other" free-text purpose input, (3) the Outcome field shown only when Responded is checked.

**`canSubmit` gating pattern** (lines 103-107):
```typescript
const isNewContact = values.contactSelection === NEW_CONTACT_VALUE;
const canSubmit =
  values.occurredAt.trim().length > 0 &&
  (isNewContact ? values.name.trim().length > 0 : values.contactSelection.length > 0);
```

**Submit handler with try/catch/toast pattern** (lines 109-174) — reuse verbatim shape, single `startTransition` wrapping the Server Action call(s), typed `{ ok: false, error }` branch → `setError` + `toast.error`, untyped throw → generic catch → `"Something went wrong. Try again."`.

**Date-input-to-UTC-midnight conversion** (lines 143-147) — reuse verbatim for `sentDate`:
```typescript
const occurredAt = new Date(`${values.occurredAt}T00:00:00.000Z`);
```

**Dialog shell + error/footer classes** (lines 176-185, 397-411) — reuse verbatim: `DialogContent className="max-h-[90vh] overflow-y-auto"`, error text `text-[14px] leading-[1.5] font-normal text-destructive`, submit button `bg-primary text-primary-foreground hover:bg-primary/90` with `disabled={!canSubmit || isPending}`.

---

### `src/components/outreach-view-dialog.tsx` (NEW, read-only Dialog) — component, request-response

**Analog:** No exact props-only read-dialog precedent exists in-repo; nearest is `contact-conversation-form.tsx`'s Dialog shell (structure only, not its form/mutation logic). Build as a plain `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` wrapper taking the already-loaded `OutreachRow` as a prop (no fetch — UI-SPEC Surface 3), reusing the `max-h-[90vh] overflow-y-auto` sizing convention and the pill components (`StagePill`-equivalent — see Shared Patterns below) from the table. Body rendered with `whitespace-pre-wrap` inside the scrollable content, escaped JSX only — same stored-XSS note as `ContactConversationForm`'s Notes field (no `dangerouslySetInnerHTML`).

---

### `src/components/contacts-table.tsx` — EXTEND with "Outreach" column

**Exact target: extend the existing Touchpoints badge column** (lines 91-95):
```typescript
<td className="px-4 py-3">
  <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-secondary px-2 py-0.5 text-[13px] font-medium text-secondary-foreground">
    {c.touchpoints}
  </span>
</td>
```
Add a new `<th>` to `HEADERS` (line 31-39, after "Touchpoints") and a matching `<td>` after this one, using `c.outreachCount` (new field on `ContactOutreachRow` from the `contacts.ts` extension above). Per UI-SPEC Surface 4 Direction B: wrap in `<Link href={`/outreach?contactId=${c.id}`}>` when count > 0, plain `text-muted-foreground` "—" when 0 — this is the one place this table diverges from the plain-badge Touchpoints precedent (Touchpoints has no click-through; Outreach does).

---

### `src/components/nav-shell.tsx` — EXTEND `NAV_ITEMS`

**Exact target array** (lines 29-36):
```typescript
const NAV_ITEMS: Array<{ href: string; label: string; match: (p: string) => boolean }> = [
  { href: "/", label: "Today", match: (p) => p === "/" },
  { href: "/board", label: "Pipeline", match: (p) => p.startsWith("/board") },
  { href: "/analytics", label: "Analytics", match: (p) => p.startsWith("/analytics") },
  { href: "/contacts", label: "Contact Database", match: (p) => p.startsWith("/contacts") },
  { href: "/review", label: "Review", match: (p) => p.startsWith("/review") },
  { href: "/dead-letter", label: "Dead-letter", match: (p) => p.startsWith("/dead-letter") },
];
```
Insert `{ href: "/outreach", label: "Outreach", match: (p) => p.startsWith("/outreach") }` immediately after the `/contacts` entry (per UI-SPEC Surface 1: "positioned after 'Contact Database' ... and before 'Review'"). No other change to this file — active-state styling (line 95-100, `bg-primary/10 text-primary`) is generic over all `NAV_ITEMS` entries already.

---

### `src/demo/seed/seed.ts` + `src/demo/seed/companies.ts` — EXTEND with outreach fixtures

**Analog: existing per-fixture replay loop** (`seed.ts` lines 47-89) — the `contacts`/`conversations` replay block (lines 66-88) is the direct shape to add an outreach-fixture replay after:
```typescript
for (const contactFixture of fixture.contacts ?? []) {
  const contactId = createContact(db, {
    companyId, name: contactFixture.name, roleTitle: contactFixture.roleTitle,
    channel: contactFixture.channel, email: contactFixture.email,
    relationshipType: contactFixture.relationshipType, source: contactFixture.source,
  });
  linkContactToApplication(db, contactId, applicationId);

  for (const conversation of contactFixture.conversations ?? []) {
    addConversation(db, {
      contactId, applicationId, occurredAt: conversation.occurredAt,
      channel: conversation.channel, notes: conversation.notes,
    });
  }
}
```
Add an analogous `for (const outreachFixture of fixture.outreach ?? [])` block calling the new `createOutreach(db, { contactId, companyId, ...outreachFixture, source: "manual", sourceMessageId: null })`, importing `createOutreach` from `@/domain/outreach` alongside the existing `@/domain/contacts` import (line 12).

**Fixture interface convention** (`companies.ts` lines 17-52 — `DemoConversationFixture`, `DemoContactFixture`, `DemoCompanyFixture`) — add a `DemoOutreachFixture` interface following the exact same shape convention (all fields typed, optional fields marked `?`, doc comment referencing which decision ID it satisfies), and an optional `outreach?: DemoOutreachFixture[]` field either on `DemoCompanyFixture` (company-level cold outreach) or `DemoContactFixture` (contact-level, matching how `conversations` nests under `contacts` today) — the latter is the closer structural mirror since D-02 requires both a `contactId` and `companyId` per outreach row, same as `conversations`.

**Load-bearing invented-data comment** (`companies.ts` lines 1-15) — new outreach fixture bodies MUST follow this same "every name/company is invented, never real" constraint; reuse the file's opening comment block's framing when adding outreach fixture content.

---

### `tests/db/migrate.test.ts` + `tests/db/schema-parity.test.ts` — EXTEND `EXPECTED_TABLES`

**Both files currently have this exact array** (confirmed via direct read — `migrate.test.ts` lines 6-20, `schema-parity.test.ts` lines 11-25, byte-identical, independently maintained per RESEARCH Pitfall 3):
```typescript
const EXPECTED_TABLES = [
  "role_types", "stages", "sources", "companies", "company_aliases",
  "applications", "status_events", "overrides", "contacts",
  "contact_applications", "conversations", "review_queue", "dead_letter",
];
```
**Confirmed stale independent of this phase** (also missing `ingested_messages` and `sync_runs` from Phases 3/4) — RESEARCH's staleness claim is verified accurate. Add `"outreach_messages"` to both arrays. Do not attempt to fully fix the pre-existing `ingested_messages`/`sync_runs` staleness — out of this phase's scope, but do not make it worse (add only the new entry, in both files, matching each file's own array literally). `migrate.test.ts` line 23's `"creates all 13 expected tables"` docstring number should be bumped in the same edit if the plan chooses to keep it accurate (not required by the test assertion itself, which only checks `toContain`).

---

## Shared Patterns

### Server Action write-path convention
**Source:** `src/app/actions.ts` lines 35-47 (comment block) — every Server Action: `safeParse` → typed `{ ok, error }` or `{ ok, id }` return → domain write (never raw Drizzle from the action file) → `revalidatePath`.
**Apply to:** `logOutreachAction`.
```typescript
export type ActionResult =
  | { ok: true; id?: number }
  | { ok: false; error: string };

const VALIDATION_ERROR =
  "Couldn't save this change. Check the fields below and try again.";
```

### Reduce-not-groupBy aggregation (drizzle-orm pinned at 1.0.0-rc.4)
**Source:** `src/domain/contacts.ts` lines 156-178 (`getLatestConversationDateByApplication`) and 221-266 (`listContactsWithOutreach`).
**Apply to:** `getOutreachCountsByContact` — flat `SELECT`, `Map` reduce in TypeScript, never `GROUP BY`.

### Excel-style client table (search + select filters + click-to-sort)
**Source:** `src/components/application-table.tsx` — full component is the canonical shape.
**Apply to:** `src/components/outreach-table.tsx` (structural clone, per UI-SPEC Surface 1 explicit instruction).

### Dialog shell sizing + error/submit convention
**Source:** `src/components/contact-conversation-form.tsx` lines 176-185, 397-411.
**Apply to:** `outreach-log-form.tsx`, `outreach-view-dialog.tsx`.
```typescript
<DialogContent className="max-h-[90vh] overflow-y-auto">
  ...
  {error && (
    <p className="text-[14px] leading-[1.5] font-normal text-destructive">{error}</p>
  )}
  <DialogFooter>
    <Button type="submit" disabled={!canSubmit || isPending}
      className="bg-primary text-primary-foreground hover:bg-primary/90">
      Save
    </Button>
  </DialogFooter>
```

### Stored-XSS mitigation (free-text fields rendered verbatim)
**Source:** `src/components/contact-conversation-form.tsx` line ~32 comment + Notes `Textarea` (no maxLength, no transformation).
**Apply to:** `outreach-log-form.tsx`'s Body/Outcome fields and `outreach-view-dialog.tsx`'s render — persist verbatim, render only as escaped JSX text (`whitespace-pre-wrap` for line breaks), **never** `dangerouslySetInnerHTML`.

### Company find-or-create resolution
**Source:** `src/app/actions.ts` lines 106-107 (`addApplicationAction`).
**Apply to:** `logOutreachAction`.
```typescript
const companyId =
  resolveCompany(db, companyName) ?? createCompany(db, companyName);
```

## No Analog Found

None — every file this phase touches has a direct, verified in-repo analog. The one component without an *exact* precedent (`outreach-view-dialog.tsx`, a props-only read dialog with no async fetch) still has a strong structural analog in the Dialog shell shared by every other Dialog component in this codebase (`contact-conversation-form.tsx`, `stage-change-dialog.tsx`, `quick-save-dialog.tsx`) — classified above as role-match, not a gap.

## Metadata

**Analog search scope:** `src/db/`, `src/domain/`, `src/app/`, `src/components/`, `src/demo/seed/`, `tests/db/` — all read directly this session (not inferred from RESEARCH.md alone; every excerpt above was re-verified against the live file).
**Files scanned:** `src/db/schema.ts`, `src/db/validation.ts`, `src/app/actions.ts`, `src/app/job/[id]/actions.ts`, `src/domain/contacts.ts`, `src/components/application-table.tsx`, `src/components/contacts-table.tsx`, `src/components/contact-conversation-form.tsx`, `src/components/nav-shell.tsx`, `src/app/contacts/page.tsx`, `src/app/board/loading.tsx`, `src/demo/seed/seed.ts`, `src/demo/seed/companies.ts`, `tests/db/migrate.test.ts`, `tests/db/schema-parity.test.ts`.
**Pattern extraction date:** 2026-08-05
