# Phase 6: Outreach Tracker — Data Model, Manual Logging & Filterable View - Research

**Researched:** 2026-08-05
**Domain:** Additive Drizzle schema/migration on `node:sqlite`, Server Action write path, filterable client table — all within an already-shipped Next.js App Router codebase
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** A new `outreach_messages` table is added via one **additive** Drizzle migration, and it must exist in **both** the real and demo SQLite stores. Fields (final names are the planner's call): recipient contact link, company link, channel, purpose, subject (nullable), body, sent date, responded, outcome. Store body + subject on the outreach row itself (outreach is distinct from the `conversations` table).
- **D-02:** Outreach links to **both** existing tables — `companyId` FK → `companies` (reuse the existing company/alias resolution) **and** `contactId` FK → `contacts` (the recipient resolves to an existing contact or creates a new one). This cross-link is what connects Outreach into the contact graph and powers the separate-but-linked tabs (D-10/D-11).
- **D-03 [forward-compat, important]:** Add a **nullable `sourceMessageId`** (and/or a `source: manual | gmail` discriminator) column now, even though Phase 6 only writes `manual` rows. Phase 7's auto-capture will insert rows from ingested self-forwarded emails and needs this to dedupe (mirrors `ingested_messages` / `status_events.source_message_id`). Designing it in now avoids a second migration in Phase 7.
- **D-04:** `channel` is a fixed enum: **LinkedIn / Email**.
- **D-05:** `purpose` is a **category pick-list with a free-text "Other"** as the last dropdown option (categories enable convert-analysis; free text is the one-off escape hatch). Proposed default categories (refinable): Referral ask · Intro request · Recruiter outreach · Coffee chat · Follow-up · Other.
- **D-06:** `subject` is **optional** (blank for LinkedIn DMs, which have no subject line).
- **D-07:** `sentDate` is **user-entered, defaulting to today** (supports logging past outreach).
- **D-08:** Two fields — `responded` (**boolean**) + `outcome` (**free text**). "Converted" reads primarily off `responded = true`; the free-text `outcome` captures detail (call, referral, ghosted, etc.). **No structured outcome enum this phase** (revisit later if free-text proves too fuzzy to analyze).
- **D-09:** The Outreach list surfaces `responded`/`outcome` so it's visible which messages converted (filter/sort by `responded`).
- **D-10:** A **separate "Outreach" tab** (new `/outreach` route + sidebar link), distinct from the existing "Contact Database" tab. They track different things (cold-outbound effectiveness vs. relationship log).
- **D-11:** **Cross-linked via `contactId`** — an outreach entry shows/links its contact; a contact (Contact Database / detail) can surface its related outreach. Separate data models, connected by the contact FK. (Considered and rejected: merging both into one "Networking" tab.)
- **D-12:** Manual logging via a **form in the Outreach tab**, through a **Server Action + zod validation** (Phase-2 `quickSaveAction` / `ContactConversationForm` pattern). New entries appear in the list immediately. Reuse the "pick existing contact or add new" picker for recipient resolution to keep logging low-friction.
- **D-13:** The Outreach tab **reuses the sortable/filterable table pattern** from the şişe redesign (`application-table.tsx`): search + filters + click-to-sort. Filter/sort by company, channel, recency, and responded.
- **D-14:** Read the full message body by opening an entry (dialog vs inline expand — planner's call). **[Resolved in UI-SPEC: Dialog, not inline expand.]**

### Claude's Discretion

- Exact `purpose` category wording; read-body as dialog vs inline expand; exact form field order and required-vs-optional per field beyond what's stated; how the cross-link surfaces visually (link vs inline chip); precise column set of the Outreach table.
- **Demo seed content** — realistic, portfolio-safe outreach rows MUST be seeded as part of this phase (success criterion 1); the specific fixtures are Claude's discretion (invented names/companies, no real data).

### Deferred Ideas (OUT OF SCOPE)

- **Gmail auto-capture of self-forwarded outreach (OUT-02)** → Phase 7 (already roadmapped). Schema here is designed to be forward-compatible.
- **Structured outcome enum + conversion analytics charts** (e.g., response-rate by purpose/channel) → future; revisit if the free-text `outcome` (D-08) proves too fuzzy to analyze.
- **Merging Outreach + Contact Database into one "Networking" tab** → considered during discussion, rejected in favor of separate + cross-linked (D-10/D-11).

None of these block Phase 6.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OUT-01 | I can manually log a cold outreach message — recipient, company, channel (LinkedIn/email), purpose, subject line, and message body | `newOutreachInput` zod schema + `logOutreachAction` (Architecture Patterns Pattern 2, Code Examples) mirroring `quickSaveAction`/`logContactAction`; `outreach_messages` schema (Pattern 4) |
| OUT-03 | An "Outreach" tab lists all outreach (manual + auto-captured) in a filterable table | `/outreach` route + `listOutreach` domain function + `outreach-table.tsx` mirroring `application-table.tsx` (Architecture Patterns, Recommended Project Structure) |
| OUT-04 | I can filter and sort the outreach list by company, channel, and recency | `outreach-table.tsx` client-side filter/sort state, same `useMemo` pattern as `application-table.tsx` (Architecture Patterns Pattern-adjacent, Don't Hand-Roll) |
| OUT-05 | I can read the full message body of any logged outreach | Read-body Dialog (props-only, no fetch) per UI-SPEC Surface 3 — `listOutreach` already returns the full `body` field (Code Examples) |
| OUT-06 | I can mark whether an outreach got a response / its outcome, so I can see which messaging converts | `responded`/`outcome` columns (Pattern 4), filterable in `outreach-table.tsx`, validated in `newOutreachInput` (Code Examples) |
</phase_requirements>

## Summary

This phase adds exactly one new table (`outreach_messages`), one new domain module (`src/domain/outreach.ts`), one new Server Action (`logOutreachAction`), one new route (`/outreach`), one new shadcn primitive (`checkbox` — zero new npm packages, see Package Legitimacy Audit), and one new cross-link column on the existing Contact Database table. Every pattern this phase needs already exists in the codebase in a directly-mirrorable form: `contacts`/`conversations` for schema shape, `quickSaveAction`/`addApplicationAction` for the Server-Action + company-resolution write path, `ContactConversationForm` for the "pick existing or add new" contact picker + progressive disclosure, `application-table.tsx` for the sortable/filterable client table, `contacts-table.tsx` + `contacts/page.tsx` for the Server Component page → domain read → client table shape, and `listContactsWithOutreach`'s reduce-not-groupBy aggregation for the cross-link count badge. No new library is required; no new pattern needs to be invented.

The one genuinely new mechanic is the **additive migration applied to two independently-tracked SQLite files** (`data/real.sqlite`, which exists and is migrated; `data/demo.sqlite`, which **does not currently exist on disk** and must be created via `DASHBOARD_MODE=demo npm run db:migrate` or `db:seed:demo`, both of which internally call `runMigrations`). Phase 2 (02-02) hit a real, documented failure mode here — a stale `__drizzle_migrations` journal row causing `table already exists` — that the plan should explicitly guard against by checking `PRAGMA table_info(outreach_messages)` post-migration on both files rather than assuming success from exit code alone.

**Primary recommendation:** Add `outreach_messages` to `src/db/schema.ts` mirroring `contacts`/`conversations` column style (plain nullable/notNull text/integer columns, no lookup tables, no DB-level enums — validated entirely in zod per this codebase's established convention), run `npm run db:generate` once, apply via `npm run db:migrate` under both `DASHBOARD_MODE=demo` and `DASHBOARD_MODE=real`, then build `src/domain/outreach.ts` (`createOutreach`, `listOutreach`, `getOutreachCountsByContact`) and `logOutreachAction` as structural clones of the existing contact/conversation write path.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `outreach_messages` schema + migration | Database / Storage | — | New table, additive migration, must apply to both SQLite files (DEMO-02 invariant) |
| Company/contact resolution for a logged outreach | API / Backend (Server Action) | Database | Mirrors `quickSaveAction`'s find-or-create company resolution + `logContactAction`'s new-contact creation; all writes go through `@/domain/*`, never raw SQL from the action |
| `logOutreachAction` zod validation | API / Backend (Server Action) | — | `newOutreachInput` validated in `src/db/validation.ts` before any Drizzle call (V5, this codebase's universal write-path convention) |
| `/outreach` filterable/sortable table | Browser / Client (`"use client"` table component) fed by Frontend Server (SSR page) | — | Server Component (`page.tsx`) does the domain read; the interactive sort/filter/search state lives client-side in `outreach-table.tsx`, exactly like `application-table.tsx`/`ApplicationTable` |
| Cross-link count badge (Contact DB → Outreach) | Frontend Server (SSR) | Database | Computed server-side inside `listContactsWithOutreach`'s existing TS-reduce aggregation — no client-side fetch, no new loading state |
| Deep-link filter (`/outreach?contactId=`) | Frontend Server (SSR route, `searchParams`) | — | Filtering by `contactId` happens in the Server Component's domain-read call, not client-side, so the initial render is already scoped |
| Demo seed rows | Database / Storage (build-time script) | — | `src/demo/seed/seed.ts` `seedDemo()`, same write path as real code (`createOutreach`, not a raw INSERT) |

## Standard Stack

### Core

No new libraries. Every dependency this phase touches is already installed and pinned:

| Library | Installed Version | Purpose | Why Standard (for this codebase) |
|---------|-----|---------|--------------|
| `drizzle-orm` | `1.0.0-rc.4` [VERIFIED: `npm ls drizzle-orm` in this repo] | New `outreachMessages` table definition, schema-driven types | Already the project's sole ORM; pinned RC because stable 0.45.x has no `drizzle-orm/node-sqlite` export (STATE.md decision log) |
| `drizzle-kit` | `1.0.0-rc.4` [VERIFIED: `npm ls drizzle-kit` in this repo] | `npm run db:generate` — produces the new migration folder from the schema diff | Matches the pinned `drizzle-orm` RC exactly; do not let `npm install` silently upgrade this off the RC line |
| `zod` | `4.4.3` [VERIFIED: `npm ls`/package.json in this repo] | `newOutreachInput` schema in `src/db/validation.ts` | Universal write-path validation convention already used by every other `new*Input` schema |
| `node:sqlite` (`DatabaseSync`) | Node built-in (Node ≥ 24, per `package.json` `engines`) | Underlying driver both stores use | Already the project's driver — `better-sqlite3` in CLAUDE.md's stack doc is **stale**; this codebase migrated to `node:sqlite` (see MEMORY.md: "uses node:sqlite (NOT better-sqlite3)") |
| `radix-ui` (unified package) | `1.6.7` [VERIFIED: `npm ls radix-ui`, and `require('radix-ui').Checkbox` resolves to an object] | Underlying primitive for the new `checkbox.tsx` shadcn component | Already installed; the official shadcn `checkbox` registry item's only declared dependency is `radix-ui` [VERIFIED: `npx shadcn@4.16.0 view checkbox` — dependencies: `["radix-ui"]`], which is already satisfied — **no new npm package will be installed** |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sonner` (toast) | `^2.0.7` (installed) | `toast.error(...)` on save failure | Reuse verbatim, same as `ContactConversationForm` |
| `lucide-react` | `^1.27.0` (installed) | `ArrowUp`/`ArrowDown`/`ChevronsUpDown` sort icons | Reuse verbatim from `application-table.tsx` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain `text()` columns for `channel`/`purpose` + zod validation | A `lookup`-style table (like `role_types`/`sources`/`stages`) for `purpose` categories | Lookup tables exist in this codebase specifically for values that need to be *extensible without a migration* (D-05/D-06/D-07 comment in `schema.ts`). `purpose` already has a built-in free-text escape hatch ("Other") per CONTEXT D-05, so a lookup table adds a join + seed-data dependency for no benefit — plain text + zod matches the existing `contacts.relationshipType`/`contacts.source` precedent instead |
| One `outreach_messages` table with `contactId`+`companyId` FKs | A join table like `contact_applications` | Rejected — CONTEXT D-02 explicitly wants both FKs directly on the outreach row (a 1:1 relationship per message, not many-to-many), matching `conversations.contactId`/`conversations.applicationId`'s direct-FK shape, not `contact_applications`'s join-table shape |

**Installation:**
```bash
# No install command needed — every dependency is already in package.json.
# The only CLI action this phase runs against the dependency tree:
npx shadcn add checkbox   # copies src/components/ui/checkbox.tsx; adds no new npm package
```

**Version verification:** Confirmed directly against this repository (not the public registry defaults) via `npm ls drizzle-orm drizzle-kit`, `package.json`, and `npx shadcn@4.16.0 view checkbox` — see citations inline above. `npm view drizzle-kit version` on the public registry returns `0.31.10` (the current *stable* tag) — this is **expected and correct to ignore**; the project deliberately pins the `1.0.0-rc.4` prerelease line for both `drizzle-orm`/`drizzle-kit` together, confirmed actually installed via `npm ls`.

## Package Legitimacy Audit

**No external packages are installed in this phase.** The only new dependency-tree-adjacent action is `npx shadcn add checkbox`, and the official shadcn registry item for `checkbox` declares exactly one dependency — `radix-ui` — which is already present in `package.json` at `^1.6.7` and already exports a `Checkbox` primitive [VERIFIED: `node -e "console.log(typeof require('radix-ui').Checkbox)"` → `"object"`]. Running the CLI will therefore add one new local file (`src/components/ui/checkbox.tsx`) and **will not modify `package.json`**.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — | — | — | — | — | — | No new npm packages this phase |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

The Phase 5 precedent (`recharts`, gated behind a blocking-human package-legitimacy checkpoint per D5-07) does **not** apply here — that gate exists specifically for *new npm dependency installs*, and this phase installs zero. The planner should still note in its plan that `npx shadcn add checkbox` is being run, but does **not** need to insert a `checkpoint:human-verify` before it, since no supply-chain trust decision is being made (no new package enters `package.json`). If the plan wants defense-in-depth anyway, a lightweight non-blocking note (`git diff package.json` shows no changes after the add) is sufficient verification, not a blocking checkpoint.

## Architecture Patterns

### System Architecture Diagram

```
Manual logging form (Dialog, "use client")
  outreach-log-form.tsx
       │  user submits: recipient (existing contactId OR new-contact fields),
       │  companyName, channel, purpose(+other), subject?, body, sentDate,
       │  responded, outcome?
       ▼
logOutreachAction(input)  [Server Action, "use server", src/app/actions.ts]
       │  1. safeParse(newOutreachInput)  — zod gate, mirrors quickSaveAction
       │  2. resolveCompany(db, companyName) ?? createCompany(db, companyName)
       │  3. if new-contact fields present:
       │        createContact(db, { companyId, name, email?, linkedinUrl? })
       │     else: use the supplied existing contactId
       │  4. createOutreach(db, { contactId, companyId, channel, purpose,
       │        subject, body, sentDate, responded, outcome,
       │        source: "manual", sourceMessageId: null })
       ▼
src/domain/outreach.ts → outreach_messages INSERT (Drizzle, validated)
       │
       ▼
revalidatePath("/outreach")  +  revalidatePath("/contacts")  (badge count changes too)
       │
       ▼
┌───────────────────────────────┬───────────────────────────────────┐
│ /outreach  (Server Component)  │ /contacts (Server Component)       │
│  listOutreach(db, {contactId?})│  listContactsWithOutreach(db)      │
│       │                        │   extended with an outreach-count  │
│       ▼                        │   TS-reduce aggregation over       │
│  <OutreachTable/> "use client"  │   outreach_messages (same pattern  │
│   search + Channel/Responded    │   as the existing conversations    │
│   filters + click-to-sort       │   touchpoints reduce)              │
│       │                        │       │                            │
│       ▼                        │       ▼                            │
│  "View" → read-body Dialog      │  "Outreach" count badge → Link to  │
│  (props only, no fetch)         │   /outreach?contactId={id}         │
└───────────────────────────────┴───────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── db/
│   ├── schema.ts          # + outreachMessages table (append after conversations)
│   └── validation.ts      # + newOutreachInput, OUTREACH_CHANNELS, OUTREACH_SOURCES
├── domain/
│   └── outreach.ts        # NEW — createOutreach, listOutreach, getOutreachCountsByContact
│   └── contacts.ts        # EXTEND — listContactsWithOutreach gains outreachCount field
├── app/
│   ├── actions.ts         # + logOutreachAction
│   └── outreach/
│       ├── page.tsx       # NEW — Server Component: reads searchParams.contactId, calls listOutreach
│       └── loading.tsx    # NEW — Skeleton table backstop (mirror board/loading.tsx)
├── components/
│   ├── outreach-table.tsx     # NEW — "use client", mirrors application-table.tsx exactly
│   ├── outreach-log-form.tsx  # NEW — mirrors ContactConversationForm's Dialog/picker/progressive-disclosure
│   ├── outreach-view-dialog.tsx # NEW — read-only "View" dialog, props-only, no fetch (UI-SPEC Surface 3)
│   ├── contacts-table.tsx     # EXTEND — + "Outreach" column, count badge, Link to /outreach?contactId=
│   ├── nav-shell.tsx          # EXTEND — + "Outreach" NAV_ITEMS entry after "Contact Database"
│   └── ui/
│       └── checkbox.tsx       # NEW — `npx shadcn add checkbox`
├── demo/seed/
│   ├── companies.ts        # EXTEND — DemoOutreachFixture[] per company fixture (optional array)
│   └── seed.ts             # EXTEND — replay outreach fixtures via createOutreach in the same loop
```

### Pattern 1: Additive schema + migration applied to both stores

**What:** Add the new table to `src/db/schema.ts`, generate one migration, apply it under both `DASHBOARD_MODE` values.
**When to use:** Any new table or column (this is the *only* mechanism this codebase uses for schema change — no hand-written SQL).
**Example (the exact precedent this phase should follow, from `02-02-PLAN.md`, which added `applications.posting_url`):**
```
# Source: src/db/migrate.ts + src/db/schema.ts (this repo) + 02-02-PLAN.md/02-02-SUMMARY.md
1. Edit src/db/schema.ts — add the new table/column.
2. npm run db:generate          # drizzle-kit generate — writes ./drizzle/<timestamp>_<name>/{migration.sql,snapshot.json}
3. DASHBOARD_MODE=real npm run db:migrate    # applies to data/real.sqlite (already exists)
4. DASHBOARD_MODE=demo npm run db:migrate    # applies to data/demo.sqlite (does NOT exist yet — this creates it)
```
`src/db/migrate.ts`'s CLI entrypoint reads `process.env.DASHBOARD_MODE` via `assertMode` (fail-loud, no default), resolves the path via `resolveDbPath`, and calls the same `runMigrations(db)` function the app, the test helper (`tests/helpers/db.ts`), and the demo seed script (`src/demo/seed/seed.ts`) all share — there is exactly one migration entry point in this codebase.

**⚠ Real precedent of this exact step failing (02-02-SUMMARY.md):** `DASHBOARD_MODE=real npm run db:migrate` failed with `table \`applications\` already exists` because `data/real.sqlite`'s `__drizzle_migrations` journal table had a stale row referencing a renamed/deleted migration folder from an earlier iteration. The fix was inspecting the live schema (`PRAGMA table_info`), confirming it already matched, and manually correcting the stale journal row's `name`/`hash` so only the genuinely-new migration was queued. **The plan should verify the migration applied successfully by querying `PRAGMA table_info('outreach_messages')` on both files after running the migrate step — not by trusting a zero exit code alone.**

**Windows shell note:** This repo runs on Windows/PowerShell per the environment. `DASHBOARD_MODE=real npm run db:migrate` is bash syntax; the project's own `scripts/register-task.ps1` (04-03) uses `cmd.exe /c set DASHBOARD_MODE=real && npx.cmd tsx ...` for the equivalent one-shot env-var-scoped invocation on Windows. If the plan is executed via a bash-compatible tool (as this session's tool environment provides), the `DASHBOARD_MODE=real npm run db:migrate` form works as documented in every prior phase's SUMMARY. Use whichever form matches the actual execution shell; do not assume PowerShell's `$env:DASHBOARD_MODE = "real"; npm run db:migrate` syntax works unless verified.

### Pattern 2: Server Action write path with company + contact resolution

**What:** `"use server"` action that `safeParse`s input, resolves/creates a company, resolves/creates a contact, then calls one domain write function, then `revalidatePath`s.
**When to use:** `logOutreachAction`.
**Example (mirrors `quickSaveAction` + `addApplicationAction` company resolution and `logContactAction`'s new-contact creation, all in this repo):**
```typescript
// Source: src/app/actions.ts (quickSaveAction, lines 72-83) + src/app/job/[id]/actions.ts (logContactAction, lines 34-49)
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
    source: "manual",       // never accepted from client input — see Common Pitfalls
    sourceMessageId: null,
  });

  revalidatePath("/outreach");
  revalidatePath("/contacts"); // badge count changes
  return { ok: true, id };
}
```

### Pattern 3: Reduce-not-groupBy aggregation for the cross-link count badge

**What:** Flat `SELECT` over `outreach_messages`, reduced to a `Map<contactId, count>` in TypeScript.
**When to use:** `getOutreachCountsByContact`, consumed by `listContactsWithOutreach`'s extension.
**Example (directly mirrors the existing conversations-touchpoints aggregation, `src/domain/contacts.ts` lines 221-266):**
```typescript
// Source: src/domain/contacts.ts listContactsWithOutreach (this repo) — same shape, new table
export function getOutreachCountsByContact(
  db: NodeSQLiteDatabase,
): Map<number, number> {
  const rows = db
    .select({ contactId: outreachMessages.contactId })
    .from(outreachMessages)
    .all();

  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(row.contactId, (counts.get(row.contactId) ?? 0) + 1);
  }
  return counts;
}
```
This codebase's `drizzle-orm` is pinned at `1.0.0-rc.4`, a release-candidate whose `GROUP BY`/aggregate SQL surface this project deliberately avoids in every existing domain module (`getLatestConversationDateByApplication`, `listContactsWithOutreach`, `getPipelineSummary`) — do not introduce the first `GROUP BY` in this phase.

### Pattern 4: `sourceMessageId` forward-compat column with a nullable-safe unique index (D-03)

**What:** A nullable `text` column with a `uniqueIndex`, so SQLite's NULL-distinctness lets every Phase-6 manual row (`sourceMessageId = null`) coexist without collision, while Phase 7's ingested rows get real dedup enforcement for free.
**When to use:** The `outreach_messages.sourceMessageId` column.
**Example (exact precedent — `statusEvents.sourceMessageId`, `src/db/schema.ts` lines 113-126):**
```typescript
// Source: src/db/schema.ts (this repo), statusEvents table
export const outreachMessages = sqliteTable(
  "outreach_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contactId: integer("contact_id").notNull().references(() => contacts.id),
    companyId: integer("company_id").notNull().references(() => companies.id),
    channel: text("channel").notNull(),          // "LinkedIn" | "Email" (D-04)
    purpose: text("purpose").notNull(),           // category label or free text (D-05)
    subject: text("subject"),                     // nullable (D-06)
    body: text("body").notNull(),
    sentDate: integer("sent_date", { mode: "timestamp" }).notNull(), // (D-07)
    responded: integer("responded", { mode: "boolean" }).notNull().default(false), // (D-08)
    outcome: text("outcome"),                      // nullable free text (D-08)
    // Forward-compat for Phase 7 (D-03) — nullable now, populated by
    // Gmail auto-capture later. SQLite treats NULLs as distinct, so many
    // manual (null) rows never collide with this unique index.
    sourceMessageId: text("source_message_id"),
    source: text("source").notNull().default("manual"), // "manual" | "gmail" (D-03)
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(defaultTimestampNow),
  },
  (t) => [
    uniqueIndex("outreach_messages_source_message_id_unique").on(t.sourceMessageId),
  ],
);
```

### Anti-Patterns to Avoid
- **Adding a `purpose_categories` lookup table:** unnecessary — the existing free-text-column + zod pattern already used for `contacts.relationshipType`/`contacts.source` covers this, and D-05's "Other" free-text option means the column can never be a closed FK-enforced enum anyway.
- **Letting the client supply `source` or `sourceMessageId`:** `logOutreachAction`'s zod schema (`newOutreachInput`) must not include either field — the server hardcodes `source: "manual"` and `sourceMessageId: null` on every write this phase produces. If the schema accepted these from the client, a malicious or buggy client could self-label a manual row as `"gmail"`-sourced, corrupting Phase 7's future dedup logic.
- **Building a second grouped SQL query for the count badge:** matches Pattern 3 above — never introduce `GROUP BY` given the pinned RC ORM version.
- **Skipping the demo-store migration:** `data/demo.sqlite` does not exist in this repo as of this research pass — running only `DASHBOARD_MODE=real npm run db:migrate` will make the feature work in real mode while silently leaving demo mode broken (`no such table: outreach_messages`) until `db:seed:demo` (which itself calls `runMigrations`) is run.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Company resolution for the logging form | A new fuzzy-match/dedup routine | `resolveCompany`/`createCompany` (`src/domain/companies.ts`) | Already handles normalization + alias lookup (DATA-04); duplicating it risks a second, inconsistent notion of "the same company" |
| Contact "pick existing or add new" UX | A new picker component from scratch | Copy `ContactConversationForm`'s `NEW_CONTACT_VALUE` sentinel + conditional new-contact block pattern | Already solves the exact UX (D-12 explicitly calls this out); the only change is a *trimmed* field set per UI-SPEC Surface 2 (Name/Email/LinkedIn only, no Role/Relationship/Source/Channel) |
| Sortable/filterable table interactivity | A table library (TanStack Table, etc.) | Copy `application-table.tsx`'s `useMemo`-based filter+sort — plain `useState` for query/sortKey/sortDir, `Array.prototype.filter`/`.sort()` | This codebase has zero table-library dependency; introducing one for ~30 demo rows of client-side data is unjustified complexity, and UI-SPEC Surface 1 explicitly says to mirror this exact component |
| Migration SQL | Hand-written `ALTER TABLE` | `npm run db:generate` (drizzle-kit) | Every existing migration in `./drizzle/` was generated, never hand-written — hand-writing risks a snapshot.json drift that later `db:generate` runs can't reconcile |

**Key insight:** This phase has zero genuinely new *engineering* problems — it is a same-shape extension of five already-proven patterns in this exact codebase. The only new risk surface is operational (did the migration actually apply to both files) not architectural.

## Runtime State Inventory

> Included because this phase's schema is explicitly designed for forward-compatibility with a *future* phase (Phase 7 Gmail auto-capture), even though Phase 6 itself is additive-only, not a rename/refactor.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — this is a net-new table with no existing rows to migrate. `data/real.sqlite` (778KB, has application/contact/conversation data) needs the additive migration applied but no data transformation. | Code edit only (schema + migration) |
| Live service config | None — no external service config references outreach data yet (Phase 7's Gmail label integration is out of scope) | None |
| OS-registered state | None — this phase adds no scheduled task, no service registration | None |
| Secrets/env vars | None — no new env var or secret is introduced this phase | None |
| Build artifacts | `data/demo.sqlite` **does not exist yet** on disk (confirmed via `ls data/` — only `real.sqlite` present). It is generated fresh by `db:migrate`/`db:seed:demo`, both gitignored. Not a stale artifact, but the plan must not assume it already exists. | Generate via `DASHBOARD_MODE=demo npm run db:seed:demo` (creates + migrates + seeds in one call) |

## Common Pitfalls

### Pitfall 1: Assuming `data/demo.sqlite` already has the new table because `data/real.sqlite` does
**What goes wrong:** A plan runs the migration once against whichever store happens to be "current" in the developer's `npm run dev` session, verifies the feature manually, and ships — but the *other* store (usually demo, since it's regenerated more casually) silently lacks the table.
**Why it happens:** `db:migrate` requires an explicit `DASHBOARD_MODE=demo|real` per invocation (fail-loud, no default per `assertMode`) — it is easy to run it once and consider the migration "done."
**How to avoid:** Every plan task that touches `schema.ts` must include *both* invocations as separate, explicitly-verified steps (`PRAGMA table_info` check on each file), exactly as `02-02-PLAN.md` did.
**Warning signs:** `/outreach` works in one `DASHBOARD_MODE` and throws `no such table: outreach_messages` in the other.

### Pitfall 2: Stale `__drizzle_migrations` journal entry blocking a clean apply
**What goes wrong:** `npm run db:migrate` fails with `table 'X' already exists` even though the schema change is genuinely new and additive.
**Why it happens:** Confirmed in this exact repo's history (02-02-SUMMARY.md) — a renamed/deleted migration folder left a stale row in `__drizzle_migrations` whose name/hash no longer matches any current folder, causing the migrator to re-queue an already-applied migration alongside the real new one.
**How to avoid:** If migration fails with an "already exists" error, first check whether the live schema (`PRAGMA table_info`) already matches what the "already applied" migration would produce, before assuming data loss risk; correct the stale journal row's `name`/`hash` rather than dropping/recreating tables.
**Warning signs:** `table already exists` error on a migration step that should be purely additive.

### Pitfall 3: Two independently-maintained `EXPECTED_TABLES` lists drifting out of sync
**What goes wrong:** `tests/db/migrate.test.ts` and `tests/db/schema-parity.test.ts` each hard-code their own `EXPECTED_TABLES` array. Both are **already stale** as of this research (neither lists `ingested_messages` or `sync_runs`, added in Phase 3/4) — they only assert `toContain`, so missing entries don't fail the test, but a new `outreach_messages` table added to `schema.ts` without updating these lists means the tests silently fail to verify the new table exists.
**Why it happens:** No single source of truth generates these lists from `schema.ts`'s actual exports.
**How to avoid:** Add `"outreach_messages"` to both `EXPECTED_TABLES` arrays explicitly as part of this phase's task list (do not assume "adding the table is enough" — the existing tests won't catch a missing table on their own since `toContain` only checks presence of *listed* items, not absence of unlisted ones... but a plan that forgets to add the assertion gets no coverage at all for the new table's existence).
**Warning signs:** `npm test` passes green even though nobody actually verified `outreach_messages` exists post-migration.

### Pitfall 4: Client supplying `source`/`sourceMessageId` through the manual form
**What goes wrong:** If `newOutreachInput` (or the form) exposes a `source` field, a manual entry could be mis-tagged as `"gmail"`-sourced, breaking Phase 7's future dedup assumption that every `source: "gmail"` row came from real ingestion.
**Why it happens:** Copy-paste from a schema that *does* need to accept a discriminator (e.g., `parsedEmailResult`) without noticing this one shouldn't.
**How to avoid:** `newOutreachInput` (the zod schema used by `logOutreachAction`) must not include `source` or `sourceMessageId` fields at all; the Server Action hardcodes both.
**Warning signs:** Code review or a Phase 7 test finds a `source = 'gmail'` row with no corresponding `ingested_messages`/Gmail sync provenance.

### Pitfall 5: `/contacts/[id]` doesn't exist — don't create a dead link
**What goes wrong:** The Outreach table's Recipient cell links to a contact detail page that isn't in scope.
**Why it happens:** `application-table.tsx`'s Company cell *does* link (`Link href={/job/${app.id}}`) since `/job/[id]` exists — it's easy to pattern-match that convention onto the Outreach table's Recipient cell without checking whether the equivalent contact route exists.
**How to avoid:** Confirmed via `ls src/app/contacts/` — only `page.tsx` exists, no `[id]` route. UI-SPEC Surface 4 Direction A already resolves this correctly (plain text, not a link). The plan must follow that resolution, not "improve" it by inventing a route.
**Warning signs:** A `<Link href={`/contacts/${contactId}`}>` that 404s.

## Code Examples

### `newOutreachInput` zod schema
```typescript
// Source: src/db/validation.ts (this repo) — pattern extended from newContactInput/newConversationInput
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
    purpose: z.string().min(1), // category label OR free "Other" text (D-05) — UI enforces the list
    subject: z.string().optional(),
    body: z.string().min(1),
    sentDate: z.date(),
    responded: z.boolean().optional(),
    outcome: z.string().optional(),
    // Deliberately NO `source` / `sourceMessageId` field — see Common Pitfalls #4.
  })
  .refine((v) => v.contactId !== undefined || v.recipient !== undefined, {
    message: "Either an existing contactId or new recipient fields are required",
  });
export type NewOutreachInput = z.infer<typeof newOutreachInput>;
```

### `listOutreach` with optional contact-scoped filter (deep-link support)
```typescript
// Source: src/domain/outreach.ts (new) — mirrors getContactSummariesForApplication's join shape
export interface OutreachRow {
  id: number;
  contactId: number;
  contactName: string;
  companyId: number;
  companyName: string;
  channel: string;
  purpose: string;
  subject: string | null;
  body: string;
  sentDate: Date;
  responded: boolean;
  outcome: string | null;
}

export function listOutreach(
  db: NodeSQLiteDatabase,
  opts?: { contactId?: number },
): OutreachRow[] {
  const base = db
    .select({
      id: outreachMessages.id,
      contactId: outreachMessages.contactId,
      contactName: contacts.name,
      companyId: outreachMessages.companyId,
      companyName: companies.canonicalName,
      channel: outreachMessages.channel,
      purpose: outreachMessages.purpose,
      subject: outreachMessages.subject,
      body: outreachMessages.body,
      sentDate: outreachMessages.sentDate,
      responded: outreachMessages.responded,
      outcome: outreachMessages.outcome,
    })
    .from(outreachMessages)
    .innerJoin(contacts, eq(outreachMessages.contactId, contacts.id))
    .innerJoin(companies, eq(outreachMessages.companyId, companies.id));

  const rows = opts?.contactId
    ? base.where(eq(outreachMessages.contactId, opts.contactId)).all()
    : base.all();

  return rows;
}
```

### `/outreach/page.tsx` Server Component (mirrors `contacts/page.tsx` error/empty handling)
```typescript
// Source: src/app/contacts/page.tsx (this repo) — same try/catch → null → error copy convention
export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  const { contactId } = await searchParams;
  const parsedContactId = contactId ? Number(contactId) : undefined;

  const rows = readOutreach(parsedContactId); // try/catch wrapper around listOutreach, returns null on error
  // ...same null → "Couldn't load outreach. Refresh to try again." pattern as contacts/page.tsx
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `better-sqlite3` (per CLAUDE.md's original stack doc) | `node:sqlite` (`DatabaseSync`, Node ≥ 24 built-in) | Phase 1 (predates this research) | CLAUDE.md's "Recommended Stack" table is **stale** on this point — confirmed via `src/db/open-sqlite.ts`'s actual import (`node:sqlite`) and `package.json`'s `engines.node: ">=24"`. Do not install `better-sqlite3` for this phase. |
| `drizzle-orm@0.45.x` (per CLAUDE.md) | `drizzle-orm@1.0.0-rc.4` | Phase 1 (STATE.md decision log) | Confirmed installed; the stable 0.45.x line lacks the `drizzle-orm/node-sqlite` export the project needs |

**Deprecated/outdated:** CLAUDE.md's stack table (better-sqlite3, drizzle-orm 0.45.x) reflects the *initial recommendation* before Phase 1 implementation diverged from it — the actual codebase (and MEMORY.md) is the source of truth for this research, not CLAUDE.md's stack table on these two specific points.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `purpose` should be a plain `text` column (no lookup table, no DB enum) rather than a `sources`/`stages`-style lookup table | Architecture Patterns, Don't Hand-Roll | Low — this is a straightforward inference from D-05's explicit free-text "Other" escape hatch and the existing `contacts.relationshipType`/`contacts.source` precedent, not an external unknown; if the planner disagrees, a lookup table is a mechanical, low-risk alternative that doesn't change any other part of this research |
| A2 | Column names (`contactId`, `companyId`, `sentDate`, `responded`, `outcome`, `source`, `sourceMessageId`) | Architecture Patterns Pattern 4 | Low — CONTEXT.md explicitly states "final names are the planner's call"; these are proposals following existing naming conventions (camelCase in Drizzle, snake_case in SQL), not verified against any external source |
| A3 | `sentDate` stored as `integer(mode: "timestamp")`, notNull, no default (matches `dateApplied`/`occurredAt` convention, not `defaultTimestampNow` since it's always user-supplied) | Architecture Patterns Pattern 4 | Low — mirrors `conversations.occurredAt`'s exact shape (also user-entered, notNull, no DB default); low risk of being wrong given the strong internal precedent |

**None of the above are external/verification-dependent assumptions** — every one is a codebase-internal naming/shape decision explicitly left to the planner by CONTEXT.md's "Claude's Discretion" section, not a claim about an external library, API, or unverified fact. No user confirmation is needed before planning proceeds; these are documented so the planner sees the reasoning trail, not because they carry meaningful risk.

## Open Questions

1. **Should `getOutreachCountsByContact` live in `src/domain/outreach.ts` or be inlined into `src/domain/contacts.ts`'s `listContactsWithOutreach`?**
   - What we know: `listContactsWithOutreach` already imports from `@/db/schema` directly and does its own reduce; the new outreach count needs to join into that same function's output shape (`ContactOutreachRow` gains an `outreachCount` field per UI-SPEC Surface 4).
   - What's unclear: Whether `contacts.ts` should import `outreachMessages` directly (creating a cross-domain-module schema import, which the codebase already does elsewhere — e.g. `contacts.ts` imports `companies`) or whether `outreach.ts` should export the aggregation function and `contacts.ts` should call it.
   - Recommendation: Export `getOutreachCountsByContact` from `src/domain/outreach.ts` (keeps the new table's queries in the new module) and have `listContactsWithOutreach` import and call it — matches this codebase's existing cross-module-function-call convention (e.g., `src/app/actions.ts` imports from three different `@/domain/*` modules) rather than duplicating the query.

2. **Exact `purpose` category set wording.**
   - What we know: CONTEXT D-05 proposes "Referral ask · Intro request · Recruiter outreach · Coffee chat · Follow-up · Other" and explicitly marks the exact wording as Claude's discretion.
   - What's unclear: Nothing blocking — this is confirmed-optional discretion, not a research gap.
   - Recommendation: Use CONTEXT's proposed list verbatim (it's already well-formed and matches the UI-SPEC's pill-color mapping exactly); no further research needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime (`node:sqlite`) | ✓ | Required ≥ 24 per `package.json engines`; not independently re-verified this session (assumed unchanged since Phase 1/4, which both ran successfully in this repo) | — |
| `drizzle-kit` (`db:generate`) | Migration generation | ✓ | `1.0.0-rc.4`, confirmed installed via `npm ls` | — |
| `data/real.sqlite` | Real-mode manual verification | ✓ | Exists, 778KB, has application/contact/conversation data already | — |
| `data/demo.sqlite` | Demo-mode manual verification + screen-share seed | ✗ (does not exist yet) | — | Created on-demand via `DASHBOARD_MODE=demo npm run db:seed:demo` — no external fallback needed, this is expected/normal, not a blocker |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `data/demo.sqlite` — regenerated via the existing `db:seed:demo` script; not a gap, just a step the plan must include explicitly (see Pitfall 1).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `4.1.10` [VERIFIED: `package.json`] |
| Config file | `vitest.config.ts` (repo root) — `environment: "node"`, `@` alias → `./src`, excludes `.claude/worktrees/**` |
| Quick run command | `npx vitest run tests/domain/outreach.test.ts tests/db/validation.test.ts` |
| Full suite command | `npm test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OUT-01 | Manually log outreach — recipient, company, channel, purpose, subject, body all captured | unit (domain) | `npx vitest run tests/domain/outreach.test.ts -t "createOutreach"` | ❌ Wave 0 — new file |
| OUT-01 | `logOutreachAction` resolves/creates company + contact, validates via zod, rejects invalid input | unit (Server Action, via safeParse behavior — actions themselves aren't directly unit-testable without a Next.js test harness, so test the underlying domain + validation functions the action composes) | `npx vitest run tests/db/validation.test.ts -t "newOutreachInput"` | ❌ Wave 0 — extend existing file |
| OUT-03 | `/outreach` lists all outreach rows | unit (domain) | `npx vitest run tests/domain/outreach.test.ts -t "listOutreach"` | ❌ Wave 0 — new file |
| OUT-04 | Filter/sort by company, channel, recency (client-side) | manual-only — this codebase has no existing precedent of unit-testing `application-table.tsx`'s client filter/sort logic in isolation; UAT covers this (D5 precedent: no `*-table.tsx` component has a test file in `tests/`) | — | N/A — no test file expected, matches existing `application-table.tsx`/`contacts-table.tsx` precedent (zero test coverage on the client table components in this repo today) |
| OUT-05 | Read full message body | manual-only (props-only Dialog, no domain logic to unit test beyond `listOutreach` already returning the full `body` field) | — | N/A |
| OUT-06 | `responded`/`outcome` stored and surfaced; filterable by `responded` | unit (domain) | `npx vitest run tests/domain/outreach.test.ts -t "responded"` | ❌ Wave 0 — new file |
| D-01 (migration applies to both stores) | Schema parity between real and demo | unit (db) | `npx vitest run tests/db/schema-parity.test.ts` (extend `EXPECTED_TABLES` with `"outreach_messages"`) | ❌ Wave 0 — extend existing file |
| D-11 (cross-link count) | `getOutreachCountsByContact` correctly aggregates per-contact counts | unit (domain) | `npx vitest run tests/domain/contacts.test.ts -t "outreach"` (extend) or `tests/domain/outreach.test.ts` | ❌ Wave 0 — extend or new |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/domain/outreach.test.ts tests/db/validation.test.ts tests/db/schema-parity.test.ts tests/db/migrate.test.ts`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the two-store migration manual verification (`PRAGMA table_info` on both `data/real.sqlite` and `data/demo.sqlite`)

### Wave 0 Gaps
- [ ] `tests/domain/outreach.test.ts` — new file, covers `createOutreach`/`listOutreach`/`getOutreachCountsByContact` (OUT-01/03/06, D-11)
- [ ] `tests/db/validation.test.ts` — extend with `newOutreachInput` accept/reject cases (mirrors existing `overrideInput` test shape)
- [ ] `tests/db/schema-parity.test.ts` — add `"outreach_messages"` to `EXPECTED_TABLES` (currently stale — also missing `ingested_messages`/`sync_runs` from prior phases; adding just the one new entry is in-scope, the pre-existing staleness is not this phase's responsibility to fully fix but should not be made worse)
- [ ] `tests/db/migrate.test.ts` — add `"outreach_messages"` to its own separate `EXPECTED_TABLES` list + a `PRAGMA table_info` column-shape assertion (nullable `subject`/`outcome`/`source_message_id`, notNull `body`/`sent_date`/`responded`)
- [ ] Framework install: none — Vitest is already fully configured

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Single-user local app, no auth surface touched this phase |
| V3 Session Management | No | No session changes |
| V4 Access Control | No | No new role/permission surface |
| V5 Input Validation | Yes | `newOutreachInput` (zod) at the Server Action boundary — every field validated before reaching Drizzle, matching the codebase's universal write-path convention |
| V6 Cryptography | No | No new secret/credential handling this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS via free-text `body`/`outcome`/`subject` fields | Tampering | Persist verbatim (no sanitization/transformation, matches `conversations.notes`'s established convention), render only as escaped JSX text — **never** `dangerouslySetInnerHTML`. UI-SPEC's read-body Dialog explicitly notes this ("same stored-XSS mitigation note as `ContactConversationForm`'s Notes field") |
| Client spoofing `source: "gmail"` on a manual entry | Tampering | `newOutreachInput` must not accept a `source` or `sourceMessageId` field from the client at all — the Server Action hardcodes both (see Common Pitfalls #4) |
| SQL injection via company/contact name resolution | Tampering | Drizzle's parameterized query builder (never raw string SQL) — same as every existing write path in this codebase |
| `postingUrl`-style scheme injection (e.g. `javascript:` in a form field later rendered as an `href`) | Tampering | Does not apply this phase — no outreach field is rendered as a clickable URL (LinkedIn/email URLs live on the *contact*, not the outreach row, and `contacts.linkedinUrl` already has `z.string().url()` validation from the existing `newContactInput` schema) |

## Sources

### Primary (HIGH confidence — direct codebase inspection this session)
- `src/db/schema.ts`, `src/db/validation.ts`, `src/app/actions.ts`, `src/app/job/[id]/actions.ts`, `src/db/migrate.ts`, `src/db/client.ts`, `src/db/paths.ts`, `src/db/open-sqlite.ts` — full read, this repo
- `src/domain/contacts.ts`, `src/domain/companies.ts` — full read, this repo
- `src/components/contact-conversation-form.tsx`, `src/components/application-table.tsx`, `src/components/contacts-table.tsx`, `src/components/nav-shell.tsx`, `src/components/ui/dialog.tsx` — full read, this repo
- `src/app/contacts/page.tsx`, `src/app/board/loading.tsx` — full read, this repo
- `src/demo/seed/seed.ts`, `src/demo/seed/companies.ts` — full read, this repo
- `tests/helpers/db.ts`, `tests/db/schema-parity.test.ts`, `tests/db/migrate.test.ts`, `tests/db/validation.test.ts`, `tests/domain/contacts.test.ts` — full read, this repo
- `package.json`, `components.json`, `drizzle.config.ts`, `vitest.config.ts` — full read, this repo
- `npm ls drizzle-orm drizzle-kit` — confirms `1.0.0-rc.4` actually installed [VERIFIED: local command output]
- `npx shadcn@4.16.0 view checkbox` — confirms the official registry item's only dependency is `radix-ui` [VERIFIED: local command output]
- `node -e "console.log(typeof require('radix-ui').Checkbox)"` — confirms the primitive is already resolvable [VERIFIED: local command output]
- `ls data/`, `ls drizzle/`, `ls src/app/contacts/`, `ls src/app/outreach/`, `ls src/components/ui/` — confirms `data/demo.sqlite` absence, migration folder format, `/contacts/[id]` absence, `/outreach` route absence, `checkbox.tsx` absence [VERIFIED: local filesystem inspection]
- `.planning/milestones/v1.1-phases/02-manual-capture-core-pipeline-ui/02-02-SUMMARY.md` — the stale-journal-entry migration failure and fix, real precedent [VERIFIED: this repo's own history]
- `.planning/milestones/v1.1-phases/05-analytics-dashboard-completion/05-RESEARCH.md`, `05-02-PLAN.md`, `05-SECURITY.md` — package-legitimacy checkpoint precedent/pattern [VERIFIED: this repo's own history]
- `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, `06-CONTEXT.md`, `06-UI-SPEC.md` — project decisions and locked scope

### Secondary (MEDIUM confidence)
- None this phase — every claim above was directly verifiable against this repository; no external documentation lookup was required since the phase introduces no new library.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version/dependency claim verified directly against this repo's installed packages and lockfile-adjacent state, not inferred from training data
- Architecture: HIGH — every pattern is a direct mirror of existing, working code in this exact codebase (not analogous code from a different project)
- Pitfalls: HIGH — Pitfalls 1, 2, 3, and 5 are all grounded in this repo's own git history (02-02-SUMMARY.md) or direct filesystem inspection (missing demo.sqlite, missing `/contacts/[id]`, stale EXPECTED_TABLES lists), not speculative

**Research date:** 2026-08-05
**Valid until:** 30 days (stable, internally-consistent codebase; no external API/library surface that could drift faster) — re-verify `data/demo.sqlite` existence and `EXPECTED_TABLES` staleness at plan time if significant time has passed since this research, since either could have been touched by an unrelated intervening change.
