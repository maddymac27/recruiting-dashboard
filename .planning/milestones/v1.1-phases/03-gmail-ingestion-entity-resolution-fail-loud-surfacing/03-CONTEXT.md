# Phase 3: Gmail Ingestion, Entity Resolution & Fail-Loud Surfacing - Context

**Gathered:** 2026-07-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up the Gmail ingestion pipeline: pull job mail via a targeted ATS-sender query **plus** a designated "Job Search" label, parse a small set of known senders into dated status-transition events matched to the right application, and route everything uncertain to a **review queue** or unparseable/failed mail to a **dead-letter queue** — never silently dropping or misattributing a message. Surface ingestion health and make the REL-04 silent-recall gap a *visible* open risk. Ensure a user's manual field corrections survive a re-sync/re-parse (CAP-03).

**Requirements:** ING-01, ING-02, ING-03, ING-04, ING-06, REL-01, REL-02, REL-03, REL-04, CAP-03.

**In this phase:** OAuth connect (one-time), manual sync (ING-06), targeted-query + label ingestion, regex parsing of 3 senders, review + dead-letter queues, ingestion-health surfacing, override persistence.

**NOT in this phase (Phase 4):** daily automatic scheduling + missed-run catch-up (ING-05) and sync-cursor-expiry full-resync fallback (ING-07). Redirect any scheduling discussion there.
</domain>

<decisions>
## Implementation Decisions

### Parsing strategy & privacy
- **D3-01:** **Regex-only extraction — no LLM fallback (cloud or local).** Per-sender deterministic parsers only. Rationale: the #1 privacy constraint ("no third-party services receive my job-search data — includes rejections and comp") outweighs the recall gain of a cloud LLM; a local LLM was also declined for the ongoing-effort cost. At ~8 emails/week the manual-triage cost of routing unparseable mail to review/dead-letter is acceptable, and ING-04 only requires parsing 2–3 senders with everything else routed *visibly*. **No email content ever leaves the machine.** NOTE: this deliberately overrides the Claude-Haiku-fallback suggestion in CLAUDE.md's stack notes.

### Senders to parse (ING-04)
- **D3-02:** Parse **3 known senders first: Handshake** (roadmap-locked), **Workday**, and **Ashby** (user's most-common ATS beyond Handshake). Research/planning MUST confirm the exact sending domains and current email templates against real messages in the job-search inbox before writing parsers — do not assume domain formats.

### Label escape-hatch (ING-03)
- **D3-03:** The escape hatch is the user's **existing Gmail label "Job Search"** — reused, not newly created. (In Gmail, "folders" and "labels" are the same underlying construct; the user's "Job Search" subfolder *is* a label. If it is nested, its API name may be `Parent/Job Search` — research MUST list labels via the Gmail API and confirm the exact string/ID.) Free-form label mail (forwarded LinkedIn notes, personal-address recruiter threads) is **not** structurally parsed; it surfaces in the **review queue**, and the user attaches it to the right job as a **conversation/contact entry**, reusing the Phase 2 CAP-04 contact + conversation logging (`contact-conversation-form.tsx`, `job/[id]/actions.ts`, `addConversation`/`createContact`). Content is captured verbatim; job-matching is manual by design.
- **D3-06:** **First sync intentionally backfills the entire existing contents of the "Job Search" label** as a one-time historical import (the user treats that folder as a curated record worth capturing). Plan for a **large initial review-queue volume** — the UI and the sync must handle a big first batch gracefully (pagination/batching, and a review queue that stays usable at high item counts). Two design implications for the planner: (1) **query ↔ label overlap** — an ATS email may be caught by BOTH the targeted sender query (→ parsed into a transition event) and the label backfill (→ conversation entry); dedup on message id (DATA-06) so the same message is not double-recorded, and let the parsed-transition path win over the conversation-entry path for known senders. (2) After the one-time backfill, steady-state label ingestion only needs newly-tagged mail. ⚠️ The "large first-run triage" tradeoff was explicitly accepted by the user.

### Parse failure & success bar
- **D3-04:** A **known** sender whose email fails to parse (e.g. Handshake changes its template) routes to the **dead-letter queue with the raw email visible**, flagged "known sender failed to parse." Fail-loud so template drift is noticed and the parser gets fixed — never silently downgraded to a note.
- **D3-05:** Minimum successful-parse bar = **company + status + date**. Role title is optional / fill-later. A real-world **event date is required** (not defaulted to the email's received time) to preserve DATA-03 out-of-order stage derivation and future response-time analytics. Anything extracting less than {company, status, date} does not auto-record — it routes to review (matchable) or dead-letter (parse failure).

### Claude's Discretion — DEFAULTS set for the two areas not deep-dived (user to CONFIRM during planning)
- **Unmatched email** (mail for a company/role the user never saved): **default = route to the review queue as a "confirm & create" item** — the user approves creating the new application — rather than silently auto-creating or dead-lettering. Aligns with fail-loud + trust. ⚠️ Confirm during planning.
- **Match confidence** (auto-attach vs. review): **default = conservative** — only high-confidence matches (e.g. exact/aliased company + an open application + plausible stage progression) auto-attach; anything ambiguous → review queue. Favors trust over fewer clicks, per the core value. ⚠️ Confirm during planning.
- **Ingestion health (REL-03) + REL-04 visibility:** **default =** a dashboard indicator showing last-sync status/time + counts of review/dead-letter items, plus an explicit, persistent note that "targeted sender-domain search can miss mail from unlisted senders" (REL-04 as a *visible open risk*, not solved). Exact UI deferred to UI-SPEC / planning.
- **CAP-03 override persistence:** wire the sync/re-parse write path to respect the existing Phase 1 overrides table (read-time precedence, DATA-07) so a re-sync/re-parse never clobbers a manual correction. Mechanism already exists — this is integration, not new design.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project constraints & recommended stack
- `.claude/CLAUDE.md` — recommended Gmail-ingestion stack + patterns: `googleapis` (`gmail.readonly`, `users.messages.list` with `q` query), `mailparser` (raw MIME → structured), `html-to-text` (ATS HTML → text before regex), per-sender regex parsing, review/dead-letter routing, `zod` validation, OAuth "Testing vs Production" 7-day-refresh-token caveat. ⚠️ The doc recommends a Claude Haiku LLM extraction fallback and the Batches API — **this phase has decided AGAINST any LLM extraction (D3-01)** on privacy grounds; disregard those two recommendations.
- `.planning/PROJECT.md` — core value, privacy/reliability/low-effort constraints, and Key Decisions (targeted search primary + label escape hatch; self-forward LinkedIn into the label; daily sync + manual refresh; event-sourced transitions; capture analysis dimensions at ingestion).
- `.planning/REQUIREMENTS.md` §Ingestion (ING), §Reliability (REL), and CAP-03 — full definitions of the 10 requirements this phase covers.

### OAuth setup (completed this session)
- `.secrets/` (gitignored) — Google OAuth **Desktop-app** client JSON (client id + secret), created under the **job-search** Google account; consent screen configured with scope **`gmail.readonly`** and **published to Production** (so refresh tokens don't expire weekly). The one-time "authorize & mint refresh token" step happens during this phase's execution and MUST be done while signed in as the job-search account.

No external ADRs/specs beyond the above.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Event-sourcing core** (`src/domain/events.ts`): `appendStatusEventTx(tx, …)` / `appendStatusEvent` — the sync writer appends dated transition events through these (inside a transaction), never in-place status writes. Out-of-order stage derivation already handled.
- **Idempotency (DATA-06):** messages are uniquely identified so re-syncing the same email never duplicates an event/record — the sync path must set/carry the message id.
- **Overrides (DATA-07 / CAP-03):** overrides table with read-time precedence already exists from Phase 1 — the re-parse path must respect it.
- **Entity graph** (`src/domain/contacts.ts`, company aliases): `createCompany`/`addAlias`/`resolveCompany` for company matching (handles Meta/Facebook-style variants); `createContact`/`linkContactToApplication`/`addConversation` for label-mail → conversation entries.
- **Phase 2 write UI:** `contact-conversation-form.tsx` + `src/app/job/[id]/actions.ts` (the review flow for label mail reuses this); `quickSaveApplication`/`updateApplication` for "confirm & create" from review.
- **Demo/real separation + server-only DB:** `src/db/client.ts` is the single reader of `DASHBOARD_MODE`.

### Established Patterns
- Server-only DB access; `node:sqlite` + Drizzle (`drizzle-orm/node-sqlite`, Node ≥ 24); Zod validation before every write; event-sourced transitions (never overwrite a status field); free text rendered escaped (no `dangerouslySetInnerHTML`).
- **Fail-loud:** surface failures visibly (review/dead-letter queues, ingestion-health indicator) — never swallow an error or silently drop a message.

### Integration Points
- New Gmail sync + parse pipeline writes through the existing domain layer (transitions via `appendStatusEventTx`; new apps via quick-save/create; label mail via `addConversation`).
- New **review-queue** and **dead-letter** tables + UI; **ingestion-health** surfacing on the existing nav-shell/dashboard; a **manual-sync** trigger (ING-06) as a Server Action / route.
- OAuth client + token handling is server-only and reads credentials from `.secrets/` (gitignored).
</code_context>

<specifics>
## Specific Ideas

- **Privacy-first, regex-only:** no email content leaves the device — cloud LLM declined (privacy), local LLM declined (effort).
- **First 3 senders:** Handshake, Workday, Ashby. **Label:** "Job Search".
- **Fail-loud everywhere:** known-sender template drift → dead-letter with the raw email shown; low-confidence match / unmatched → review queue; unparseable non-known mail → dead-letter. Nothing silently dropped.
- **Event date is sacred:** parse the real-world event date, don't default to received-time — the whole analytics story depends on it.
</specifics>

<deferred>
## Deferred Ideas

- **LLM extraction fallback** (cloud Claude Haiku *or* local Ollama) — declined for v1 on privacy/effort grounds. Revisit only if manual review/dead-letter triage becomes burdensome as volume grows. Related to v2 INGB-01 (full ATS parser breadth).
- **Daily automatic sync + missed-run catch-up (ING-05)** and **sync-cursor-expiry full-resync fallback (ING-07)** — Phase 4, explicitly out of scope here.
- **Additional ATS senders beyond the first 3** (Greenhouse, Lever, iCIMS, etc.) — future / v2 INGB-01; this phase proves the pipeline on 3.
- **UI polish backlog (Phase 999.1)** — unrelated to ingestion; tracked separately.

None of the above were dropped — all captured for their proper phase/milestone.
</deferred>

<decision_revisions>
## Decision Revisions (during Phase 3 execution, 2026-07-31)

Three decisions were revised against REAL inbox data during execution — each a user decision at a live checkpoint (the original rationale was made pre-data). Code + SUMMARYs reflect these; treat them as current truth, superseding the earlier `<decisions>`/`<specifics>` wording:

- **D3-02 sender set → Workday / SmartRecruiters / Ashby (Handshake DROPPED).** Real-inbox sampling (03-03) found ZERO Handshake mail; Workday is the dominant sender. SmartRecruiters added. `KNOWN_SENDER_DOMAINS = myworkday.com / smartrecruiters.com / ashbyhq.com`. "Job Search" label confirmed top-level `Label_11`.
- **D3-05 date policy → prefer explicit date, else fall back to the email's received-time.** Real ATS confirmations carry no explicit calendar date; the original "never received-time" would have blocked every confirmation from ever becoming a transition.
- **Unmatched-email default → AUTO-CREATE high-confidence Applied confirmations** (was: route all unmatched to review). A clear ATS "applied" confirmation for a company not yet tracked auto-creates the application (source "Company site / ATS", dated explicit-or-received). Rejections/interviews for unknown companies + ambiguous still route to review.

Validated live (03-06 smoke test): one real sync auto-created 3 applications (OnePay, Visa [4 events], Pismo), routed 43 → review + 18 → dead-letter, 0 dropped.
</decision_revisions>

---

*Phase: 3-Gmail Ingestion, Entity Resolution & Fail-Loud Surfacing*
*Context gathered: 2026-07-29*
