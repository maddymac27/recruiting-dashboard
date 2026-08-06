# Stack Research

**Domain:** Local-first, single-user job-application tracking dashboard with Gmail ingestion
**Researched:** 2026-07-21
**Confidence:** MEDIUM-HIGH (core libraries verified against npm/official pages; behavioral claims about OAuth token lifetimes and Task Scheduler wake behavior are well-corroborated across multiple independent sources but not hand-tested for this project)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Node.js + TypeScript** | Node 20/22 LTS, TS 5.x | Runtime + language | Gmail's official SDK (`googleapis`) is Node-first and best-maintained there; a browser UI is required, so a JS/TS stack avoids running two languages (Python backend + JS frontend) for a one-person project. TypeScript catches parser/schema drift at compile time, which matters a lot when the "schema" is scraped from emails. |
| **Next.js (App Router)** | 15.x | Full-stack web framework (UI + API routes) | One framework instead of a separate frontend + backend. API routes/server actions host the Gmail sync job, the parser, and the DB layer; the same process serves the React dashboard. No hosting, no auth, no multi-service deploy — just `npm run dev` / `next start` on your own machine, which matches the "local-first, single user" constraint exactly. Enormous ecosystem means any problem has prior art, which matters given the user's explicit "low ongoing effort" requirement. |
| **better-sqlite3** | 13.0.1 | Embedded database driver | Synchronous, in-process SQLite — no server to install, configure, or forget to start. Fastest Node SQLite driver for this workload size (thousands of rows, not millions). A single `.sqlite` file is trivial to back up, inspect with any SQLite browser, or reset for demo mode. |
| **Drizzle ORM** | 0.45.x | Type-safe query builder / schema / migrations | Thin, TypeScript-first layer over `better-sqlite3` with zero runtime dependency bloat and straightforward migrations (`drizzle-kit`). Schema-as-code keeps the "current state" tables and the "append-only event log" tables (see Data model below) in one typed source of truth, so a field captured at ingestion is guaranteed to have a column to land in. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `googleapis` | 173.0.0 | Full Google API client incl. Gmail | Use the full package (not the narrower `@googleapis/gmail` 17.0.0) — you get `google-auth-library` wiring for free and won't need a second package if you ever touch Calendar/Contacts later. |
| `google-auth-library` | latest (bundled with `googleapis`) | OAuth2 client, token storage/refresh | Handles the authorization-code exchange and silent refresh. Persist the returned `refresh_token` yourself (e.g., in a local JSON file or a `credentials` table) — the library does not persist it for you. |
| `mailparser` | 3.9.14 | MIME parsing of raw RFC 822 messages | Gmail's `users.messages.get?format=raw` returns base64url-encoded raw MIME. `mailparser`'s `simpleParser()` turns that into `{subject, from, date, html, text, attachments}` in one call — this is the standard, actively maintained choice (950+ dependents, updated within days). |
| `html-to-text` | 10.0.0 | HTML → readable plain text | ATS emails are almost always HTML-only with no usable plain-text alternative. Converting to clean text before regex/LLM extraction improves both approaches' accuracy versus running patterns against raw HTML tag soup. |
| `drizzle-kit` | matches `drizzle-orm` minor | Schema migrations CLI | Dev dependency; generates and applies SQL migrations from the Drizzle schema file. |
| `node-cron` | 4.6.0 | In-process scheduler (optional) | Only needed if you choose to run a persistent long-lived Node process (see Scheduling below). For most local-first setups, Windows Task Scheduler replaces this entirely — see "Stack Patterns by Variant." |
| `@anthropic-ai/sdk` | current | Claude API client for LLM-based extraction fallback | Used only for unknown-sender / label-inbox emails and as a fallback when a deterministic per-sender parser fails to extract required fields (see Email parsing below). |
| `recharts` | current (v3.x) | Charting library for the dashboard | See Charting section below for the full comparison and rationale. |
| `zod` | current | Runtime schema validation | Validate parsed-email output (both regex-path and LLM-path) against one shared schema before it's written to the DB — catches malformed extraction before it corrupts "current state," which the project explicitly requires ("I can correct... when the parser gets it wrong" implies the system must know what "wrong" looks like). |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Google Cloud Console (OAuth client, Desktop app type) | Register the OAuth client and generate the client ID/secret | Keep the consent screen in "Testing" publishing status with yourself as the sole test user — this avoids Google's app-verification review entirely for a personal single-user tool (see Gmail API section). |
| `drizzle-kit studio` | Local DB browser/GUI | Handy for inspecting the event-log and current-state tables during development without a separate SQLite GUI. |

## Installation

```bash
# Core
npm install next react react-dom
npm install googleapis
npm install better-sqlite3 drizzle-orm
npm install mailparser html-to-text
npm install @anthropic-ai/sdk
npm install recharts
npm install zod

# Dev dependencies
npm install -D typescript @types/node @types/better-sqlite3 @types/mailparser
npm install -D drizzle-kit
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Node.js / TypeScript | Python (FastAPI + a Node/React frontend) | If the user were far more comfortable in Python and willing to run two processes. Python's Gmail SDK (`google-api-python-client`) is equally solid, but pairing it with a browser UI means either a second JS process or a heavier full-stack Python framework (Django/Streamlit) — more moving parts for one person to maintain than a single Next.js app. |
| Next.js (App Router) | SvelteKit | SvelteKit produces smaller bundles and a lighter mental model, and is a reasonable choice if the user already knows Svelte. It was not chosen here mainly because the Node/Gmail ecosystem's documentation, examples, and AI-assistant familiarity skew overwhelmingly toward Next.js/React, which lowers the "figuring things out" tax the user explicitly wants to avoid. |
| better-sqlite3 + Drizzle | Prisma + `@prisma/adapter-better-sqlite3` | Prisma's schema DSL and generated client are more opinionated/batteries-included, at the cost of a heavier toolchain (a separate schema language, codegen step) and, as of Prisma ORM 7, a required driver-adapter layer for SQLite. Reasonable if the user wants Prisma's studio UI and is willing to accept the extra generation step; Drizzle was chosen for being closer to plain SQL/TypeScript with less indirection. |
| Windows Task Scheduler (primary) | `node-cron` in a persistent process | Use `node-cron` only if you decide to run the Next.js server as an always-on background service (e.g., via `pm2` or NSSM as a Windows service). For a tool the user opens on demand rather than a 24/7 service, Task Scheduler triggering a standalone sync script needs no daemon to keep alive. |
| Recharts | Tremor | Tremor ships pre-styled dashboard *components* (KPI cards, styled chart wrappers) on top of Recharts, and gets you a polished look faster — but it's less flexible for a custom multi-dimension funnel with user-driven filtering, which this project needs, and it's an added ~50kB and dependency layer over plain Recharts for a single-user local app where "impressive default styling" matters less than "does exactly what the requirement asks." |
| Recharts | visx (Airbnb) | Use visx if the funnel/conversion visuals turn out to need something Recharts's chart-type set doesn't cover (e.g., a genuinely custom funnel shape). visx is lower-level (D3 primitives wrapped in React) and gives full control at the cost of writing more layout code yourself — not worth the extra effort unless Recharts is proven insufficient. |
| Hybrid regex + LLM parsing | Pure LLM extraction for every email | Only worth it if sender diversity is very high and templates never stabilize. At ~8-15 emails/week from a handful of known ATS platforms, per-sender regex is both cheaper and more reliable for the 90%+ of mail that's from Greenhouse/Workday/Lever/Ashby/Handshake; LLM extraction is reserved for the label-based escape hatch (arbitrary recruiter/LinkedIn text) and as a fallback when a known template's regex doesn't match. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| IMAP/SMTP polling (e.g., `node-imap`, `imapflow` against Gmail's IMAP bridge) | Requires enabling "less secure" IMAP access patterns or app passwords, loses Gmail's server-side search operators (`from:`, `after:`, label filters) that make targeted, low-noise ingestion possible, and doesn't map cleanly to OAuth scopes | The Gmail REST API (`users.messages.list` with a `q` query string) — purpose-built for exactly this filtered-search use case |
| Publishing the Google Cloud OAuth consent screen to "In production" for this project | Triggers Google's app-verification review process (paperwork, potential rejection, weeks of latency) for an app that will only ever have one user | Keep it in "Testing" status with yourself as the only test user — refresh tokens for a *testing*-status app do expire in 7 days **unless** the requested scopes are limited to name/email/profile, so Gmail scopes will need periodic re-consent, or read the Gmail-specific caveat below and plan the refresh flow accordingly |
| Requesting `https://mail.google.com/` (full IMAP-equivalent) scope | Gmail's API grants whole-mailbox access regardless of scope granularity (there is no per-label scope), but requesting the full-access scope instead of `gmail.readonly` needlessly widens the token's blast radius for a tool that only ever reads mail | `gmail.readonly` — sufficient for search + read; write scopes are never needed since automatic replying/sending is explicitly out of scope for this project |
| A second backend framework (e.g., Express) alongside Next.js "just for the API" | Adds a second server process, a second port, and a second deployment story for zero benefit in a single-user local app | Next.js API routes / Route Handlers — same process, same port, one `npm run dev` |
| Building a custom cron-like scheduler loop from scratch | Windows-specific sleep/wake, missed-trigger, and "run at next boot" semantics are exactly what Task Scheduler already solves; hand-rolling this in Node reinvents OS-level functionality the OS already provides for free | Windows Task Scheduler (see Scheduling below) |
| Chart.js as the primary charting library | Canvas-rendered, not React-native — every interaction (tooltips, click-to-filter, cross-highlighting) needs manual glue code that Recharts already provides declaratively via its component API; Chart.js's main strength (raw rendering performance at 10k+ points) is irrelevant at this project's data volume | Recharts |

## Stack Patterns by Variant

**If you want the sync to run even when you're not actively using the dashboard (recommended default):**
- Use Windows Task Scheduler to run a standalone Node script (e.g., `node dist/scripts/sync.js` or `npx tsx scripts/sync.ts`) once daily, completely independent of whether the Next.js dev/prod server is running.
- Enable both "Run task as soon as possible after a scheduled start is missed" (Settings tab) and "Wake the computer to run this task" (Conditions tab) so a sync isn't silently skipped because the laptop was asleep or off at the scheduled time — confirm the BIOS/UEFI allows wake timers, or the wake option is a no-op.
- Because the sync script owns the DB write path, the Next.js app just reads the same SQLite file — no need for the web server to be running for ingestion to happen.

**If you'd rather run the whole app as an always-on local service:**
- Run Next.js under a process manager (`pm2`, or register it as a Windows service via NSSM) and use `node-cron` inside that same process to fire the daily sync in-process.
- Tradeoff: the service must stay running continuously for the schedule to fire at all — if the machine sleeps or the process crashes, `node-cron`'s in-process timer does nothing (unlike Task Scheduler, which the OS itself tracks and can catch up on wake). This pattern only makes sense if you're already committed to always-on background service.

**If a known ATS sender's email format changes and the regex parser starts failing silently:**
- Route any per-sender parser that fails to extract all required fields (company, role, status, date) into the Claude Haiku 4.5 structured-extraction fallback rather than discarding the email — pair this with a "needs review" flag in the UI so the failure surfaces visibly rather than silently, per the project's reliability constraint.

**If email volume increases substantially (per PROJECT.md's expectation) and per-request LLM cost becomes worth optimizing:**
- Switch the fallback-extraction calls to the Anthropic Batches API (50% cheaper, fine for a once-daily non-interactive job) instead of synchronous per-email calls in the sync script.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `drizzle-orm@0.45.x` | `better-sqlite3@13.x` (via `drizzle-orm/better-sqlite3`) | `better-sqlite3` v13 is the first version built on N-API; make sure `@types/better-sqlite3` matches the installed major version. |
| `googleapis@173.x` | Node 20+ | Recent `googleapis` releases assume a current Node LTS; if pinned to an older Node version, use an older `googleapis` release or upgrade Node. |
| `next@15.x` | React 19, Node 20+ | Standard current pairing; no special configuration needed for this project (no edge runtime requirements, no serverless deploy target). |
| Gmail OAuth "Testing" publishing status | `gmail.readonly` scope | Refresh tokens on a Testing-status OAuth client expire after 7 days *unless the only requested scopes are name/email/profile* — since Gmail scopes are broader than that, plan for either periodic re-authentication or verify this behavior directly against your own client before relying on a long-lived token (see Sources; this is corroborated across multiple sources but worth confirming empirically once the OAuth client is set up, since Google's exact policy here has shifted over time). |

## Sources

- npmjs.com `googleapis`, `@googleapis/gmail`, `google-auth-library`, `mailparser`, `html-to-text`, `better-sqlite3`, `node-cron` package pages — version numbers, download counts, maintenance recency (confidence: MEDIUM, verified via WebSearch snippets quoting official npm pages)
- developers.google.com Gmail API guides (`users.messages.list`, filtering/search operators, quota reference) — query syntax and quota-unit figures (confidence: MEDIUM — content matches Google's documented behavior as reflected in current third-party summaries; recommend spot-checking `developers.google.com/workspace/gmail/api` directly before implementation)
- Multiple independent sources on Google OAuth "Testing" publishing status and 7-day refresh token expiry behavior (confidence: MEDIUM — consistent across sources but Google's policies in this area have changed historically; verify against your own OAuth client's behavior early in implementation)
- Microsoft Learn / Windows forums on Task Scheduler "run as soon as possible after a missed start" and "wake the computer" settings (confidence: MEDIUM-HIGH — long-standing, stable Windows feature)
- Prisma ORM official docs (SQLite driver adapters, v7 adapter requirement) (confidence: MEDIUM)
- Drizzle ORM official docs (SQLite getting-started guide) (confidence: MEDIUM)
- Third-party 2026 comparison articles for React charting libraries (Recharts vs visx vs Chart.js vs Tremor) and full-stack frameworks (Next.js vs SvelteKit vs Remix) — used for qualitative positioning only, not version numbers (confidence: LOW-MEDIUM, general web analysis rather than official docs — treated as directional, not authoritative)
- Anthropic `claude-api` skill (bundled reference) — current Claude model pricing table and structured-outputs guidance (confidence: HIGH — first-party, version-controlled skill content); Claude Haiku 4.5 is $1.00/$5.00 per 1M input/output tokens and is the recommended default for classification/extraction workloads; `output_config.format` (structured outputs / `client.messages.parse()`) is the correct API surface for schema-constrained JSON extraction, supported on Claude Haiku 4.5, Claude Sonnet 5, and Claude Opus 4.8

---
*Stack research for: local-first, single-user job-application dashboard with Gmail ingestion*
*Researched: 2026-07-21*
