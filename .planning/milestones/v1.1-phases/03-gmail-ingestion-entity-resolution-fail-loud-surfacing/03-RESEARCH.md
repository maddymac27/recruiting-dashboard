# Phase 3: Gmail Ingestion, Entity Resolution & Fail-Loud Surfacing - Research

**Researched:** 2026-07-29
**Domain:** Gmail API ingestion (OAuth + REST search/fetch), MIME/HTML email parsing, per-sender regex extraction, fail-loud review/dead-letter queues, ingestion-health surfacing
**Confidence:** MEDIUM (Gmail API mechanics and package versions are CITED/VERIFIED; the 3 senders' exact current email templates are LOW confidence and explicitly flagged for execution-time confirmation per D3-02)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D3-01: Regex-only extraction — no LLM fallback (cloud or local).** Per-sender deterministic parsers only. No email content ever leaves the machine. This deliberately overrides the Claude-Haiku-fallback suggestion in CLAUDE.md's stack notes — **do not recommend it anywhere in this phase's plan.**
- **D3-02: Parse 3 known senders first: Handshake, Workday, Ashby.** Research/planning MUST confirm the exact sending domains and current email templates against real messages in the job-search inbox before writing parsers — do not assume domain formats are final.
- **D3-03: The label escape-hatch is the user's existing Gmail label "Job Search"** — reused, not newly created. If nested, its API name may be `Parent/Job Search` — research MUST list labels via the Gmail API and confirm the exact string/ID. Free-form label mail is not structurally parsed; it surfaces in the review queue as a conversation/contact entry (reusing Phase 2 CAP-04: `contact-conversation-form.tsx`, `job/[id]/actions.ts`, `addConversation`/`createContact`). Content is captured verbatim; job-matching is manual by design.
- **D3-06: First sync intentionally backfills the entire existing contents of the "Job Search" label** as a one-time historical import. Plan for large initial review-queue volume (pagination/batching; a review queue that stays usable at high item counts). Query↔label overlap: dedup on message id (DATA-06) so the same message is not double-recorded; the parsed-transition path wins over the conversation-entry path for known senders. After the one-time backfill, steady-state label ingestion only needs newly-tagged mail.
- **D3-04: A known sender whose email fails to parse routes to the dead-letter queue with the raw email visible**, flagged "known sender failed to parse." Fail-loud — never silently downgraded to a note.
- **D3-05: Minimum successful-parse bar = company + status + date.** Role title is optional/fill-later. A real-world event date is required (not defaulted to the email's received time) — preserves DATA-03 out-of-order derivation and future response-time analytics. Anything extracting less than {company, status, date} routes to review (matchable) or dead-letter (parse failure), never auto-recorded.

### Claude's Discretion — DEFAULTS set for the two areas not deep-dived (CONFIRM during planning)

- **Unmatched email** (mail for a company/role never saved): default = route to the review queue as a "confirm & create" item — user approves creating the new application. ⚠️ Confirm during planning.
- **Match confidence** (auto-attach vs. review): default = conservative — only high-confidence matches (exact/aliased company + open application + plausible stage progression) auto-attach; anything ambiguous → review queue. ⚠️ Confirm during planning.
- **Ingestion health (REL-03) + REL-04 visibility:** default = dashboard indicator (last-sync status/time + review/dead-letter counts) plus a persistent, non-dismissible note that targeted sender-domain search can miss unlisted senders (REL-04 as a visible open risk, not solved). Exact UI already locked in 03-UI-SPEC.md.
- **CAP-03 override persistence:** wire the sync/re-parse write path to respect the existing Phase 1 overrides table (read-time precedence, DATA-07) so a re-sync/re-parse never clobbers a manual correction. Mechanism already exists — this is integration, not new design. **Research finding: this integration is NOT yet done anywhere in the codebase — see Pitfall 1 below.**

### Deferred Ideas (OUT OF SCOPE)

- LLM extraction fallback (cloud Claude Haiku or local Ollama) — declined for v1 on privacy/effort grounds. Revisit only if manual review/dead-letter triage becomes burdensome as volume grows.
- Daily automatic sync + missed-run catch-up (ING-05) and sync-cursor-expiry full-resync fallback (ING-07) — Phase 4, explicitly out of scope here.
- Additional ATS senders beyond the first 3 (Greenhouse, Lever, iCIMS, etc.) — future/v2 INGB-01; this phase proves the pipeline on 3.
- UI polish backlog (Phase 999.1) — unrelated to ingestion.

None of the above were dropped — all captured for their proper phase/milestone.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ING-01 | OAuth setup, no weekly re-auth | Consent screen must be **Production**-published (already done per CONTEXT canonical_refs); refresh token then has no fixed expiry. See OAuth section. |
| ING-02 | Targeted Gmail search for ATS sender domains | `users.messages.list` `q` param with `from:` OR-grouping + `after:` — see Gmail Query section. |
| ING-03 | Designated label captures recruiter/LinkedIn mail | `users.labels.list` to resolve "Job Search" label id/nested name; `labelIds` filter on `messages.list`. |
| ING-04 | Reliably parse 2–3 senders; rest routes visibly | Per-sender regex parsers (Handshake/Workday/Ashby) + Don't-Hand-Roll section; D3-05 minimum-bar gate. |
| ING-06 | Manual sync trigger | Server Action pattern (matches existing `src/app/actions.ts` mutation-tier convention) — see Architecture Patterns. |
| REL-01 | Low-confidence matches → review queue | Existing `review_queue` schema stub extended with a type discriminator — see Data Model section. |
| REL-02 | Unparseable mail → dead-letter queue, never dropped | Existing `dead_letter` schema stub extended with status/type — see Data Model section. |
| REL-03 | Ingestion health at a glance | New `sync_runs`/`sync_state` table (does not yet exist) — see Data Model section. |
| REL-04 | Visible silent-recall-gap risk | Static UI copy (already locked in UI-SPEC) — no ingestion logic; documented as an accepted, unsolved risk. |
| CAP-03 | Corrections persist across syncs | `getMergedField`/`setOverride` already exist (Phase 1) but are **not called by any current read path** — see Pitfall 1 (critical). |
</phase_requirements>

## Summary

This phase adds one new I/O boundary (Gmail) to an otherwise-complete event-sourced domain layer. The good news: almost all of the hard architectural decisions were already made in Phase 1 — `appendStatusEventTx` (never overwrite a status column), the overrides table with read-time-only precedence, and message-id idempotency via a unique index are all in place and battle-tested by Phase 1/2's test suite. The `review_queue` and `dead_letter` tables even already exist as structural stubs (D-15) with **no write path yet** — this phase is what turns them on.

The real work is: (1) a one-time OAuth loopback flow using `googleapis`/`google-auth-library`, storing a refresh token as a local file alongside the existing `.secrets/` OAuth client credentials (never in the demo-toggleable SQLite file); (2) a Gmail fetch pipeline — `users.messages.list` (targeted `from:` query, OR'd across 3 sender domains, plus a separate/combined `labelIds` pass for "Job Search") → `users.messages.get?format=raw` → `mailparser.simpleParser` → `html-to-text` → per-sender regex; (3) extending the existing `review_queue`/`dead_letter` schema stubs with the columns needed to actually discriminate and display the three review-item types and two dead-letter types the UI-SPEC requires; (4) a **new** `sync_runs` (or similar) table for REL-03, since nothing like it exists yet; and (5) — critically — wiring `getMergedField` into the application read path for the first time, since research confirms **no code anywhere currently calls it** despite the override write path (`setOverride`) existing since Phase 1.

**Primary recommendation:** Build the pipeline as a single Server Action (`syncGmailAction`) that: resolves the OAuth client from the stored refresh token → runs the sender-query pass first (writes transitions/review/dead-letter, recording every message id in a dedup ledger) → then runs the label-backfill pass filtering out already-seen message ids → updates the `sync_runs` row → revalidates the sidebar/queues. Gate the entire feature (button visibility, OAuth token read) to `DASHBOARD_MODE=real` only — demo mode must never attempt a Gmail connection (DEMO-02).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OAuth token exchange & refresh | API/Backend (Server Action) | Local file (`.secrets/`) | Google's OAuth client secret and refresh token must never reach the browser bundle; `server-only` already enforces this pattern for the DB client and must extend to the Gmail client. |
| Gmail search/fetch (`messages.list`/`.get`) | API/Backend | — | Requires the OAuth access token; server-only by definition (googleapis calls need Node `fetch`/https, not browser-safe). |
| MIME/HTML parsing + regex extraction | API/Backend | — | Pure Node computation on server-fetched raw bytes; no reason to ever cross to the client. |
| Entity resolution (company match, application match) | API/Backend | Database | Reuses existing `resolveCompany`/alias-table logic (Phase 1); confidence scoring is new logic living beside it. |
| Review queue / dead-letter writes | Database | API/Backend | Existing schema stubs (`review_queue`, `dead_letter`) — this phase adds the write path, not new tables from scratch. |
| Review queue / dead-letter UI (tables, dialogs) | Browser/Client (Server Component read + Client Component actions) | — | Matches Phase 2's board/timeline precedent: Server Component fetches, Client Component handles interaction, Server Action mutates. |
| Ingestion-health sidebar (last sync, counts) | Browser/Client | Database (`sync_runs`) | Read-only display of a new small table; same nav-shell pattern as Phase 2's KPI row. |
| CAP-03 override merge | Database (read-time) | API/Backend | `getMergedField` must be called wherever an application's overridable fields are displayed — this is a read-path gap this phase must close, not new design. |

## Package Legitimacy Audit

| Package | Registry | Age (latest publish) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|----------------------|-----------|--------------|---------|-------------|
| `googleapis` | npm | published 2026-05-28 (~2 mo) | 9.8M/wk | github.com/googleapis/google-api-nodejs-client | OK | Approved |
| `google-auth-library` | npm | published 2026-07-23 (~6 days) | 68.4M/wk | github.com/googleapis/google-cloud-node | SUS (`too-new`) | Flagged — see note below |
| `mailparser` | npm | published 2026-07-05 (~3 wks) | 4.1M/wk | github.com/nodemailer/mailparser | SUS (`too-new`) | Flagged — see note below |
| `html-to-text` | npm | published 2026-04-30 (~3 mo) | 13.2M/wk | github.com/html-to-text/node-html-to-text | OK | Approved |
| `gmail-parser` (considered, rejected) | npm | 2017 (abandoned) | 26/wk | github.com/RyunDoKim/gmail-parser | SUS (`low-downloads`) | **REJECTED** — do not use; official `mailparser` + manual base64url decode covers this need |
| `mailparser-node4` (considered, rejected) | npm | 2017 (deprecated) | 28/wk | github.com/farskipper/mailparser | SUS (`low-downloads`, deprecated) | **REJECTED** |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `google-auth-library`, `mailparser`. Both trip the legitimacy gate's "too-new" heuristic purely because their *most recent patch release* is recent — both have extremely high weekly download counts (68M/wk and 4M/wk respectively) and are maintained under well-known official orgs (`googleapis`, `nodemailer`). This reads as a routine-patch false-positive rather than a genuine slopsquat/hallucination signal, but per protocol the planner **must still insert a `checkpoint:human-verify` task** before `npm install`ing either, confirming the package name and publisher on npmjs.com match exactly (`google-auth-library` by `googleapis`, `mailparser` by `nodemailer`/Andris Reinman) before installing.

*Package names were discovered via WebSearch/training knowledge in this session and are tagged `[ASSUMED]` for identity even where the registry check returned OK — gate every install behind human verification of the exact package name.*

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `googleapis` | 173.0.0 `[VERIFIED: npm registry]` | Gmail REST client (`gmail.readonly`) | Already the project's declared stack choice (CLAUDE.md); official, Google-maintained, bundles `google-auth-library` wiring. |
| `google-auth-library` | 10.9.1 `[ASSUMED — SUS: too-new, needs human-verify checkpoint]` | OAuth2Client, token refresh | Handles the authorization-code exchange and silent access-token refresh; ships as a `googleapis` dependency, but pin/verify explicitly since the sync code imports `OAuth2Client` directly. |
| `mailparser` | 3.9.14 `[ASSUMED — SUS: too-new, needs human-verify checkpoint]` | Raw MIME → structured `{subject, from, date, html, text}` | `simpleParser()` is a one-call turnkey parse of the base64url-decoded raw message Gmail returns with `format=raw` `[CITED: npmjs.com/package/mailparser]`. |
| `html-to-text` | 10.0.0 `[VERIFIED: npm registry]` | ATS HTML body → clean plain text | ATS emails are near-universally HTML-only; converting before regex avoids matching against tag soup `[CITED: npmjs.com/package/html-to-text]`. |
| `zod` | 4.4.3 (already installed) | Runtime validation of parsed-email output before any DB write | Matches existing project convention (`src/db/validation.ts`) — extend, don't replace. |
| `drizzle-kit` | 1.0.0-rc.4 (already installed) | Migration generation for new/extended tables | Matches project's pinned `drizzle-orm` 1.0.0-rc.4 (already bumped off 0.45.x per STATE.md history for `node:sqlite` support). |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node built-in `Buffer` | Node 24 (project engine) | Decode Gmail's base64url `raw` field before handing to `mailparser` | `Buffer.from(raw, "base64url")` — Node's base64url encoding support handles Gmail's `-`/`_` alphabet directly; no extra dependency needed. |
| Node built-in `fs`/`node:fs` | Node 24 | Read/write the local refresh-token file in `.secrets/` | Matches the project's existing "flat file in gitignored `.secrets/`" pattern for the OAuth client credentials — no new secrets-management dependency needed for a single-user local tool. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `mailparser` + `html-to-text` + regex | `gmail-parser` (npm) | **Rejected** — abandoned since 2017, 26 weekly downloads, thin wrapper that doesn't add anything `mailparser` + manual base64url decode doesn't already do. |
| Local refresh-token file in `.secrets/` | A new `credentials`/`gmail_tokens` DB table | A DB table would be simpler to query from a Server Action already holding `db`, but it commingles a long-lived OAuth secret with the SQLite file that demo-mode toggling exists specifically to keep separate from real data (DEMO-02). Keeping the token in `.secrets/` (already gitignored, already holds the client id/secret) keeps "things that must never leak" in one place. |
| Regex-only parsing (D3-01, locked) | Claude Haiku extraction fallback | **Declined by user decision D3-01** — do not revisit; documented here only to record that CLAUDE.md's stack recommendation was deliberately overridden. |

**Installation:**
```bash
npm install googleapis mailparser html-to-text
```
(`google-auth-library` and `zod` are transitive/already-present; `@types/mailparser` may be needed if TypeScript strict mode flags missing types — check after install, `mailparser` ships its own `.d.ts` as of the verified version.)

**Version verification:** confirmed via `npm view <pkg> version` on 2026-07-29:
- `googleapis` → `173.0.0`
- `google-auth-library` → `10.9.1`
- `mailparser` → `3.9.14`
- `html-to-text` → `10.0.0`

## Architecture Patterns

### System Architecture Diagram

```
[Sync now button, sidebar]
        |
        v
[syncGmailAction (Server Action)]
        |
        |--(1)--> [OAuth2Client, refreshed from .secrets/gmail-token.json]
        |               |
        |               v
        |        [Gmail API: users.labels.list]  --resolve "Job Search" label id (one-time cache)
        |               |
        |--(2)--> [Gmail API: users.messages.list  q="from:...notifications.joinhandshake.com OR from:...@ashbyhq.com OR from:...@myworkday.com after:<lastSync>"]
        |               |
        |               v (paged via pageToken)
        |        [message id list, sender-query pass]
        |               |
        v               v
[for each id: users.messages.get?format=raw]
        |
        v
[Buffer.from(raw, "base64url") -> mailparser.simpleParser -> html-to-text]
        |
        v
[per-sender regex dispatch: match From-domain -> Handshake | Workday | Ashby parser]
        |
        +--success (company+status+date >= D3-05 bar)--> [resolveCompany/match application]
        |                                                        |
        |                                              high-conf?--yes--> [appendStatusEventTx] --> dedup ledger: outcome=transition
        |                                                        |
        |                                                       no/ambiguous --> [review_queue insert, type=low_confidence_match] --> ledger: outcome=review
        |
        +--no application match at all--> [review_queue insert, type=unmatched_confirm_create] --> ledger: outcome=review
        |
        +--known sender, extraction failed D3-05 bar--> [dead_letter insert, type=known_sender_failed, raw email attached] --> ledger: outcome=dead_letter
        |
        +--unknown sender (shouldn't happen on query-pass; happens on label-pass)--> [dead_letter insert, type=unparseable]

[after sender-query pass completes]
        |
        v
[Gmail API: users.messages.list  labelIds=[<Job Search label id>]  (first run: no after: filter = full historical backfill per D3-06; later runs: after:<lastSync>)]
        |
        v (paged via pageToken)
        |
        v
[for each id NOT already in dedup ledger]
        |
        v
[users.messages.get?format=raw -> parse -> route to review_queue, type=label_mail, raw text captured verbatim] --> ledger: outcome=review
        |
        v
[update sync_runs row: finishedAt, status, newCount, reviewCount]
        |
        v
[revalidatePath("/"), revalidatePath("/review"), revalidatePath("/dead-letter")]
```

### Recommended Project Structure
```
src/
├── gmail/                     # new — all Gmail-API-touching code, server-only
│   ├── oauth.ts               # OAuth2Client construction, token file read/write, refresh
│   ├── client.ts               # thin wrapper around googleapis gmail('v1') instance
│   ├── query.ts                # builds the from:/after: q string and resolves the label id
│   ├── fetch.ts                 # messages.list pagination + messages.get(format=raw) + base64url decode
│   └── parsers/
│       ├── index.ts             # dispatches by From-domain to the right per-sender parser
│       ├── handshake.ts
│       ├── workday.ts
│       └── ashby.ts
├── domain/
│   ├── ingestion.ts             # NEW — orchestrates one sync run: dedup ledger, routing decisions, D3-05 gate
│   ├── review-queue.ts          # NEW — insert/list/resolve functions for review_queue
│   └── dead-letter.ts           # NEW — insert/list/resolve functions for dead_letter
├── app/
│   ├── actions.ts                # extend with syncGmailAction, connectGmailAction (OAuth redirect trigger)
│   ├── api/
│   │   └── auth/
│   │       └── google/
│   │           └── callback/
│   │               └── route.ts  # NEW — OAuth redirect callback (Route Handler, not Server Action — needs a GET URL for Google to redirect to)
│   ├── review/
│   │   └── page.tsx              # NEW — review queue table
│   └── dead-letter/
│       └── page.tsx              # NEW — dead-letter queue table
```

### Pattern 1: OAuth loopback flow with a Route Handler callback

**What:** Google's OAuth2 "Desktop app" client type redirects to a URI you control after consent. In a Next.js app already running a local server, the simplest approach is a Route Handler (`/api/auth/google/callback`) that Google redirects to with a `?code=...` query param, which the handler exchanges for tokens and writes to the local token file.

**When to use:** The one-time "Connect Gmail" flow (UI-SPEC Surface 5).

**Example:**
```typescript
// Source: pattern synthesized from google-auth-library README (googleapis/google-auth-library-nodejs)
// [CITED: github.com/googleapis/google-auth-library-nodejs]
import { OAuth2Client } from "google-auth-library";

const oauth2Client = new OAuth2Client({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  redirectUri: "http://localhost:3000/api/auth/google/callback",
});

// Step 1 (button click) — generate consent URL:
const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline", // required to receive a refresh_token
  scope: ["https://www.googleapis.com/auth/gmail.readonly"],
  prompt: "consent", // forces refresh_token re-issue even on re-auth
});

// Step 2 (callback route) — exchange the code:
const { tokens } = await oauth2Client.getToken(codeFromQueryParam);
// tokens.refresh_token is ONLY present on first consent — persist it immediately
```
`[CITED: github.com/googleapis/google-auth-library-nodejs — README documents access_type/offline + refresh_token behavior]`

### Pattern 2: Silent token refresh via the `tokens` event

**What:** `google-auth-library`'s `OAuth2Client` automatically refreshes an expired access token using the stored refresh token on the next API call. Listening to the `tokens` event lets the app re-persist a rotated token if Google ever issues a new one.

**Example:**
```typescript
// [CITED: WebSearch summary of googleapis/google-auth-library-nodejs docs]
oauth2Client.on("tokens", (tokens) => {
  if (tokens.refresh_token) {
    writeTokenFile({ ...readTokenFile(), refresh_token: tokens.refresh_token });
  }
  // access_token/expiry_date are not persisted — re-derived from refresh_token each run
});
oauth2Client.setCredentials({ refresh_token: readTokenFile().refresh_token });
```

### Pattern 3: Dedup ledger gating query-pass vs. label-pass (D3-06)

**What:** A single lookup table keyed on Gmail message id, written by BOTH ingestion passes, checked before either pass processes a message.

**When to use:** Every sync run — this is what makes the "parsed-transition path wins over conversation-entry path for known senders" rule (D3-06) mechanical rather than a runtime race.

```typescript
// domain/ingestion.ts — sketch, not final
export function isAlreadyIngested(db, messageId: string): boolean {
  return db.select().from(ingestedMessages)
    .where(eq(ingestedMessages.messageId, messageId)).get() !== undefined;
}

export function recordIngested(db, messageId: string, outcome: IngestOutcome, applicationId?: number) {
  db.insert(ingestedMessages).values({ messageId, outcome, applicationId }).run();
}

// sync orchestration:
// 1. run sender-query pass fully (writes ingestedMessages rows as it goes)
// 2. run label-backfill pass, calling isAlreadyIngested() per message id BEFORE fetching/parsing it
//    (skip the messages.get call entirely for already-seen ids — saves quota too)
```

### Pattern 4: format=raw fetch + decode

```typescript
// [CITED: developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get]
const res = await gmail.users.messages.get({ userId: "me", id: messageId, format: "raw" });
const raw = Buffer.from(res.data.raw!, "base64url").toString("utf-8");
const parsed = await simpleParser(raw); // mailparser
const plainText = parsed.html ? convert(parsed.html) : parsed.text; // html-to-text's convert()
```

### Anti-Patterns to Avoid
- **Writing a numeric parsed status directly to `applications.currentStageId`:** Never do this — every status change, including ingested ones, must go through `appendStatusEventTx` (existing D-09 rule, unchanged by this phase).
- **Checking overrides at ingestion/write time:** Do not add an override-read check inside the sync/parse write path. Per existing `overrides.ts` design, ingestion never consults overrides — only the read path (`getMergedField`) does. Adding a read-check at write time would duplicate logic and risk drifting from the single-source-of-truth read-time merge.
- **Treating `messages.list` results as containing message content:** The list endpoint returns IDs only (confirmed via Gmail docs) — a `messages.get` call is required per message; do not attempt to read subject/sender directly off list results.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Raw MIME parsing (headers, multipart, encoding) | A custom regex-based email splitter | `mailparser`'s `simpleParser()` | MIME multipart/encoded-word/charset handling is notoriously easy to get subtly wrong; `mailparser` is the standard, actively-maintained Node solution (4M+ weekly downloads). |
| HTML → text conversion | Stripping tags with regex | `html-to-text` | Regex-stripping HTML mangles tables/lists/links that ATS templates commonly use for status details; `html-to-text` handles block-level structure correctly. |
| OAuth token refresh scheduling | A manual `setInterval`/expiry-check loop | `google-auth-library`'s built-in auto-refresh (`OAuth2Client` refreshes transparently on the next API call when the access token is stale) | This is exactly the kind of "OS/library already solves this" case CLAUDE.md's cron guidance calls out — don't reinvent expiry math. |
| Company/application entity matching | Fuzzy string matching (Levenshtein) on sender/subject text | Existing `resolveCompany` (canonical name + alias table, Phase 1) | Already built, already tested; extend the alias table with new company names discovered during ingestion rather than adding a second matching algorithm. |
| Cross-message idempotency | Ad hoc "have I seen this message id" checks scattered per insert path | A single `ingested_messages` ledger table (new, this phase) with a unique constraint on `message_id`, checked once before either ingestion pass touches a message | Centralizes D3-06's dedup/precedence rule in one place instead of three separate uniqueness checks across `status_events`, `review_queue`, `dead_letter`. |

**Key insight:** This phase's temptation is to treat "email parsing" as the hard problem needing a clever/AI solution. The actual hard problem — already solved by the existing D-15 schema stubs and D-09/DATA-07 conventions — is **routing discipline**: every message must land in exactly one of {transition, review, dead-letter}, exactly once, with the query-pass and label-pass never fighting over the same message. Get the ledger right and the regex parsers are the easy part.

## Runtime State Inventory

> This phase is additive (new tables, new external integration), not a rename/refactor — Runtime State Inventory is not applicable. Omitted per the trigger condition (rename/refactor/migration phases only).

## Common Pitfalls

### Pitfall 1: CAP-03 override merge is not wired into any read path (CRITICAL — verified by code inspection)
**What goes wrong:** The plan assumes CAP-03 "just needs the sync path to not clobber overrides" (per CONTEXT's framing: "Mechanism already exists — this is integration, not new design"). Research confirms the write-side half is true (`appendStatusEventTx`/`updateApplication` never touch `overrides`), but the **read-side half does not exist**: `getApplicationDetail` (`src/domain/applications.ts`) and the board query (`src/domain/board.ts`) both read raw `applications`/`companies`/`stages` columns directly — neither calls `getMergedField`. A user's manual correction via `setOverride` is stored correctly but is **never displayed** anywhere in the app today.
**Why it happens:** Phase 1 built the override write path and the merge function as forward-looking infrastructure (D-11) but had no ingestion source to conflict with yet, so no read path needed the merge — CAP-03's checkbox in REQUIREMENTS.md is correctly still unchecked.
**How to avoid:** This phase's plan MUST include a task wiring `getMergedField` into `getApplicationDetail` (at minimum) for the `OVERRIDABLE_FIELDS` set (`company`, `role_title`, `role_type`, `source`, `date_applied`, `current_stage`) — otherwise CAP-03 remains unverifiable even after ingestion ships, since there will be no visible proof a re-sync didn't clobber a correction.
**Warning signs:** A UAT check for CAP-03 ("correct a field, re-sync, confirm it stuck") will pass at the DB layer but fail visually if this wiring is skipped — the detail page will show the parser's re-derived value, not the override.

### Pitfall 2: SQLite no-nested-transaction limit, extended to the new ingestion write path
**What goes wrong:** `appendStatusEventTx`/`recomputeCurrentStage` are deliberately non-transaction-owning so callers can compose them inside one outer `db.transaction`. A naive ingestion loop that calls `appendStatusEvent` (the transaction-owning public wrapper) once per message, or opens its own transaction per review-queue insert while already inside an outer sync transaction, will hit `node:sqlite`'s no-nested-transaction error.
**Why it happens:** It's easy to reach for the convenience wrapper (`appendStatusEvent`) instead of the tx-taking primitive (`appendStatusEventTx`) when writing new orchestration code, especially since both exist and only one is safe to call from inside a batch loop.
**How to avoid:** The sync orchestrator should decide upfront whether each message's write is its own transaction (simplest, and fine given this is a background-ish batch job, not a hot path) or whether the whole sync run is one giant transaction (risky for a large D3-06 backfill — a single failure mid-backfill would roll back the entire historical import). **Recommend: one transaction per message**, not one transaction per sync run, precisely because D3-06's first run may process hundreds of historical label messages and a partial-progress-preserving-on-crash design is safer than an all-or-nothing giant transaction.
**Warning signs:** `SqliteError: cannot start a transaction within a transaction` during a batch sync.

### Pitfall 3: Async code inside a `db.transaction` callback
**What goes wrong:** Per the existing code comments in `events.ts`, `node:sqlite`'s driver commits immediately when the transaction callback function *returns* — it does not wait for an in-flight `await` inside an async callback. Any Gmail API call (`await gmail.users.messages.get(...)`) or `await mailparser`'s `simpleParser` accidentally placed inside a `db.transaction((tx) => { ... })` callback will let the commit fire before that async work resolves.
**Why it happens:** This phase is the first one mixing genuinely async I/O (network calls to Gmail) with the existing synchronous transaction pattern; every write function so far (`quickSaveApplication`, `updateApplication`) is fully synchronous inside its transaction.
**How to avoid:** Do ALL async work (Gmail fetch, MIME parse, regex extraction, confidence scoring) **before** entering any `db.transaction` call. The transaction callback should only contain synchronous DB reads/writes on already-computed values — exactly the existing pattern, just make sure the ingestion orchestrator respects the boundary explicitly since it's the first caller with a real reason to blur it.
**Warning signs:** Data appears committed/inconsistent, or a "database is locked"/silent no-op when a transaction callback is `async` and contains an `await`.

### Pitfall 4: Gmail's `messages.list` "q" quirks and metadata-scope limitation
**What goes wrong:** The `gmail.metadata` scope (not used here — this project uses `gmail.readonly`, which is fine) cannot use the `q` parameter at all; more relevantly, GitHub issues on `googleapis/google-api-nodejs-client` (#469, #971) document historical confusion where the `q` parameter appeared "ignored" due to incorrect parameter nesting in the Node client's request shape.
**How to avoid:** Always pass `q` as a top-level parameter to `gmail.users.messages.list({ userId: "me", q: "...", labelIds: [...] })`, and unit/integration-test the exact request against a live account early (Wave 0), not just against mocked responses — request-shape mismatches won't surface from a mock.
**Warning signs:** A sync run returns zero results even though matching mail visibly exists in the inbox.

### Pitfall 5: Workday's sender domain is not a single fixed string
**What goes wrong:** Unlike Handshake (`notifications.joinhandshake.com`) and Ashby (`ashbyhq.com`), which are vendor-controlled domains used consistently across all customers `[CITED: WebSearch — Handshake support docs list notifications.joinhandshake.com as the notification domain; Ashby docs confirm ashbyhq.com/noreply@ashbyhq.com]`, Workday is heavily multi-tenant — different employers' candidate-status emails may come from different subdomains/addresses (one university example found: `uw@myworkday.com`) `[ASSUMED — not verified against this user's actual inbox]`. A parser hard-coded to one exact Workday sender address will silently under-match other Workday-sent mail.
**Why it happens:** Workday doesn't operate one centralized notification domain the way Ashby/Handshake do; each customer's Workday tenant can configure its own sender identity within the `myworkday.com` (or a custom) domain.
**How to avoid:** Per D3-02, this MUST be confirmed against the user's real inbox during planning/execution — search the actual Gmail account for `from:myworkday.com` (broader than an exact address) and inspect 2–3 real examples before finalizing the Workday parser's domain-match rule. Consider matching on `*.myworkday.com` / body-content signals (Workday's HTML footer/branding) rather than one exact address, and route anything from a matched-but-unrecognized Workday subdomain to the "known sender failed to parse" dead-letter bucket rather than silently ignoring it.
**Warning signs:** Real Workday mail appearing to go completely unmatched (not even reaching dead-letter) because the sender-query `q` string's `from:` clause was too narrow to catch it in the first place — this is a query-construction failure, not a parse failure, and won't show up in dead-letter at all. Recommend a **broad interim capture net** (e.g., `from:myworkday.com` in the query) even before the parser is templated, so at minimum unmatched Workday mail reaches dead-letter instead of never being fetched.

### Pitfall 6: Demo mode must never see a Gmail token or trigger a sync
**What goes wrong:** If the "Connect Gmail"/"Sync now" Server Actions don't explicitly check `dashboardMode === "real"`, a demo-mode session could attempt to read the real refresh token file or write review/dead-letter rows into `demo.sqlite`, breaking DEMO-02's structural separation guarantee.
**How to avoid:** Gate both actions (and ideally the sidebar's button rendering itself) on `dashboardMode` from `@/db/client` — in demo mode, render a static/disabled ingestion-health block (or reuse fixed demo seed data for those counts) and never touch `.secrets/gmail-token.json`.
**Warning signs:** A demo screen-share accidentally triggering a real Gmail sync, or a real refresh token ending up referenced from demo-mode code paths.

## Code Examples

### Building the sender-query `q` string
```typescript
// [CITED: developers.google.com/workspace/gmail/api/guides/filtering — supports Gmail search-box syntax incl. OR]
const senderDomains = [
  "notifications.joinhandshake.com", // Handshake — CONFIRM against real inbox (D3-02)
  "ashbyhq.com",                      // Ashby — CONFIRM against real inbox (D3-02)
  "myworkday.com",                    // Workday — BROAD match recommended, see Pitfall 5
];
const q = senderDomains.map((d) => `from:${d}`).join(" OR ") +
  (lastSyncDate ? ` after:${formatYYYYMMDD(lastSyncDate)}` : "");
// e.g. "from:notifications.joinhandshake.com OR from:ashbyhq.com OR from:myworkday.com after:2026/07/01"
```

### Paginating `messages.list`
```typescript
// [CITED: developers.google.com/workspace/gmail/api/guides/list-messages]
let pageToken: string | undefined;
const ids: string[] = [];
do {
  const res = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: 500, // documented max
    pageToken,
  });
  ids.push(...(res.data.messages ?? []).map((m) => m.id!));
  pageToken = res.data.nextPageToken ?? undefined;
} while (pageToken);
```

### Resolving the "Job Search" label id (handles nesting)
```typescript
// [CITED: developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels/list —
// label resource has id + name; nested labels use "Parent/Child" in the name field]
const { data } = await gmail.users.labels.list({ userId: "me" });
const jobSearchLabel = data.labels?.find(
  (l) => l.name === "Job Search" || l.name === "Parent/Job Search" // confirm exact nesting at execution time
);
if (!jobSearchLabel) {
  throw new Error('Gmail label "Job Search" not found — check exact name/nesting'); // fail loud, don't silently skip the label pass
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `--experimental-sqlite` flag required for `node:sqlite` | Stable in recent Node 24.x/26.x releases `[CITED: WebSearch — nodejs.org/api/sqlite.html, multiple 2026 blog sources]` | Node 22.5 introduced behind flag; stabilized progressively through 24.x/26.x | Project's `package.json` already pins `"node": ">=24"` and uses `drizzle-orm/node-sqlite` — no action needed, just confirms the existing choice is sound going into a phase that will do heavier write volume (D3-06 backfill). |
| IMAP polling for Gmail | REST API (`users.messages.list`/`.get`) with OAuth | Long-standing (not new this phase) | Already the project's locked approach per CLAUDE.md "What NOT to Use" — reaffirmed, not revisited. |

**Deprecated/outdated:** None specific to this phase's stack — `googleapis`/`google-auth-library`/`mailparser`/`html-to-text` are all current, actively-maintained majors.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Handshake's notification domain is `notifications.joinhandshake.com` | Standard Stack / Code Examples | If the user's actual confirmation/rejection emails come from a different Handshake subdomain, the sender-query `q` string under-captures — mail silently never enters the fetch pipeline at all (worse than dead-lettering, since it's invisible). Must be confirmed against the real inbox per D3-02 before finalizing. |
| A2 | Ashby's notification domain is `ashbyhq.com` (`noreply@ashbyhq.com`) | Standard Stack / Code Examples | Same failure mode as A1 if the account is actually on Ashby's white-label/custom-domain feature (uncommon but possible for some employers). |
| A3 | Workday sender identity varies per-tenant and cannot be captured with one exact address | Common Pitfalls (Pitfall 5) | If wrong (i.e., if Workday actually is consistent), the recommended "broad `myworkday.com` match" is merely more conservative than necessary — low risk either way, but the parser's domain-match logic should be written expecting variability, not a single fixed sender. |
| A4 | `google-auth-library`'s `tokens` event and `access_type: "offline"` + `prompt: "consent"` combination is the correct way to guarantee a `refresh_token` is issued exactly once and captured | Architecture Patterns 1 & 2 | If Google's current behavior differs subtly (e.g., requires `include_granted_scopes` or a different prompt value), the OAuth flow may complete "successfully" from the user's perspective but never actually persist a refresh token — silently breaking ING-01 the moment the access token first expires. Recommend a Wave 0 manual smoke-test task: run the flow once, restart the process, and confirm a sync still works without a re-consent redirect. |
| A5 | `mailparser`'s `simpleParser` correctly handles Gmail's `format=raw` output when base64url-decoded via `Buffer.from(raw, "base64url")` with no additional Gmail-specific pre-processing | Architecture Patterns 4 | If Gmail's raw export needs a compatibility shim (e.g., line-ending normalization) not covered by a plain base64url decode, parsing could silently drop or mis-decode content on some messages. Low risk (this is the standard, widely-documented approach) but not verified against a real Gmail export in this research session. |
| A6 | Next.js Server Actions have no hard-coded execution timeout in a self-hosted (non-Vercel) deployment (this project runs `next dev`/`next start` locally, not on Vercel) | Architecture Patterns / Environment | If wrong, a large D3-06 historical backfill run synchronously inside one Server Action invocation could be killed mid-run by an unexpected platform-level timeout. Recommend: since this project is explicitly local/self-hosted (not Vercel), this risk is low, but the sync SHOULD still be designed to make incremental progress (per-message transactions, per Pitfall 2) so a hypothetical timeout/interruption loses at most one in-flight message, not the whole backfill. |

## Open Questions (RESOLVED via execution-time human checkpoints: 03-03 Task 3 + 03-06 Task 3)

> All three questions below are inherently unresolvable by research alone (they require sampling the user's real inbox) and are **resolved by design** through the plan's blocking human checkpoints: 03-03 Task 3 (OAuth connect + real-inbox sender-domain/label-ID confirmation) and 03-06 Task 3 (live sync smoke test). Per D3-02, parser regex is deliberately deferred to real-sample confirmation at execution time — not a plan gap.

1. **Exact current subject-line/body templates for Handshake "application submitted", "not selected"/rejection, and interview-status emails** — RESOLVED at execution via 03-03/03-06 real-inbox sampling.
   - What we know: the sending domain (`notifications.joinhandshake.com`) and that the *employer* controls subject/body content within Handshake's template — meaning even "Handshake's format" varies somewhat per employer.
   - What's unclear: exact regex patterns for extracting company/role/status/date reliably across different employers' customizations of the same underlying Handshake template.
   - Recommendation: Wave 0 of the plan should include pulling 3-5 real sample messages from each of the 3 senders (via a throwaway script hitting the real inbox, not committed to git) to hand-write the regex against real examples — this cannot be fully resolved by research alone per D3-02's own instruction.

2. **Exact Workday sender address(es) in this specific user's inbox**
   - What we know: Workday is multi-tenant; domain patterns vary; one public example uses `uw@myworkday.com`.
   - What's unclear: what address(es) this user's actual target companies' Workday instances send from.
   - Recommendation: same Wave 0 real-inbox sampling as above; broaden the `q` query's Workday clause to the bare domain rather than one address until confirmed.

3. **Whether Gmail's "Job Search" label is actually nested (`Parent/Job Search`) or top-level for this specific account**
   - What we know: Gmail supports both; the API represents nesting via `/` in the `name` field.
   - What's unclear: which form applies here — CONTEXT flags this as unconfirmed.
   - Recommendation: first Wave 0 task should call `users.labels.list` against the real account and print all label names/ids before writing any label-dependent code.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Entire app | ✓ | v24.14.1 | — |
| npm | Package install | ✓ | 11.11.0 | — |
| `node:sqlite` (`DatabaseSync`) | DB layer (existing) | ✓ | Built into Node 24.14.1 | — |
| Google Cloud OAuth client (Desktop app, Production-published) | ING-01 | ✓ (per CONTEXT canonical_refs — already configured this session) | — | — |
| `.secrets/` directory with OAuth client JSON | OAuth flow | Unverified — not directly readable by this research session (gitignored, permission-restricted); CONTEXT confirms it exists | — | If missing at execution time, the plan's Wave 0 must include a setup-verification step before writing any OAuth code |
| Real Gmail inbox access (for template sampling, Open Questions 1–3) | ING-04 parser accuracy | Not verifiable from this research session — requires the user's live Gmail account | — | Wave 0 manual sampling task, cannot be substituted with WebSearch/training-data guesses per D3-02 |

**Missing dependencies with no fallback:**
- Live Gmail inbox access for confirming exact sender domains/templates (Open Questions 1–3) — this is inherent to the phase and explicitly deferred to execution-time confirmation per CONTEXT, not a gap in this research.

**Missing dependencies with fallback:**
- `.secrets/` directory contents — assumed present per CONTEXT; Wave 0 should verify before building on top of it.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (already configured, `vitest.config.ts` at repo root) |
| Config file | `vitest.config.ts` — `environment: "node"`, `@` alias to `./src` |
| Quick run command | `npx vitest run tests/domain/ingestion.test.ts` (once created) |
| Full suite command | `npm test` (= `vitest run`) |

Existing test fixture pattern (`tests/helpers/db.ts`) spins up an isolated **in-memory** `node:sqlite` DB with all migrations applied via `createTestDb()` — this phase's tests should reuse it unchanged. Gmail API calls must be mocked/stubbed (no live network calls in unit tests) — inject a fake `gmail` client object (or wrap the real `googleapis` gmail client behind a narrow interface `{ listMessages, getMessage, listLabels }` that tests can substitute) rather than calling `googleapis` directly from untestable code.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ING-01 | OAuth token persists/refreshes without weekly re-auth | manual | N/A — requires live Google OAuth consent; document as a checkpoint:human-verify step, not unit-testable | ❌ Wave 0 (manual) |
| ING-02 | Targeted query matches known-sender mail | unit | `npx vitest run tests/gmail/query.test.ts` — assert the built `q` string given sender list + lastSync date | ❌ Wave 0 |
| ING-03 | Label id resolution incl. nested name | unit | `npx vitest run tests/gmail/labels.test.ts` — assert label-name matching logic against a mocked `labels.list` response | ❌ Wave 0 |
| ING-04 | Handshake/Workday/Ashby parsers extract company+status+date | unit | `npx vitest run tests/gmail/parsers/{handshake,workday,ashby}.test.ts` — fixture raw-email samples (redacted/synthetic, not real inbox content) → assert extracted fields | ❌ Wave 0 |
| ING-06 | Manual sync Server Action triggers a full run and revalidates | integration | `npx vitest run tests/domain/ingestion.test.ts` — using `createTestDb()` + a mocked Gmail client | ❌ Wave 0 |
| REL-01 | Low-confidence match → review_queue row | unit | `npx vitest run tests/domain/review-queue.test.ts` | ❌ Wave 0 |
| REL-02 | Unparseable/failed-parse → dead_letter row, never dropped | unit | `npx vitest run tests/domain/dead-letter.test.ts` — assert every fixture message ends up in exactly one of {transition, review, dead-letter} | ❌ Wave 0 |
| REL-03 | `sync_runs` row reflects last sync status/time/counts | unit | `npx vitest run tests/domain/sync-state.test.ts` | ❌ Wave 0 |
| REL-04 | Static risk-note copy renders | manual/visual | Covered by UI-SPEC's locked copy — no logic to test; verify visually during UAT | N/A (static content) |
| CAP-03 | Override survives a simulated re-sync/re-parse | integration | `npx vitest run tests/domain/applications.test.ts` (extend existing file) — set an override, run a simulated ingestion write for the same field, assert `getMergedField`/`getApplicationDetail` still returns the override | ❌ Wave 0 (extends existing test file; existing override round-trip test already at `tests/domain/overrides.test.ts`) |

### Sampling Rate

- **Per task commit:** `npx vitest run <changed-test-file>`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`; additionally, at least one **live** manual sync against the real Gmail account (not mocked) must be run and its outcome (transition/review/dead-letter counts) manually inspected before considering ING-04/REL-01/REL-02 verified end-to-end — mocked unit tests alone cannot prove the real sender-domain/template assumptions (see Assumptions Log A1/A2/A3).

### Wave 0 Gaps

- [ ] `tests/gmail/query.test.ts` — covers ING-02 (q-string construction)
- [ ] `tests/gmail/labels.test.ts` — covers ING-03 (label resolution incl. nesting)
- [ ] `tests/gmail/parsers/handshake.test.ts`, `workday.test.ts`, `ashby.test.ts` — covers ING-04 (fixture-based, using synthetic/redacted sample emails, never real inbox content committed to the repo)
- [ ] `tests/domain/ingestion.test.ts` — covers ING-06, dedup ledger (D3-06 query↔label overlap), D3-05 minimum-bar gating
- [ ] `tests/domain/review-queue.test.ts`, `tests/domain/dead-letter.test.ts` — covers REL-01/REL-02
- [ ] `tests/domain/sync-state.test.ts` — covers REL-03
- [ ] Extend `tests/domain/applications.test.ts` and/or `tests/domain/overrides.test.ts` — covers CAP-03's read-path wiring (Pitfall 1)
- [ ] A mockable Gmail-client interface/fixture (e.g. `tests/helpers/gmail.ts`) — needed before any of the above integration tests can run without live network access
- [ ] Framework install: none — Vitest already configured; only new test files and fixtures are needed

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | OAuth2 (Google-managed) for the Gmail connection itself — no project-owned password/credential to protect beyond the refresh token file. |
| V3 Session Management | no | Single-user local tool, no web session concept beyond Next.js's own request lifecycle. |
| V4 Access Control | no | Single user, no multi-tenant access boundaries. |
| V5 Input Validation | yes | Every parsed-email field must pass through a `zod` schema (extend `src/db/validation.ts`) before reaching Drizzle — matches existing project convention; this is the primary gate that keeps a malformed/malicious email from corrupting `applications`/`status_events`. |
| V6 Cryptography | no direct control needed | The refresh token itself is a bearer secret handled entirely by `google-auth-library`; this project stores it in a gitignored local file rather than rolling custom encryption — acceptable for a single-user local-first tool per CLAUDE.md's "low ongoing effort" constraint, but the file must have restrictive permissions and must never be committed (verify `.secrets/` is in `.gitignore`, per CONTEXT). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Malicious/malformed raw email content used to inject markup into the UI (dead-letter "View raw email" viewer) | Tampering / Spoofing | Already locked in 03-UI-SPEC.md: raw email body renders as escaped plain text only (`<pre>`/text node), never `dangerouslySetInnerHTML` — this phase's dead-letter detail view must follow that rule exactly. Emails are externally-sourced and untrusted by definition. |
| A crafted email subject/body attempting SQL-injection-style payloads into `review_queue`/`dead_letter`/`status_events` text columns | Tampering | Drizzle's parameterized query builder (already used throughout the project) — no raw SQL string interpolation anywhere in the ingestion write path. |
| OAuth refresh token exfiltration via an overly broad scope | Elevation of Privilege | Already locked project-wide: `gmail.readonly` only (never `https://mail.google.com/`), per CLAUDE.md's explicit "What NOT to Use" guidance — reaffirm this scope is what's actually requested in `generateAuthUrl`. |
| A malicious/misconfigured redirect_uri during the OAuth callback (open-redirect-style risk) | Spoofing | The registered `redirect_uri` must exactly match what's configured in Google Cloud Console for the Desktop-app OAuth client (typically `http://localhost:<port>/...`) — Google itself rejects a mismatched redirect_uri at the consent-exchange step, but the Route Handler should still validate the callback isn't reachable/meaningful outside the exact one-time consent flow (e.g., reject a `code` exchange attempt if a token already exists, rather than silently re-running it). |

## Sources

### Primary (HIGH confidence)
- `npm view googleapis version` / `npm view google-auth-library version` / `npm view mailparser version` / `npm view html-to-text version` — direct registry queries, run 2026-07-29.
- `gsd-tools query package-legitimacy check` — direct registry+heuristic queries for all 6 candidate/rejected packages, run 2026-07-29.
- Direct codebase inspection (Read tool): `src/db/schema.ts`, `src/domain/{events,overrides,applications,companies,contacts,timeline}.ts`, `src/db/{client,paths,migrate}.ts`, `src/app/actions.ts`, `src/app/job/[id]/actions.ts`, `tests/helpers/db.ts`, `tests/domain/overrides.test.ts`, `package.json`, `vitest.config.ts`, `.planning/config.json` — this is the source of Pitfall 1 (CAP-03 gap) and the entire Data-Model/Architecture sections.

### Secondary (MEDIUM confidence — WebFetch of official docs, or WebSearch cross-checked against an official source)
- developers.google.com/workspace/gmail/api/guides/filtering — `q` parameter syntax, `in:`/`after:`/`before:` operators, alias-expansion and thread-search limitations.
- developers.google.com/workspace/gmail/api/guides/list-messages — `maxResults` (default 100, max 500), `nextPageToken`/`pageToken` pagination.
- developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get — `format` parameter (raw/full/metadata/minimal); raw returns base64url-encoded RFC 2822.
- developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels/list — Label resource fields (`id`, `name`, `messageListVisibility`, `labelListVisibility`, `type`); nested-label `/`-naming convention.
- developers.google.com/workspace/gmail/api/reference/quota (via WebSearch summary) — quota unit costs (`messages.list`=5, `messages.get`=20), per-project/per-user rate limits, daily quota, 429/`rateLimitExceeded` behavior.
- github.com/googleapis/google-auth-library-nodejs (README, via WebSearch summary) — `access_type: 'offline'`, `tokens` event, `setCredentials`, automatic refresh behavior.
- npmjs.com/package/mailparser, npmjs.com/package/html-to-text — API shape (`simpleParser`, `convert`) and option names.
- Handshake Help Center support articles (support.joinhandshake.com, via WebSearch summary) — notification domain list.
- Ashby Knowledge Base (docs.ashbyhq.com, via WebSearch summary) — `ashbyhq.com`/`noreply@ashbyhq.com` sender convention.
- nodejs.org/api/sqlite.html and multiple 2026 blog sources (via WebSearch) — `node:sqlite` stabilization timeline.

### Tertiary (LOW confidence — WebSearch only, not cross-checked against an authoritative source, or explicitly acknowledged as needing execution-time confirmation)
- Workday sender-domain variability (Pitfall 5, Assumption A3) — synthesized from general WebSearch results (university IT help pages), not an official Workday API/vendor doc; explicitly flagged for real-inbox confirmation.
- Exact Handshake/Ashby/Workday subject-line and body regex patterns — not researched at all this session (correctly deferred to D3-02's real-inbox-sampling requirement); Open Questions 1–2 make this gap explicit.
- Next.js Server Actions timeout behavior on self-hosted deployments (Assumption A6) — WebSearch results were Vercel-specific; no authoritative self-hosted-default figure found.

## Metadata

**Confidence breakdown:**
- Standard stack (package choice/versions): HIGH — verified directly against npm registry.
- Gmail API mechanics (query syntax, pagination, formats, labels, quota): MEDIUM — CITED against official Google docs via WebFetch/WebSearch, not independently tested against a live account in this research session.
- Per-sender email templates (Handshake/Workday/Ashby exact regex): LOW — explicitly deferred to execution-time real-inbox sampling per D3-02; do not plan around unverified template assumptions.
- Architecture/data-model recommendations (dedup ledger, transaction boundaries, CAP-03 gap): HIGH — derived directly from reading the existing, tested codebase, not from external research.

**Research date:** 2026-07-29
**Valid until:** ~30 days for Gmail API mechanics/package versions (stable, slow-moving surface); the per-sender template assumptions (A1/A2/A3) have no meaningful "valid until" — they must be re-confirmed against the live inbox at execution time regardless of research date, since ATS vendors can change templates at any time.
