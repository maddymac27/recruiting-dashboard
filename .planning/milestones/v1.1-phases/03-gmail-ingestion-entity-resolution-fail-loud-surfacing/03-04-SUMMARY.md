---
phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
plan: 04
subsystem: api
tags: [gmail, googleapis, mailparser, html-to-text, regex-parsing, vitest]

# Dependency graph
requires:
  - phase: 03-01
    provides: googleapis/mailparser/html-to-text installed and vetted, ingestedMessages/syncRuns schema, parsedEmailResult/reviewQueue/deadLetter validation schemas
  - phase: 03-03
    provides: getAuthedGmailClient() (server-only OAuth), and the CONFIRMED real-inbox ingestion constants (Job Search label id=Label_11 top-level; sender set myworkday.com/smartrecruiters.com/ashbyhq.com, Handshake dropped)
provides:
  - "src/gmail/types.ts: GmailClient interface + GmailLabel/ParsedMessage shapes — the seam every Gmail-touching module and test depends on"
  - "src/gmail/query.ts: buildSenderQuery (ING-02) + resolveJobSearchLabelId (ING-03, fail-loud) + KNOWN_SENDER_DOMAINS (myworkday.com/smartrecruiters.com/ashbyhq.com)"
  - "src/gmail/fetch.ts: listAllMessageIds (paginated) + fetchParsedMessage (raw base64url -> mailparser -> html-to-text)"
  - "src/gmail/client.ts: server-only real GmailClient implementation wrapping googleapis gmail('v1')"
  - "src/gmail/parsers/{index,workday}.ts: dispatchParser + parseWorkday, the first per-sender parser (D3-05 minimum bar: company + status + real event date)"
  - "tests/helpers/gmail.ts: makeFakeGmailClient — injectable fixture used by every Gmail unit test, no live Gmail API in tests"
affects: [03-05, 03-06, 03-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GmailClient interface as the sole seam between Gmail I/O and the rest of the codebase — src/gmail/client.ts is the only real implementation (server-only, wraps googleapis), everything else (query.ts, fetch.ts, parsers) is pure/testable over the interface"
    - "Domain-suffix -> parser dispatch table (src/gmail/parsers/index.ts) instead of a switch/if-chain — 03-07 extends this array with SmartRecruiters/Ashby entries rather than restructuring dispatch logic"
    - "Local ambient .d.ts declarations (src/types/vendor.d.ts) for untyped vendor packages instead of installing @types/* — avoids triggering a package-legitimacy checkpoint mid-autonomous-plan for a devDependency"

key-files:
  created:
    - src/gmail/types.ts
    - src/gmail/query.ts
    - src/gmail/fetch.ts
    - src/gmail/client.ts
    - src/gmail/parsers/index.ts
    - src/gmail/parsers/workday.ts
    - src/types/vendor.d.ts
    - tests/helpers/gmail.ts
    - tests/gmail/query.test.ts
    - tests/gmail/labels.test.ts
    - tests/gmail/fetch.test.ts
    - tests/gmail/parsers/workday.test.ts
  modified: []

key-decisions:
  - "First-parser target changed from Handshake to Workday (CRITICAL_SENDER_OVERRIDE) per 03-03's real-inbox sampling: 0/51 sampled messages were Handshake, 11/51 were Workday (dominant sender)."
  - "KNOWN_SENDER_DOMAINS seeded with the 03-03 confirmed set (myworkday.com/smartrecruiters.com/ashbyhq.com) — Handshake is never referenced anywhere in src/gmail."
  - "Workday matched by BROAD bare-domain suffix (myworkday.com), never a fixed full address — multi-tenant sender local-part (acmecorp@, globex@, initech@, umbrellacorp@…) confirmed by 03-03 sampling and RESEARCH Pitfall 5."
  - "resolveJobSearchLabelId matches an exact 'Job Search' name OR a nested '<Parent>/Job Search' suffix, but explicitly does NOT match a 'Job Search/<child>' sublabel (e.g. the real 'Job Search/Email Templates' sibling) — prevents a false match on a child label."
  - "Added src/types/vendor.d.ts with minimal ambient declarations for mailparser/html-to-text instead of installing @types/mailparser or @types/html-to-text — both packages exist on npm and would work, but installing any new package is excluded from Rule 3 auto-fix and requires a blocking-human package-legitimacy checkpoint; this plan is autonomous (no checkpoints), so a locally-authored .d.ts (exactly what tsc itself suggested) avoids the install entirely with no behavior risk."
  - "Workday parser regexes authored against synthetic fixtures (LOW-confidence, D3-02) modeling application-received/rejection/interview-invite shapes — explicitly flagged for re-validation against real Workday mail at the 03-06 live sync smoke test, per the plan's own ASSUMPTION note."

requirements-completed: [ING-02, ING-03, ING-04]

coverage:
  - id: D1
    description: "buildSenderQuery OR-joins from: clauses for the confirmed sender domains and appends after:YYYY/MM/DD when a lastSync date is given"
    requirement: "ING-02"
    verification:
      - kind: unit
        ref: "tests/gmail/query.test.ts#buildSenderQuery"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolveJobSearchLabelId returns the confirmed Job Search label id (incl. nested-name match) and throws loudly when the label is not found — never silently skips the label pass"
    requirement: "ING-03"
    verification:
      - kind: unit
        ref: "tests/gmail/labels.test.ts#resolveJobSearchLabelId"
        status: pass
    human_judgment: false
  - id: D3
    description: "Paginated message-id fetch via nextPageToken, and raw format=raw decode (base64url -> mailparser -> html-to-text) into a clean ParsedMessage"
    verification:
      - kind: unit
        ref: "tests/gmail/fetch.test.ts#listAllMessageIds and #fetchParsedMessage"
        status: pass
    human_judgment: false
  - id: D4
    description: "parseWorkday extracts company + status + a real event date (D3-05 minimum bar) from synthetic Workday fixtures (application-received/rejection/interview-invite) and returns null when any of the three is missing; dispatchParser routes a myworkday.com From address to it and null for unknown/unimplemented senders"
    requirement: "ING-04"
    verification:
      - kind: unit
        ref: "tests/gmail/parsers/workday.test.ts#parseWorkday and #dispatchParser"
        status: pass
    human_judgment: true
    rationale: "The parser regex is authored against synthetic fixtures, not real Workday mail (D3-02) — accuracy against this user's actual inbox templates can only be judged at the 03-06 live sync smoke test, not from unit tests alone."

duration: ~20min
completed: 2026-07-30
status: complete
---

# Phase 3 Plan 04: Gmail Fetch Pipeline + Workday Parser Summary

**Gmail read pipeline (injectable-client query builder, fail-loud label resolver, paginated raw-message fetch/decode) plus the first per-sender parser — retargeted from the plan's original Handshake assumption to Workday, the confirmed-dominant real sender, per 03-03's real-inbox sampling.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-30T21:22:00Z (approx.)
- **Completed:** 2026-07-30T21:42:00Z
- **Tasks:** 3/3
- **Files modified:** 12 (all new)

## Accomplishments
- `src/gmail/types.ts` — `GmailClient` interface (`listMessages`/`getMessageRaw`/`listLabels`) + `GmailLabel`/`ParsedMessage` shapes, the seam every Gmail module and test is written against
- `src/gmail/query.ts` — `buildSenderQuery` (OR-joined `from:` clauses + optional `after:YYYY/MM/DD`), `resolveJobSearchLabelId` (throws loudly on a missing label — never a silent skip), `KNOWN_SENDER_DOMAINS = [myworkday.com, smartrecruiters.com, ashbyhq.com]`
- `src/gmail/fetch.ts` — `listAllMessageIds` (paginates `listMessages` via `nextPageToken` until exhausted) and `fetchParsedMessage` (base64url decode → `mailparser` `simpleParser` → `html-to-text` `convert` when HTML-only)
- `src/gmail/client.ts` — server-only `getGmailClient()` wrapping the real `googleapis` `gmail('v1')` instance from `getAuthedGmailClient()`; `q` passed at the top level of `messages.list` per RESEARCH Pitfall 4
- `src/gmail/parsers/workday.ts` — `parseWorkday`: regex-extracts company + role + a real-world event date from three shapes (application-received → Applied, rejection → Rejected, interview invite → Interview); returns `null` below the D3-05 bar; date always comes from body text, never the message's received-time
- `src/gmail/parsers/index.ts` — `dispatchParser` routes a From address to its parser by domain suffix (extensible array, currently only `myworkday.com` → `parseWorkday`); returns `null` for `smartrecruiters.com`/`ashbyhq.com` (parsers land in 03-07) and any unknown sender
- `tests/helpers/gmail.ts` — `makeFakeGmailClient` injectable fixture (pagination via offset-encoded `pageToken`, `rawById`/`labels` fixtures) — no live Gmail API call anywhere in the test suite
- 4 new test files, 20 new tests, all passing; full suite (92 tests / 22 files) green

## Task Commits

Each task was committed atomically:

1. **Task 1: GmailClient interface + mock + query builder + label resolution** - `8ea30ac` (feat)
2. **Task 2: Fetch pipeline (pagination + raw decode + MIME/HTML→text) + real client wrapper** - `a28e266` (feat)
3. **Task 3: Workday parser + dispatch (D3-05 minimum bar)** - `2a6266d` (feat)

**Plan metadata:** (this commit, following SUMMARY write)

## Files Created/Modified
- `src/gmail/types.ts` - `GmailClient` interface + `GmailLabel`/`ParsedMessage` types
- `src/gmail/query.ts` - `buildSenderQuery`, `resolveJobSearchLabelId`, `KNOWN_SENDER_DOMAINS`
- `src/gmail/fetch.ts` - `listAllMessageIds`, `fetchParsedMessage`
- `src/gmail/client.ts` - server-only real `GmailClient` wrapping googleapis
- `src/gmail/parsers/index.ts` - `SenderParser` type, `dispatchParser`
- `src/gmail/parsers/workday.ts` - `parseWorkday`
- `src/types/vendor.d.ts` - ambient declarations for `mailparser`/`html-to-text` (neither ships types)
- `tests/helpers/gmail.ts` - `makeFakeGmailClient`
- `tests/gmail/query.test.ts`, `tests/gmail/labels.test.ts`, `tests/gmail/fetch.test.ts`, `tests/gmail/parsers/workday.test.ts` - unit tests

## Decisions Made
- Retargeted the first per-sender parser from Handshake to Workday per the CRITICAL_SENDER_OVERRIDE (03-03's real-inbox sampling found 0 Handshake mail, 11/51 Workday). `KNOWN_SENDER_DOMAINS` never references Handshake anywhere.
- Workday matched by broad `myworkday.com` domain suffix rather than a fixed address, given its confirmed multi-tenant sender pattern.
- `resolveJobSearchLabelId` matches exact `"Job Search"` or a nested `<Parent>/Job Search` suffix, explicitly excluding a `Job Search/<child>` sublabel (guards against the real `Job Search/Email Templates` sibling being mistaken for a match).
- `dispatchParser` uses an extensible domain-suffix → parser lookup table rather than a switch statement, so 03-07's SmartRecruiters/Ashby parsers are a one-line addition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing type declarations for `mailparser`/`html-to-text` broke `npx tsc --noEmit`**
- **Found during:** Task 2 (`npx tsc --noEmit` verification after writing `fetch.ts`)
- **Issue:** Neither `mailparser` nor `html-to-text` ships its own TypeScript types, and no `@types/mailparser`/`@types/html-to-text` package is installed — `tsc` failed with `TS7016: Could not find a declaration file for module`.
- **Fix:** Added `src/types/vendor.d.ts` with minimal ambient `declare module` blocks scoped to exactly the surface `fetch.ts` uses (`simpleParser`, `convert`, `ParsedMail.from/subject/date/text/html`) — this is the exact fix `tsc`'s own error message suggested, and avoids a new `npm install` (which, per the executor's Rule 3 exclusion, would require a blocking-human package-legitimacy checkpoint incompatible with this plan's `autonomous: true` frontmatter).
- **Files modified:** `src/types/vendor.d.ts` (new)
- **Verification:** `npx tsc --noEmit` passes cleanly; full test suite still green.
- **Committed in:** `a28e266` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking compile issue, resolved without a new dependency)
**Impact on plan:** No scope creep — the fix is a type-only declaration file with zero runtime behavior, required to satisfy the plan's own `npx tsc --noEmit` verification command.

## Issues Encountered
None beyond the one auto-fixed deviation above.

## User Setup Required
None - no external service configuration required. (Gmail OAuth was already completed in 03-03.)

## Next Phase Readiness
- The `GmailClient` interface, injectable fake, query builder, fail-loud label resolver, paginated fetch/decode, and the first per-sender parser (Workday) are all in place and unit-tested with zero live Gmail calls.
- `src/gmail/parsers/index.ts`'s dispatch table is ready for 03-07 to extend with `parseSmartRecruiters`/`parseAshby` — both domains are already in `KNOWN_SENDER_DOMAINS` and the targeted query, so their mail is fetched today; it simply has no parser yet and correctly routes to dead-letter (fail-loud, not a gap).
- The Workday parser's regexes are LOW-confidence (synthetic fixtures only, D3-02) — 03-06's live sync smoke test is the checkpoint that validates them against this user's real inbox; expect some tuning there, which is the plan's own explicit expectation, not a blocker.
- 03-06 (the sync orchestrator, per its own objective text) composes `buildSenderQuery` + `resolveJobSearchLabelId` + `listAllMessageIds` + `fetchParsedMessage` + `dispatchParser` from this plan with the routing domain from 03-05 (already complete) into the end-to-end per-message ingestion loop described in RESEARCH Pitfall 2/3 (async work before any `db.transaction`, one transaction per message).
- ⚠️ **03-06-PLAN.md and 03-07-PLAN.md, as currently written, still target Handshake** ("reliably parses Handshake into dated transition events", "add the Workday and Ashby per-sender parsers ... Handshake from 03-06 + these two") — both are now stale for the same reason 03-04's original plan text was (03-03's real-inbox sampling: 0/51 Handshake). Whoever executes 03-06 should treat Workday (this plan) as the one already-built/proven parser and adjust 03-06/03-07's scope to SmartRecruiters + Ashby (or re-plan first) rather than building a Handshake parser that has no real mail to validate against.
- No blockers for 03-06 beyond the sender-list correction flagged above.

---
*Phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing*
*Completed: 2026-07-30*

## Self-Check: PASSED

All 12 claimed files verified present on disk (src/gmail/{types,query,fetch,client}.ts, src/gmail/parsers/{index,workday}.ts, src/types/vendor.d.ts, tests/helpers/gmail.ts, tests/gmail/{query,labels,fetch}.test.ts, tests/gmail/parsers/workday.test.ts). All three task commits (`8ea30ac`, `a28e266`, `2a6266d`) verified present in `git log`.
