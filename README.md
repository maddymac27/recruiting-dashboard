# Recruiting Dashboard

A local-first job-search tracker that keeps itself accurate by reading Gmail — so the record of a search stays true even during the weeks you don't touch it.

It tracks every job applied to or saved, what stage each one is in, who's been contacted and when, and it surfaces both **what needs attention today** and **what's actually converting** — all without the manual-logging discipline that kills every spreadsheet-based attempt.

> **Why this exists:** Every prior version of my job tracker died at *capture*, not display. If a tracker requires me to remember to update it, it drifts out of date within a week and quietly becomes a lie. This one reads my inbox instead — and, just as importantly, **fails loudly**: a message it can't parse surfaces in a visible queue rather than vanishing.

---

## Highlights

- **Self-updating** — a scheduled daily sync reads job-search mail from Gmail (via the official API, `gmail.readonly`), parses known ATS senders, and files dated status transitions against the right application — with no action from me.
- **Fail-loud by design** — mail that can't be confidently matched lands in a **review queue**; mail that can't be parsed at all lands in a **dead-letter queue**. Nothing is ever silently dropped. The one structural blind spot (a sender domain never added to the search) is surfaced in the UI as a known open risk rather than assumed solved.
- **Event-sourced history** — status changes are stored only as append-only dated events, so current stage is *derived*, out-of-order emails resolve correctly, and re-ingesting the same message is idempotent (message-ID dedup ledger).
- **Manual corrections win** — a field I fix by hand is stored separately from and takes precedence over any parser-derived value, and survives the next re-sync.
- **Demo mode** — a toggle points every query at a completely separate seeded SQLite file built from invented companies, so the whole app can be demoed on a screen-share without exposing real rejections or compensation conversations.
- **Today + analytics views** — a "what needs me today" surface judges staleness per-stage (a screen that's gone quiet ≠ an application awaiting my reply), plus first-class "ghosted" flagging and a conversion funnel over accumulated transition history.

## Demo mode

The app ships with a demo store seeded entirely from fictional companies (Meridian Bank, Globex, Initech, …) and fake message bodies. Toggling demo mode swaps every read/write to `data/demo.sqlite` — there is **no code path** that can mix real and demo data — so it's safe to screenshot or present. Real job-search data lives only in a local, git-ignored SQLite file and never enters this repository.

## Architecture

```
src/
├── app/          Next.js App Router — board, today, analytics, contacts,
│                 outreach, review, dead-letter, job detail + server actions
├── domain/       Business logic — event-sourcing, staleness, ingestion routing
├── gmail/        OAuth, targeted search query, raw→MIME→text fetch, per-sender parsers
├── db/           Drizzle schema (16 tables), migrations, demo/real client swap
├── demo/         Portfolio-safe seed data + seeding scripts
├── components/   UI (shadcn/ui + Tailwind v4)
├── lib/          Shared utilities
└── types/        Shared type definitions
```

**Key design decisions**

- **Local-first, single process.** One Next.js app serves the dashboard *and* hosts the sync job — no separate backend, no hosting, no auth service. `npm run dev` and it's running.
- **Deterministic per-sender parsing.** Known ATS platforms (Handshake, Workday, Ashby, SmartRecruiters) are parsed with per-sender rules matched on the sending *domain* (Workday is multi-tenant, so the sender local-part varies per employer — matching the bare domain, never a fixed address, avoids silently under-matching). Anything outside the known set routes to the fail-loud queues instead of being guessed at.
- **Scheduling lives in the OS.** A standalone sync script is driven by Windows Task Scheduler with catch-up-on-missed-run and wake-to-run enabled, so a sync isn't silently skipped because the laptop was asleep — the OS tracks the schedule, not an always-on daemon.

## Tech stack

| Layer | Choice |
|---|---|
| Runtime / language | Node ≥ 24, TypeScript 5.9 |
| Framework | Next.js 16 (App Router), React 19 |
| Database | SQLite via Node's built-in `node:sqlite` |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Gmail | `googleapis` (`gmail.readonly`), `mailparser`, `html-to-text` |
| Validation | Zod (one shared schema validates both parser output and manual input) |
| UI / charts | Tailwind CSS v4, shadcn/ui (Radix), Recharts |
| Tests | Vitest — ~204 tests across 31 files |

## Engineering practices

- **~204 tests** covering event-sourcing edge cases (out-of-order events, idempotent re-ingestion), each parser against real-shaped email fixtures, and structural demo/real isolation.
- **Type-safe schema as source of truth** — the Drizzle schema is one typed definition the whole app builds on, so a field captured at ingestion is guaranteed a column to land in.
- **Planned in the open** — the [`.planning/`](.planning/) directory contains the full phase-by-phase roadmap, per-phase research, plans, verification records, and security threat models that drove the build. It's a real look at how the project was scoped and shipped.

## Project status

**v1.0 — Self-Updating Tracker — complete.** Schema + demo foundation → manual pipeline UI → Gmail ingestion with fail-loud surfacing → automatic incremental sync → analytics.

**v1.1 — Outreach & Email Threading — in progress.** Outreach tracker shipped (data model, manual logging, filterable view); editable columns, outreach auto-capture, and email-thread capture are planned. See [`.planning/ROADMAP.md`](.planning/ROADMAP.md) for the full breakdown.

## Getting started

Requires **Node ≥ 24** (the app uses the built-in `node:sqlite` module).

```bash
npm install
npm run db:migrate       # create the SQLite schema
npm run db:seed:lookups  # seed vocabulary/lookup rows
npm run db:seed:demo     # seed the demo store with fictional data
npm run dev              # http://localhost:3000
```

The dashboard opens in demo mode with seeded data — no Gmail connection or real data required to explore it. Connecting a real Gmail account is a one-time OAuth step used only when running against real data.

```bash
npm test                 # run the full test suite
```

## Privacy

This is a personal tool built around a hard privacy line: **email content and everything extracted from it stay on my machine.** No third-party service receives job-search data. The real database is git-ignored and has never been committed; everything in this public repository uses fictional demo data.

## License

[MIT](LICENSE) © Maddy McEnery
