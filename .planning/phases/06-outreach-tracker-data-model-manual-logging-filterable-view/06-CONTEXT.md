# Phase 6: Outreach Tracker — Data Model, Manual Logging & Filterable View - Context

**Gathered:** 2026-08-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the **manual** Outreach tracker as a complete vertical slice: a new `outreach_messages` data model, a logging form, and a filterable "Outreach" tab — so cold outreach can be recorded and "which messaging converts" becomes visible. Covers OUT-01, OUT-03, OUT-04, OUT-05, OUT-06.

**NOT in this phase:** Gmail auto-capture of self-forwarded outreach (OUT-02) — that is Phase 7. This phase's schema must be **forward-compatible** with that ingestion path, but no Gmail code is written here.
</domain>

<decisions>
## Implementation Decisions

### Data Model & Relationships
- **D-01:** A new `outreach_messages` table is added via one **additive** Drizzle migration, and it must exist in **both** the real and demo SQLite stores. Fields (final names are the planner's call): recipient contact link, company link, channel, purpose, subject (nullable), body, sent date, responded, outcome. Store body + subject on the outreach row itself (outreach is distinct from the `conversations` table).
- **D-02:** Outreach links to **both** existing tables — `companyId` FK → `companies` (reuse the existing company/alias resolution) **and** `contactId` FK → `contacts` (the recipient resolves to an existing contact or creates a new one). This cross-link is what connects Outreach into the contact graph and powers the separate-but-linked tabs (D-10/D-11).
- **D-03 [forward-compat, important]:** Add a **nullable `sourceMessageId`** (and/or a `source: manual | gmail` discriminator) column now, even though Phase 6 only writes `manual` rows. Phase 7's auto-capture will insert rows from ingested self-forwarded emails and needs this to dedupe (mirrors `ingested_messages` / `status_events.source_message_id`). Designing it in now avoids a second migration in Phase 7.

### Fields & Structure
- **D-04:** `channel` is a fixed enum: **LinkedIn / Email**.
- **D-05:** `purpose` is a **category pick-list with a free-text "Other"** as the last dropdown option (categories enable convert-analysis; free text is the one-off escape hatch). Proposed default categories (refinable): Referral ask · Intro request · Recruiter outreach · Coffee chat · Follow-up · Other.
- **D-06:** `subject` is **optional** (blank for LinkedIn DMs, which have no subject line).
- **D-07:** `sentDate` is **user-entered, defaulting to today** (supports logging past outreach).

### Outcome Tracking (OUT-06)
- **D-08:** Two fields — `responded` (**boolean**) + `outcome` (**free text**). "Converted" reads primarily off `responded = true`; the free-text `outcome` captures detail (call, referral, ghosted, etc.). **No structured outcome enum this phase** (revisit later if free-text proves too fuzzy to analyze).
- **D-09:** The Outreach list surfaces `responded`/`outcome` so it's visible which messages converted (filter/sort by `responded`).

### Tabs & Navigation
- **D-10:** A **separate "Outreach" tab** (new `/outreach` route + sidebar link), distinct from the existing "Contact Database" tab. They track different things (cold-outbound effectiveness vs. relationship log).
- **D-11:** **Cross-linked via `contactId`** — an outreach entry shows/links its contact; a contact (Contact Database / detail) can surface its related outreach. Separate data models, connected by the contact FK. (Considered and rejected: merging both into one "Networking" tab.)

### Manual Logging & View (OUT-01/03/04/05)
- **D-12:** Manual logging via a **form in the Outreach tab**, through a **Server Action + zod validation** (Phase-2 `quickSaveAction` / `ContactConversationForm` pattern). New entries appear in the list immediately. Reuse the "pick existing contact or add new" picker for recipient resolution to keep logging low-friction.
- **D-13:** The Outreach tab **reuses the sortable/filterable table pattern** from the şişe redesign (`application-table.tsx`): search + filters + click-to-sort. Filter/sort by company, channel, recency, and responded.
- **D-14:** Read the full message body by opening an entry (dialog vs inline expand — planner's call).

### Claude's Discretion
- Exact `purpose` category wording; read-body as dialog vs inline expand; exact form field order and required-vs-optional per field beyond what's stated; how the cross-link surfaces visually (link vs inline chip); precise column set of the Outreach table.
- **Demo seed content** — realistic, portfolio-safe outreach rows MUST be seeded as part of this phase (success criterion 1); the specific fixtures are Claude's discretion (invented names/companies, no real data).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/REQUIREMENTS.md` — v1.1 "Outreach (OUT)" section, specifically **OUT-01, OUT-03, OUT-04, OUT-05, OUT-06** (the locked requirements this phase delivers). Note OUT-02 is Phase 7.
- `.planning/ROADMAP.md` — Phase 6 section (goal + 5 success criteria, incl. the demo/real separation criterion).
- `.planning/PROJECT.md` — Core Value ("stays accurate without me remembering") + Constraints (privacy / local-first / demo-real separation) that gate the new table.

No external ADRs/specs — requirements are fully captured above and in REQUIREMENTS.md.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/schema.ts` — add the `outreach_messages` table here; mirror the `contacts`/`conversations` table style; FK against `companies` and `contacts`.
- `src/db/validation.ts` — add a `newOutreachInput` zod schema (mirrors `newContactInput`/`newConversationInput`).
- `src/app/actions.ts` — Server Action write-path pattern (`quickSaveAction`) incl. find-or-create company resolution; model `logOutreachAction` on it.
- `src/components/contact-conversation-form.tsx` — the "pick existing contact or add new" picker to reuse for recipient (contactId) resolution.
- `src/components/application-table.tsx` — the `"use client"` sortable/filterable table (search + Status filter + click-to-sort) to mirror for the Outreach table.
- `src/components/contacts-table.tsx` + `src/app/contacts/page.tsx` — the Contact Database tab pattern (Server Component page → domain read → client table) to mirror for `/outreach`.
- `src/components/nav-shell.tsx` — add the "Outreach" nav link (NAV_ITEMS array).
- `src/domain/contacts.ts` — contact resolution + list patterns (reduce-not-groupBy); a new `src/domain/outreach.ts` should follow the same shape.
- `src/demo/seed/seed.ts` — add demo outreach seed rows here.
- `src/db/migrate.ts` + `npm run db:generate` (drizzle-kit) — the additive-migration flow; run against real AND demo stores.

### Established Patterns
- **Single DASHBOARD_MODE reader** (`src/db/client.ts`) — only the page/layout resolves the mode; new domain functions receive the resolved `db` handle. Never import the db client from a client component.
- **Server Action + zod validation** write path; **fail-loud** (a failed manual save surfaces an error, never silently drops — core value).
- **TS reduction, never SQL GROUP BY** for any aggregates (drizzle-orm pinned at rc); node:sqlite.
- **MVP mode** — build as a thin end-to-end vertical slice.

### Integration Points
- New `/outreach` route (Server Component page) → new `src/domain/outreach.ts` `listOutreach(db)` → new client `outreach-table.tsx`.
- New `logOutreachAction` (Server Action) → `createOutreach` domain fn → `outreach_messages` insert (+ contact/company resolution).
- `nav-shell.tsx` "Outreach" link.
- Contact detail / Contact Database → surface related outreach via `contactId` (the cross-link).
</code_context>

<specifics>
## Specific Ideas

- The user's own framing: "I can either **manually log** a LinkedIn message, **or email myself** the contents to a Job-search Gmail folder to be **auto-added**." The email-to-folder path is **Phase 7** — but the Phase 6 table must accommodate both manual and (later) ingested rows (hence D-03's nullable `sourceMessageId` / source discriminator).
- Purpose categories are framed for a **job-search networking** context (referral asks, intro requests, recruiter outreach, coffee chats, follow-ups).
- LinkedIn DMs have no subject → subject nullable (D-06).
- Goal of the whole feature: **learn which messaging converts** — so `purpose` + `responded`/`outcome` are the analysis axes, even though richer conversion analytics is deferred.
</specifics>

<deferred>
## Deferred Ideas

- **Gmail auto-capture of self-forwarded outreach (OUT-02)** → Phase 7 (already roadmapped). Schema here is designed to be forward-compatible.
- **Structured outcome enum + conversion analytics charts** (e.g., response-rate by purpose/channel) → future; revisit if the free-text `outcome` (D-08) proves too fuzzy to analyze.
- **Merging Outreach + Contact Database into one "Networking" tab** → considered during discussion, rejected in favor of separate + cross-linked (D-10/D-11).

None of these block Phase 6.
</deferred>

---

*Phase: 6-Outreach Tracker — Data Model, Manual Logging & Filterable View*
*Context gathered: 2026-08-05*
