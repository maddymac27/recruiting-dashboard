---
phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
plan: 03
subsystem: auth
tags: [oauth, googleapis, google-auth-library, gmail, nextjs-route-handler, server-actions, shadcn-tooltip]

# Dependency graph
requires:
  - phase: 03-01
    provides: googleapis/mailparser/html-to-text installed and vetted, ingested_messages/sync_runs tables, review_queue/dead_letter extensions
provides:
  - Server-only Gmail OAuth module (src/gmail/oauth.ts) — consent-URL generation, code->token exchange, refresh-token persistence to .secrets/gmail-token.json, hasStoredToken(), getAuthedGmailClient()
  - GET /api/auth/google/callback Route Handler — exchanges the OAuth code, refuses re-exchange when a token already exists
  - connectGmailAction Server Action, demo-mode gated
  - Sidebar Ingestion Health block (not-connected / connected placeholder states, disabled Sync now + tooltip)
  - CONFIRMED real-inbox ingestion constants for 03-04 onward (see below) — supersedes 03-02/03-RESEARCH's Handshake-first assumption
affects: [03-04, 03-05, 03-06, 03-07, 03-08, 03-09, 03-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "google.auth.OAuth2 (not a direct `google-auth-library` import) used to construct the OAuth2Client — googleapis's google.gmail() factory expects an auth client built from its OWN nested google-auth-library copy (googleapis-common/node_modules/google-auth-library), which is a structurally distinct TypeScript class from the top-level hoisted google-auth-library package. Importing OAuth2Client directly from google-auth-library produces a type error at google.gmail({auth})."
    - "Loopback OAuth redirect for a Desktop-app client: the downloaded client JSON's redirect_uris array lists only http://localhost (no port/path) — Google validates Desktop-client loopback redirects by scheme+host only, so http://localhost:3000/api/auth/google/callback works without being separately registered."
    - "Client credentials read by scanning .secrets/ for a client_secret*.json file rather than a hardcoded filename (the actual filename embeds the Google Cloud project's numeric client id)."

key-files:
  created:
    - src/gmail/oauth.ts
    - src/app/api/auth/google/callback/route.ts
    - src/components/ingestion-health.tsx
    - src/components/ui/tooltip.tsx
  modified:
    - src/app/actions.ts
    - src/components/nav-shell.tsx
    - src/app/layout.tsx

key-decisions:
  - "Used google.auth.OAuth2 (from the googleapis package) instead of importing OAuth2Client directly from google-auth-library, to avoid a TypeScript type-compatibility error against google.gmail()'s auth parameter (two structurally distinct nested copies of google-auth-library exist in node_modules)."
  - "google-auth-library stays a transitive dependency (via googleapis) rather than added as an explicit package.json entry — no new npm install needed since it already resolves at both compile and runtime."
  - "Sync now button renders disabled in BOTH connected and not-connected states in this plan (onClick wiring deferred to a later plan per the plan's own task text); only the not-connected state wraps it in a tooltip."

requirements-completed: [ING-01]

coverage:
  - id: D1
    description: "Clicking Connect Gmail redirects to Google's gmail.readonly consent screen and, after approval, the server-side callback stores a refresh token in .secrets/gmail-token.json"
    requirement: "ING-01"
    verification:
      - kind: manual_procedural
        ref: "Human completed the OAuth consent flow signed in as the job-search account; confirmed .secrets/gmail-token.json exists with a refresh_token"
        status: pass
    human_judgment: true
    rationale: "Requires live Google OAuth consent in a browser — not automatable or unit-testable."
  - id: D2
    description: "Once a token is stored, the sidebar permanently shows the connected state instead of Connect Gmail — no weekly re-auth (ING-01 restart-persistence)"
    requirement: "ING-01"
    verification:
      - kind: manual_procedural
        ref: "Human stopped and restarted the real-mode dev server; confirmed the connection persists across restart (token re-read from disk, health route returns mode:real)"
        status: pass
    human_judgment: true
    rationale: "Requires an actual process restart against the live token file — not unit-testable."
  - id: D3
    description: "Before any token exists the sidebar shows the not-connected state and the Sync now button is disabled with a tooltip explaining why; OAuth flow requests only gmail.readonly"
    requirement: "ING-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: other
        ref: "grep -c 'Gmail not connected yet' src/components/ingestion-health.tsx >= 1; grep -c 'Connect Gmail' src/components/ingestion-health.tsx >= 1; grep gmail.readonly src/gmail/oauth.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Real-inbox sampling CONFIRMED the Job Search label id/name and sender-domain match rules for the 03-04+ parser plans (D3-02, D3-03, Pitfall 5)"
    requirement: "ING-01"
    verification:
      - kind: manual_procedural
        ref: "Human ran a throwaway (uncommitted) script against getAuthedGmailClient() calling users.labels.list and sampling 51 real messages"
        status: pass
    human_judgment: true
    rationale: "Requires reading the user's real Gmail inbox — inherently not automatable/testable from this session; results recorded below for downstream plans to consume."

duration: ~10min active work (2 tasks, same session) + human-driven checkpoint pause (OAuth consent + real-inbox sampling, timing outside Claude's control)
completed: 2026-07-30
status: complete
---

# Phase 3 Plan 03: Gmail OAuth Connect + Sidebar Ingestion Health Summary

**Server-only Gmail OAuth module (loopback flow, refresh token in `.secrets/gmail-token.json`), a callback Route Handler, `connectGmailAction`, and a sidebar Ingestion Health block — closed by a human-verified OAuth consent + real-inbox sampling checkpoint that changed the phase's parser target list from the roadmap's assumed Handshake/Workday/Ashby to the CONFIRMED Workday/SmartRecruiters/Ashby (zero Handshake mail found).**

## Performance

- **Duration:** ~10 min of active Claude work across 2 tasks (both committed within ~90 seconds of each other), followed by a human-driven pause for the blocking OAuth-consent + real-inbox-sampling checkpoint (duration outside Claude's control — browser sign-in, consent, dev-server restart, and manual inbox sampling all happened between the checkpoint stop and this resume).
- **Started:** 2026-07-30T15:38Z (Task 1 commit)
- **Completed:** 2026-07-30T21:31Z (this summary)
- **Tasks:** 3/3 (2 auto tasks + 1 blocking human-verify checkpoint, all complete)
- **Files modified:** 7

## Accomplishments
- `src/gmail/oauth.ts` — server-only OAuth2Client construction (via `google.auth.OAuth2` for type-compatibility with `google.gmail()`), consent-URL generation (`gmail.readonly` only, `access_type: offline` + `prompt: consent`), `exchangeCode`, `hasStoredToken`, `getAuthedGmailClient`, refresh-token read/write to `.secrets/gmail-token.json`, and a `tokens` listener to re-persist a rotated refresh token
- `GET /api/auth/google/callback` Route Handler — exchanges the code, refuses re-exchange once a token exists (T-03-06), redirects to `/`
- `connectGmailAction` in `src/app/actions.ts` — demo-mode gated, returns the consent URL or `{ ok: true }` if already connected
- Sidebar `IngestionHealth` component — not-connected state ("Gmail not connected yet." + Connect Gmail button) and connected placeholder state ("Last synced —"); Sync now stays disabled in this plan (tooltip-wrapped when not connected)
- `nav-shell.tsx` renders `IngestionHealth` on every page; `layout.tsx` computes `isConnected` via `hasStoredToken()` (the only new caller of that function outside the gated action/route) and wraps the app in `TooltipProvider`
- **Live OAuth consent completed and verified** — refresh token persists in `.secrets/gmail-token.json`, confirmed to survive a dev-server restart (ING-01)
- **Real-inbox sampling completed** — see "Confirmed ingestion constants" below

## Task Commits

Each task was committed atomically:

1. **Task 1: OAuth module + callback route + connectGmailAction** - `c5cddde` (feat)
2. **Task 2: Sidebar Ingestion Health block** - `91c92f6` (feat)
3. **Task 3: One-time OAuth consent + token-persistence smoke test + real-inbox sampling** - human-verify checkpoint, no code commit (verification + sampling only; throwaway sampling script was never committed, per plan instruction)

**Plan metadata:** (this commit, following SUMMARY write)

## Confirmed Ingestion Constants

Resolved by the user's real-inbox sampling at this plan's blocking checkpoint (D3-02, D3-03, Pitfall 5). **These values supersede 03-RESEARCH.md's Handshake-first assumption and MUST be used by 03-04 onward** — 03-04-PLAN.md as currently written still targets a Handshake parser first; see "Next Phase Readiness" below.

### "Job Search" label
- **id:** `Label_11`
- **name:** `Job Search`
- **Nesting:** top-level (NOT nested) — a separate `Job Search/Email Templates` sublabel exists and must be ignored/excluded, not treated as part of the backfill target.

### Confirmed sender allow-list (ING-04 / D3-02)
Real-inbox sampling of 51 messages found **zero Handshake mail** — Handshake is DROPPED from the parser target list. Confirmed replacement set:

| Sender | Domain match rule | Notes |
|---|---|---|
| **Workday** | broad match on bare domain `myworkday.com` | Multi-tenant confirmed exactly as RESEARCH Pitfall 5 predicted — sender local-part varies per employer (e.g. `acmecorp@`, `globex@`, `initech@`, `umbrellacorp@myworkday.com`). Match the domain broadly, not one address. Dominant real sender: 11 of 51 sampled messages. |
| **SmartRecruiters** | `smartrecruiters.com` | NEW — not in the original roadmap/research sender list; replaces Handshake as a confirmed target. 5 of 51 sampled messages. |
| **Ashby** | `ashbyhq.com` (e.g. `no-reply@ashbyhq.com`) | Matches RESEARCH's original assumption. 1 of 51 sampled messages. |
| ~~Handshake~~ | ~~`notifications.joinhandshake.com`~~ | **DROPPED** — 0 of 51 sampled messages from this domain. Do not hardcode Handshake anywhere in 03-04+. |

Everything else present in the sample (a university career-platform domain on `12twenty`, iCIMS, and assorted per-employer `talent.*` vendor domains, etc.) is **intentionally not parsed** — it routes to review/dead-letter per the fail-loud design (REL-01/REL-02), consistent with the plan's existing routing rules.

No real email content or the refresh token value is recorded anywhere in this summary or committed to git, per the checkpoint's explicit instruction.

## Files Created/Modified
- `src/gmail/oauth.ts` - Server-only OAuth module (consent URL, token exchange/persistence, authed Gmail client)
- `src/app/api/auth/google/callback/route.ts` - OAuth redirect callback Route Handler
- `src/app/actions.ts` - Added `connectGmailAction` + `ConnectGmailResult` type; imported `dashboardMode`
- `src/components/ingestion-health.tsx` - Sidebar Ingestion Health block (client component)
- `src/components/ui/tooltip.tsx` - shadcn tooltip primitive (added via `npx shadcn add tooltip`, no new package.json deps — covered by the existing unified `radix-ui` package)
- `src/components/nav-shell.tsx` - Renders `IngestionHealth`, threads `isConnected` prop
- `src/app/layout.tsx` - Computes `isConnected` via `hasStoredToken()`, wraps app in `TooltipProvider`

## Decisions Made
- Used `google.auth.OAuth2` instead of a direct `google-auth-library` import to resolve a TypeScript structural-typing conflict between the top-level hoisted `google-auth-library@10.9.1` and `googleapis-common`'s nested `google-auth-library@10.5.0` (the latter is what `google.gmail({auth})` expects). No behavior difference — same underlying API (`generateAuthUrl`, `getToken`, `setCredentials`, `on`).
- Kept `google-auth-library` as a transitive dependency rather than adding it explicitly to `package.json` — it already resolves correctly at both compile time and runtime via `googleapis`, and the plan's `files_modified` list didn't include `package.json`.
- Sync now button renders disabled in both connected and not-connected states this plan (onClick wiring is explicitly deferred per the plan's task text); only the not-connected state adds the explanatory tooltip.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] OAuth2Client type incompatibility with `google.gmail()`**
- **Found during:** Task 1 (`npx tsc --noEmit` after writing `oauth.ts`)
- **Issue:** Importing `OAuth2Client` from the top-level `google-auth-library` package and passing an instance to `google.gmail({ auth: client })` failed to typecheck — `googleapis-common` (a `googleapis` dependency) ships its own nested copy of `google-auth-library`, and `google.gmail()`'s `auth` parameter type is bound to that nested copy's `OAuth2Client` class, not the top-level one. The two are structurally near-identical but nominally distinct (private field `redirectUri` declared in separate class bodies), so TypeScript rejected the assignment.
- **Fix:** Constructed the client via `google.auth.OAuth2` (re-exported from the `googleapis` package itself, backed by the same nested `google-auth-library` copy `google.gmail()` expects) instead of importing `OAuth2Client` directly. Same runtime API surface, no behavior change — only the import source changed.
- **Files modified:** `src/gmail/oauth.ts`
- **Verification:** `npx tsc --noEmit` passes cleanly; confirmed at the Node REPL that `google.auth.OAuth2` instances expose `generateAuthUrl`/`getToken`/`setCredentials`/`on` identically to `OAuth2Client`.
- **Committed in:** `c5cddde` (Task 1 commit)

**2. [Rule 1 - Bug] Task 2's automated verify grep false-positive on a doc comment**
- **Found during:** Task 2 acceptance-criteria verification
- **Issue:** The plan's grep check `if(/@\/db\/client/.test(s))` failed because my own explanatory comment in `ingestion-health.tsx` literally contained the string `@/db/client` while describing what the file does NOT import — a comment-text false positive, not an actual import.
- **Fix:** Reworded the comment to describe the constraint without using the literal import-path string, while preserving the same explanation.
- **Files modified:** `src/components/ingestion-health.tsx`
- **Verification:** Re-ran the exact grep check from the plan; passes. `npx tsc --noEmit` still clean.
- **Committed in:** `91c92f6` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 type-compatibility bug, 1 comment-wording false-positive on the plan's own literal grep check)
**Impact on plan:** No scope creep — both fixes were required to satisfy the plan's own stated verification commands. No behavior changes beyond what the plan specified.

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required
None beyond what the checkpoint itself required (completed): one-time browser OAuth consent signed in as the job-search Google account, and real-inbox sampling via a throwaway (never-committed) script.

## Next Phase Readiness

- **ING-01 is fully proven**: connect flow works end-to-end, refresh token persists across a dev-server restart, sidebar reflects connected/not-connected state correctly.
- **⚠️ 03-04-PLAN.md needs amendment before execution.** As currently written, 03-04's Task 3 builds `src/gmail/parsers/handshake.ts` as the first per-sender parser and `src/gmail/query.ts`'s `KNOWN_SENDER_DOMAINS` comment says "seeded from the 03-03 confirmed domains (Handshake, Workday broad myworkday.com, Ashby)" — both assumptions are now invalidated by this plan's real-inbox sampling (zero Handshake mail; SmartRecruiters confirmed instead). Whoever executes 03-04 (or re-plans it first) should build `parseSmartRecruiters` (or reorder to Workday-first, given it's the dominant sender at 11/51 messages) instead of `parseHandshake`, and seed `KNOWN_SENDER_DOMAINS` with `myworkday.com` / `smartrecruiters.com` / `ashbyhq.com` — never `notifications.joinhandshake.com`.
- The confirmed `Job Search` label id (`Label_11`, top-level, not nested) is ready for `resolveJobSearchLabelId` in 03-04's `query.ts` to match against exactly, with no nested-name fallback logic needed (though the `Job Search/Email Templates` sublabel should be explicitly excluded if a prefix-match approach is used instead of an exact-match).
- No blockers for 03-04 beyond the sender-list correction above.

---
*Phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing*
*Completed: 2026-07-30*

## Self-Check: PASSED

All claimed files verified present on disk (src/gmail/oauth.ts, src/app/api/auth/google/callback/route.ts, src/components/ingestion-health.tsx, src/components/ui/tooltip.tsx, src/app/actions.ts, src/components/nav-shell.tsx, src/app/layout.tsx). Both task commits (`c5cddde`, `91c92f6`) verified present in `git log`.
