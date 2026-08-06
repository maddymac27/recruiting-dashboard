# Architecture Research

**Domain:** Local-first, single-user, email-ingested job-search tracker (ETL + event sourcing + analytics dashboard)
**Researched:** 2026-07-21
**Confidence:** MEDIUM-HIGH (patterns are well-established industry practice — event sourcing, ETL dead-letter queues, entity resolution, Gmail incremental sync — cross-checked across Microsoft/AWS architecture docs, Google's own API reference, and multiple independent engineering write-ups; the *combination* of these patterns into this specific system is this document's original synthesis, not a single canonical reference)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          INGESTION LAYER                             │
├──────────────────────────────────────────────────────────────────────┤
│  ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌────────────────┐  │
│  │ Gmail     │   │ Sync      │   │ Classifier│   │ Extractor       │  │
│  │ Fetcher   │→  │ Cursor    │→  │ (sender/  │→  │ (per-ATS parser │  │
│  │ (query +  │   │ Store     │   │  label →  │   │  + fallback     │  │
│  │  label)   │   │(historyId)│   │  msg type)│   │  heuristics)    │  │
│  └───────────┘   └───────────┘   └───────────┘   └────────┬────────┘  │
│                                                             │          │
│  ┌──────────────────────────────────────────────┐          │          │
│  │  Manual Job-URL Capture (paste → scrape/parse)│──────────┤          │
│  └──────────────────────────────────────────────┘          ▼          │
├──────────────────────────────────────────────────────────────────────┤
│                       RECONCILIATION LAYER                            │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Entity Resolver: block → score → auto-merge / auto-create /   │  │
│  │  route-to-review-queue                                         │  │
│  └───────────────────────────────┬────────────────────────────────┘  │
│                                   │                                   │
│  ┌────────────────────┐   ┌──────▼─────────┐   ┌───────────────────┐ │
│  │ Human Review Queue  │   │ Event Writer   │   │ Dead-Letter Store │ │
│  │ (ambiguous matches, │   │ (append-only,  │   │ (parse/reconcile  │ │
│  │ low-confidence      │   │ idempotent by  │   │ failures, raw     │ │
│  │ extractions)        │   │ message-id)    │   │ payload + reason) │ │
│  └─────────────────────┘   └──────┬─────────┘   └───────────────────┘ │
├─────────────────────────────────────┼─────────────────────────────────┤
│                          PERSISTENCE LAYER (SQLite, single file)      │
├─────────────────────────────────────┼─────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────▼─────┐  ┌──────────┐  ┌───────┐ │
│  │companies │  │applications│ │status_events│ │ contacts │  │raw_   │ │
│  │          │  │(current-   │ │(append-only)│ │          │  │messages│ │
│  │          │  │ state proj)│ │            │  │          │  │(source)│ │
│  └──────────┘  └──────────┘  └────────────┘  └──────────┘  └───────┘ │
├──────────────────────────────────────────────────────────────────────┤
│                          APPLICATION LAYER                            │
│  ┌────────────────────┐  ┌────────────────────┐  ┌─────────────────┐ │
│  │ Data Access /       │  │ Correction API     │  │ Demo Mode       │ │
│  │ Query Service       │  │ (overrides table,  │  │ Switch (data-   │ │
│  │ (projections +      │  │  wins over parser) │  │ source          │ │
│  │  analytics queries) │  │                    │  │ abstraction)    │ │
│  └────────────────────┘  └────────────────────┘  └─────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│                         PRESENTATION LAYER (client-side charts)       │
│  ┌───────────┐  ┌────────────┐  ┌───────────┐  ┌───────────────────┐ │
│  │ Today View│  │ Pipeline   │  │ Job Detail│  │ Analytics/Charts  │ │
│  │(needs-    │  │ Board      │  │ (event    │  │ (funnel, response-│ │
│  │ attention)│  │ (kanban-ish│  │  timeline)│  │ time, source conv)│ │
│  └───────────┘  └────────────┘  └───────────┘  └───────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| Gmail Fetcher | Runs the targeted search query + label query, returns raw message metadata + bodies for new/changed mail only | Gmail API `messages.list`/`get` for cold start; `history.list` for incremental runs |
| Sync Cursor Store | Persists the last successful `historyId` (and a fallback date cursor) per mailbox so re-runs don't reprocess everything | One-row table: `last_history_id`, `last_synced_at`, `last_full_sync_at` |
| Classifier | Decides *what kind* of message this is (ATS confirmation, rejection, interview invite, recruiter thread, calendar invite, noise) before extraction runs | Rule-based: sender domain allowlist (Greenhouse/Workday/Lever/Ashby/Handshake) + label membership + subject/body keyword rules; no ML needed at this volume |
| Extractor | Pulls structured fields (company, role, stage signal, date) out of the classified message body | Per-ATS template parsers (regex/DOM-shape rules keyed on sender domain) + a generic fallback extractor for the label escape-hatch path; every field tagged with a confidence score |
| Entity Resolver | Decides which existing `application` record (if any) this message belongs to, or that it's a new application | Blocking on sender-domain + normalized-company-key + Gmail `threadId`; fuzzy scoring (Jaro-Winkler/Levenshtein) on company name as fallback; thresholds route to auto-merge, auto-create, or review queue |
| Event Writer | Appends one immutable `status_event` row per resolved status-bearing message; never mutates existing rows | Insert-only SQL; idempotency enforced by a unique constraint on `source_message_id` |
| Human Review Queue | Holds anything the pipeline could not confidently resolve or extract: ambiguous entity matches, low-confidence field extractions, unparseable messages | A table + a dedicated UI view; each row shows the raw source, the pipeline's best guess, and one-click accept/reassign/reject actions |
| Dead-Letter Store | Holds messages that threw an error or matched nothing at all — the "we don't even know what this is" bucket, distinct from "resolved but unsure" | Table preserving raw payload + stage-that-failed + error message + timestamp; drives a visible failure banner in the UI |
| Correction/Override Store | Records user-entered corrections to any field so they survive re-sync and re-extraction | `overrides` table keyed by `(application_id, field_name)` storing value + `set_by_user_at`; read path always prefers override over derived/extracted value |
| Current-state Projection | Materializes "where does this application stand right now" from the event log, so the dashboard doesn't replay history on every read | A `applications` table with denormalized `current_stage`, `current_stage_since`, updated by a trigger/recompute step every time an event is appended |
| Demo Mode Switch | Swaps the entire data source (not just a UI flag) so no code path can leak real data into a demo screen-share | Separate SQLite file (`demo.db` vs `prod.db`) selected by an environment/config value at app startup, with a seeded fixture generator script |

## Recommended Project Structure

```
src/
├── ingestion/
│   ├── gmail/
│   │   ├── fetcher.ts          # calls Gmail API, handles historyId + 404 fallback
│   │   ├── cursor.ts           # reads/writes sync cursor state
│   │   └── query-builder.ts    # builds the targeted search query + label query
│   ├── manual-capture/
│   │   └── url-capture.ts      # paste-a-URL path, produces same intermediate shape
│   ├── classify/
│   │   └── classifier.ts       # sender/label/subject → message type
│   ├── extract/
│   │   ├── parsers/            # one file per ATS (greenhouse.ts, workday.ts, lever.ts, ashby.ts, handshake.ts)
│   │   └── fallback.ts         # generic heuristic extractor for label escape-hatch mail
│   └── pipeline.ts             # orchestrates fetch → classify → extract → reconcile → persist per run
├── reconciliation/
│   ├── resolver.ts             # blocking + fuzzy scoring + thresholding
│   ├── normalize.ts            # company-name normalization rules
│   └── review-queue.ts         # CRUD for ambiguous-match / low-confidence rows
├── domain/
│   ├── events.ts                # status_event append + validation
│   ├── projections.ts           # recompute current-state view from event log
│   └── overrides.ts             # correction storage, read-path precedence rules
├── failures/
│   └── dead-letter.ts           # error capture, retry bookkeeping
├── demo/
│   ├── data-source.ts           # abstraction selecting prod.db vs demo.db
│   └── seed/                    # fixture generator, realistic fake events
├── db/
│   ├── schema.sql               # SQLite schema, migrations
│   └── client.ts
├── api/                          # local server routes / IPC handlers consumed by UI
└── ui/
    ├── today/
    ├── pipeline-board/
    ├── job-detail/
    ├── analytics/
    └── review-queue/             # the human-in-the-loop screen — first-class, not an afterthought
```

### Structure Rationale

- **`ingestion/` is separated from `reconciliation/`:** ingestion answers "what does this message say," reconciliation answers "which application does it belong to." Keeping these as separate stages (rather than one big `syncGmail()` function) is what makes idempotent re-runs and dead-letter isolation possible — a failure in reconciliation shouldn't force re-fetching from Gmail.
- **`domain/events.ts` and `domain/projections.ts` are split deliberately:** the event log and the derived view are different write paths with different guarantees (append-only vs recomputable). Mixing them invites the exact "overwritten status field" failure mode the project explicitly rejects.
- **`review-queue/` and `dead-letter.ts` are separate concepts, not one "errors" bucket:** dead-letter = pipeline broke or found nothing to match ("I don't know what this is"); review queue = pipeline has a plausible answer but isn't confident enough to act alone ("I think this is Acme Corp but I'm not sure"). Conflating them produces a queue nobody can triage.
- **`demo/data-source.ts`** is a real abstraction boundary, not a flag scattered through query code — every query goes through one function that resolves to whichever SQLite file is active.

## Architectural Patterns

### Pattern 1: Idempotent Ingestion Keyed on Message ID

**What:** Every unit of ingested work (a Gmail message, a pasted URL) has a stable natural identifier — Gmail's message `id` — that becomes the idempotency key throughout the whole pipeline, not just at the fetch stage.
**When to use:** Any sync that can be safely re-run (daily automatic sync, manual "sync now," recovery after a crash mid-run).
**Trade-offs:** Requires threading the source ID through every downstream table (raw storage, extracted-fields staging, the eventual `status_event` row) so a `UNIQUE` constraint can reject duplicates at write time rather than relying on application logic to remember what it already processed. Slightly more schema plumbing up front; eliminates an entire class of "ran twice, now I have two rejections" bugs.

**Example:**
```typescript
// events.ts
async function appendStatusEvent(msg: ClassifiedMessage) {
  // source_message_id has a UNIQUE constraint in schema.sql
  await db.run(
    `INSERT INTO status_events (application_id, event_type, occurred_at, source_message_id, confidence)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source_message_id) DO NOTHING`,
    [msg.applicationId, msg.eventType, msg.sentDate, msg.gmailMessageId, msg.confidence]
  );
}
```

### Pattern 2: Event Log + Recomputed Projection (Event Sourcing Lite)

**What:** `status_events` is append-only and is the single source of truth for "what happened and when." `applications.current_stage` is a projection — a cache of "what does replaying the events for this application currently say" — recomputed whenever a new event lands for that application, never hand-edited directly by ingestion.
**When to use:** This is the load-bearing pattern for the project's hard requirement that status history is dated transition events, not an overwritten field. It also solves out-of-order arrival: if a rejection email is processed before the confirmation email (label-based backfill, delayed sync, etc.), the projection is recomputed by sorting all events for that application by their *email-sent timestamp*, not by the order they were ingested — so the derived current state is always correct regardless of processing order.
**Trade-offs:** Every event insert should trigger (or lazily invoke on next read) a projection recompute for that one application — cheap at this volume (a handful of events per application, low weekly volume). At larger scale you'd batch or debounce recomputes; not a concern here.

**Example:**
```typescript
// projections.ts
async function recomputeCurrentState(applicationId: string) {
  const events = await db.all(
    `SELECT * FROM status_events WHERE application_id = ? ORDER BY occurred_at ASC`,
    [applicationId]
  );
  // last event by occurred_at (not by insertion order) wins for "current stage"
  const latest = events[events.length - 1];
  await db.run(
    `UPDATE applications SET current_stage = ?, current_stage_since = ? WHERE id = ?`,
    [latest.event_type, latest.occurred_at, applicationId]
  );
}
```

### Pattern 3: Blocking + Fuzzy Score + Confidence Threshold for Entity Resolution

**What:** Incoming messages are matched to an existing `application` in three steps: (1) **block** — cheaply narrow candidates using strong signals (Gmail `threadId` match is near-certain; sender-domain + normalized-company-key is strong; a shared ATS applicant-tracking ID in the body, when present, is strongest of all); (2) **score** — for anything not resolved by an exact strong signal, fuzzy-match the extracted company name (Jaro-Winkler or similar) against normalized company names already in the database; (3) **threshold** — score above a high bar auto-attaches to the existing application, score below a low bar auto-creates a new application, and the ambiguous middle band is written to the review queue with the top 1-3 candidates and their scores shown, for a one-tap human decision.
**When to use:** Every inbound message after classification, before any event is written — this is the step that decides *which record* an event belongs to, which is the hardest problem in the whole system per the project's own framing.
**Trade-offs:** Getting thresholds right takes iteration and will misfire early (a plausible failure mode: two different roles at "Acme Inc" collapsing into one application, or "Acme Corp" vs "Acme, Inc." not matching without normalization). Because correction is cheap (review queue + override store), it's better to bias thresholds toward *more* human review early rather than confident auto-merging that silently corrupts history.

**Example:**
```typescript
// resolver.ts
async function resolveApplication(msg: ClassifiedMessage): Promise<ResolutionResult> {
  // Tier 1: thread ID — near-certain
  const byThread = await findByGmailThreadId(msg.threadId);
  if (byThread) return { applicationId: byThread.id, confidence: 0.99, matchedOn: 'thread_id' };

  // Tier 2: normalized company key + sender domain
  const normalizedCo = normalizeCompanyName(msg.extractedCompany);
  const byDomain = await findByCompanyKeyAndDomain(normalizedCo, msg.senderDomain);
  if (byDomain) return { applicationId: byDomain.id, confidence: 0.9, matchedOn: 'domain_company' };

  // Tier 3: fuzzy company name match against existing applications
  const candidates = await fuzzyMatchCompanyName(normalizedCo);
  const best = candidates[0];
  if (best && best.score > HIGH_THRESHOLD) return { applicationId: best.id, confidence: best.score, matchedOn: 'fuzzy' };
  if (best && best.score > LOW_THRESHOLD) return { needsReview: true, candidates, extracted: msg };

  return { createNew: true, extracted: msg }; // below LOW_THRESHOLD: no plausible existing match
}
```

## Data Flow

### Ingestion Run Flow

```
[Scheduled trigger (daily) or Manual "Sync Now"]
    ↓
[Sync Cursor Store] → read last_history_id
    ↓
[Gmail Fetcher] → history.list(startHistoryId) ──404?──→ [full sync: messages.list w/ date cursor] → re-baseline cursor
    ↓ (new/changed message IDs)
[Fetch full message bodies for new IDs]
    ↓
[Classifier] → message type + confidence
    ↓
[Extractor] → structured fields + per-field confidence
    ↓                                              ↘ (parse threw / classifier found nothing plausible)
[Entity Resolver]                                    [Dead-Letter Store] → surfaced in UI failure banner
    ↓                    ↘ (ambiguous / low-confidence)
[Event Writer]            [Human Review Queue] → user resolves → [Event Writer]
    ↓ (idempotent insert, unique on message_id)
[status_events table]
    ↓ (triggers recompute for this application_id)
[applications current-state projection updated]
    ↓
[Sync Cursor Store] → persist new historyId
```

### Read/Correction Flow

```
[UI: Job Detail view]
    ↓ (reads)
[applications (projection)] + [status_events (history)] + [contacts] ← joined with → [overrides] (wins if present)
    ↓
[UI renders: current stage from projection, full timeline from events, any field shown from override-if-present-else-extracted]

[User edits a field in the UI]
    ↓
[overrides table: INSERT/UPDATE (application_id, field_name, value, set_by_user_at)]
    ↓
[Next re-sync/re-extraction of the same message]
    ↓
[Extractor still computes its guess] → [Resolver/Writer checks overrides table before writing derived value] → override always wins, extracted value is stored alongside but never displayed over it
```

### Key Data Flows

1. **Ingestion → Resolution → Event → Projection:** every inbound signal flows one direction only — raw message data never gets mutated after storage, events are only ever appended, and "current state" is always a read-time or trigger-time derivation from events, never a field ingestion writes directly. This one-directional flow is what prevents the event log and the current-state view from ever disagreeing with each other.
2. **Correction as a persistent override layer, not a patch to extracted data:** corrections live in their own table and are checked at read time (and at write time, so ingestion doesn't fight the user by re-deriving over a correction). This means re-running extraction logic — even a fully rewritten parser — can never silently erase a user's correction, because the correction lives outside the extraction pipeline's write path entirely.
3. **Demo mode as a data-source swap, not a code branch:** the application layer never asks "am I in demo mode, if so fake this value" — instead a single startup-time decision selects which SQLite file every query hits. Real and demo code paths are identical; only the file underneath differs.

## Scaling Considerations

At the described volume (roughly 8 job-related emails/week, single user, local SQLite), there is effectively no scaling concern in the traditional sense. The considerations that do matter at this scale are about the *processing pipeline*, not throughput:

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current volume (~8/wk, single mailbox) | SQLite is more than sufficient; synchronous per-message processing in a single ingestion run is fine; no queueing infrastructure needed — a dead-letter *table*, not a message broker, is the right weight |
| Ramp-up (active search, tens/wk across multiple threads) | Entity resolution accuracy matters more than speed — invest in getting blocking/fuzzy thresholds right and keeping the review queue easy to triage, since volume growth means more ambiguous matches, not more load |
| If ever multi-mailbox or shared/team use | Would require re-introducing auth/tenancy (explicitly out of scope) and moving off a single local SQLite file — not a near-term concern per the project's stated scope |

### Scaling Priorities

1. **First likely friction point:** review-queue backlog, not database performance — if entity-resolution thresholds are miscalibrated, the human review queue becomes a chore rather than an occasional check-in, recreating the original "requires discipline" failure mode. Tuning thresholds and making the review UI fast (one keystroke to accept the top suggestion) matters more than any database optimization.
2. **Second likely friction point:** ATS parser drift — Greenhouse/Workday/Lever/Ashby occasionally change email templates. The dead-letter queue is the detection mechanism for this; treat a sudden spike in dead-lettered messages from one sender domain as a signal a parser needs updating, not as a queue to clear and ignore.

## Anti-Patterns

### Anti-Pattern 1: Overwriting a "status" column in place

**What people do:** Add a `status` field to the application record and `UPDATE` it every time a new email implies a stage change.
**Why it's wrong:** Destroys the history needed for response-time/time-in-stage analytics (an explicit project requirement), and makes out-of-order email processing actively dangerous — an update can silently regress or corrupt the current view with no record that anything was overwritten, and no way to recover the prior state.
**Do this instead:** Append an immutable event row per status-bearing message; derive "current status" as a projection computed from the full event history, ordered by the event's real-world timestamp.

### Anti-Pattern 2: Treating "resolved but low-confidence" the same as "totally unparseable"

**What people do:** One generic `errors` or `failed_items` table for anything the pipeline couldn't fully handle.
**Why it's wrong:** A message the resolver is 60% sure belongs to "Acme Corp" needs a completely different UI (confirm/reassign a specific guess) than a message the classifier has no idea what to do with (show raw content, let the user manually route it). Merging them into one queue produces a triage list where the user can't tell at a glance which items need a 1-second confirm vs. a full manual read.
**Do this instead:** Two distinct stores — a human review queue for ambiguous-but-plausible matches/extractions, and a dead-letter store for genuine failures — each with its own UI treatment.

### Anti-Pattern 3: Letting ingestion re-derive over user corrections

**What people do:** Store corrections by just updating the same field the extractor writes to, with no marker that a human touched it.
**Why it's wrong:** The very next sync (or a parser bugfix that reprocesses old messages) silently overwrites the user's correction with the parser's original (wrong) guess — exactly the "clobber on re-sync" failure the project explicitly calls out as critical.
**Do this instead:** Corrections live in a separate `overrides` table checked with precedence over derived values at both read time and at ingestion write time, so ingestion logic never needs to know or care whether a human already fixed this field — it just never wins the argument once an override exists.

### Anti-Pattern 4: Trusting Gmail's `historyId` forever without a fallback path

**What people do:** Assume `startHistoryId` will always work and only handle the happy path.
**Why it's wrong:** `historyId` validity is only guaranteed for about a week (Google's own docs say it can be shorter in rare cases) and history records expire around 30 days; a stale ID returns a 404, and an app with no fallback either crashes the whole daily sync or, worse, silently stops syncing — which is the exact silent-failure outcome this project's reliability constraint forbids.
**Do this instead:** Always catch the 404 from `history.list` and fall back to a full re-sync (bounded by a date cursor, e.g., "list everything since 60 days ago" filtered through the same idempotent message-ID insert logic), then re-baseline the stored `historyId`.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Gmail API | OAuth2 with `gmail.readonly` scope, Google Cloud project in "testing" mode (per PROJECT.md, avoids app-verification review since it's single-user) | No per-label scope exists — label filtering is application-level only (already documented in PROJECT.md as a known reality, not a gap this research needs to re-flag) |
| ATS sender domains (Greenhouse, Workday, Lever, Ashby, Handshake) | Not an API integration — these are just known sender-domain patterns used by the classifier/extractor, since there's no ATS API access from the applicant side | Extraction is inherently template-fragile; the dead-letter queue is the safety net for template drift, not a stronger integration |
| Pasted job URL (manual capture) | Best-effort scrape/parse (or purely manual field entry if scraping a given site proves unreliable) feeding the same intermediate "classified message" shape as email-derived data, so it flows through the same reconciliation/event pipeline rather than being a separate special case | Keeps this a first-class entry point into the same event-sourced model rather than a bolt-on "manual jobs list" |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Ingestion ↔ Reconciliation | In-process function calls passing a normalized "classified + extracted message" object | No queue/broker needed at this volume; keep the interface as a plain typed object so either side could be tested/swapped independently |
| Reconciliation ↔ Persistence | Direct SQL writes through a thin data-access layer; all writes are inserts (events) or idempotent upserts (projections), never blind updates | Enforces the append-only guarantee at the boundary, not just by convention in calling code |
| Persistence ↔ Presentation | Read-only query layer / local API routes; UI never writes directly to `status_events`, only through the Correction API or the Review Queue resolution action | Keeps "who is allowed to append an event" to exactly two callers: ingestion pipeline and human review-queue resolution |
| Demo Mode ↔ everything else | A single startup-resolved data-source handle threaded through the data-access layer; no other component branches on demo-vs-real | Prevents demo-mode logic from leaking into ingestion/reconciliation code, which must behave identically regardless of which file it's writing to |

## Suggested Build Order

The dependency chain is strict in one direction — nothing above the persistence layer can be meaningfully built or demoed before the schema (events + projection + overrides + dead-letter + review-queue tables) exists, because every other component reads or writes through it.

1. **Schema + Demo Mode scaffolding first.** Define `status_events`, `applications` (projection), `companies`, `contacts`, `overrides`, `dead_letter`, `review_queue`, and the sync-cursor table, plus the data-source abstraction that can point at either a real or a seeded SQLite file. This is the smallest possible foundation and lets every later component be built and demoed against realistic seed data immediately — satisfying the "demo mode present from the first shippable version" requirement without retrofitting.
2. **Manual job-URL capture + Job Detail / Pipeline Board UI, reading from seed data.** This is the smallest vertical slice that delivers real value and proves the schema end-to-end (an application, its event history, its projection) before any email-parsing complexity exists. It also gives a working "add a job" path independent of Gmail, satisfying that requirement in isolation.
3. **Gmail Fetcher + Sync Cursor (cold-start full sync only, no incremental yet).** Wire real ingestion, but keep it simple: one-time or on-demand full fetch of matching mail, written straight into `raw_messages`. Prove OAuth, the targeted query, and the label escape-hatch query work before adding sync-state complexity.
4. **Classifier + Extractor for the highest-volume ATS senders (start with 1-2 platforms, e.g. Greenhouse + Workday), each field tagged with a confidence score.** This is where extraction accuracy work concentrates; ship narrow but correct rather than broad but flaky.
5. **Entity Resolver + Event Writer, feeding the schema from step 1.** This is the hard, central piece — build it once the shape of real extracted data (from step 4) is known, so blocking/fuzzy-matching rules are tuned against real messages rather than guesses.
6. **Human Review Queue UI + Dead-Letter Store UI.** These depend on the resolver/extractor existing (something has to produce ambiguous/failed cases to review), but should ship in the same phase or immediately after — per the project's hard reliability constraint, ingestion must never go live without a visible place for what it couldn't handle.
7. **Correction/Override API wired into the Job Detail UI.** Needs the projection + resolver in place so there's something to correct; this closes the loop the project calls "critical" (user can permanently override the parser).
8. **Incremental sync via `historyId` + scheduled daily trigger + remaining ATS parsers (Lever, Ashby, Handshake) + recruiter-thread fallback extractor.** Layer these in once the core loop (fetch → classify → extract → resolve → event → review) is proven correct on a narrow slice — expanding sender coverage and moving from full-sync-every-time to incremental is a safe, additive change at this point, not a redesign.
9. **Analytics/Dashboard layer (funnel, conversion by source/role/company, response-time and time-in-stage metrics) — client-side charting over the projection + event tables.** This is explicitly the last layer to build: every metric it needs (dated transitions, source, role type, company) only exists because steps 1-8 captured it correctly at ingestion time, which is the project's own stated principle ("a dimension not extracted when the email is parsed can never be charted later").

This order front-loads the two things previous attempts (per PROJECT.md's Context section) actually failed on — capture-without-discipline and status history — and defers the layer (dashboards/analytics) that is comparatively low-risk and well-understood once the data underneath it is trustworthy.

## Sources

- [Method: users.history.list | Gmail | Google for Developers](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)
- [Gmail API Pagination and Sync Without the Hassle | Nylas CLI](https://cli.nylas.com/guides/gmail-api-pagination-sync)
- [Event Sourcing Pattern - Azure Architecture Center | Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)
- [Event Sourcing in Practice: Building an Append-Only Event Store with Projections and Snapshots](https://letsbuildsolutions.com/blog/system-design/event-sourcing-in-practice-building-an-append-only-event-store-with-projections-and-snapshots/)
- [Accelerating entity resolution with automation and human validation — Dataiku](https://www.dataiku.com/stories/blog/accelerating-entity-resolution)
- [Comparative Analysis of Approximate Blocking Techniques for Entity Resolution (VLDB)](http://www.vldb.org/pvldb/vol9/p684-papadakis.pdf)
- [Record linkage — Wikipedia](https://en.wikipedia.org/wiki/Record_linkage)
- [Dead-Letter Pattern: Don't Let Bad Records Kill Your Pipeline](https://medium.com/@francotesei/dead-letter-pattern-dont-let-bad-records-kill-your-pipeline-0db338b09f02)
- [Dead Letter Channel - Enterprise Integration Patterns](https://www.enterpriseintegrationpatterns.com/patterns/messaging/DeadLetterChannel.html)
- `.planning/PROJECT.md` (project constraints, requirements, and prior-attempt context)

---
*Architecture research for: local-first email-ingested job tracking dashboard*
*Researched: 2026-07-21*
