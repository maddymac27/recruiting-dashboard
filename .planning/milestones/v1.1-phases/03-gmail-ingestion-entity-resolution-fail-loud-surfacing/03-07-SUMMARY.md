---
phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing
plan: 07
subsystem: api
tags: [gmail, regex-parsing, vitest, dispatch-table]

# Dependency graph
requires:
  - phase: 03-04
    provides: "src/gmail/parsers/{index.ts (dispatchParser + SenderParser type + domain-suffix table), workday.ts (parseWorkday reference pattern)}, src/gmail/types.ts (ParsedMessage), tests/helpers/gmail.ts (injected fake client, not needed directly by parser unit tests), the parsedEmailResult D3-05 validation schema"
  - phase: 03-03
    provides: "CONFIRMED real-inbox sender set (Workday/SmartRecruiters/Ashby, Handshake dropped) that supersedes this plan's original Workday+Ashby objective text"
provides:
  - "src/gmail/parsers/smartrecruiters.ts: parseSmartRecruiters — regex extraction of company + status + real event date from synthetic SmartRecruiters fixtures (D3-05 gated, null below the bar)"
  - "src/gmail/parsers/ashby.ts: parseAshby — same shape for synthetic Ashby fixtures"
  - "dispatchParser (src/gmail/parsers/index.ts) extended to route smartrecruiters.com and ashbyhq.com to their parsers — all three confirmed real senders (Workday/SmartRecruiters/Ashby) now have live parsers"
affects: [03-09, 03-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Each per-sender parser is a standalone module exporting one function that mirrors parseWorkday's exact shape: shared-opening regex for company+role, three status-keyword regexes (Rejected/Interview/Applied) each capturing a date, parsedEmailResult.safeParse() gate before returning, and a same-shaped LOW-confidence D3-02 comment block flagging synthetic-fixture provenance."
    - "dispatchParser's domain-suffix table (src/gmail/parsers/index.ts) is a flat array literal extended by one entry per new parser — no dispatch-logic changes needed to add a sender."

key-files:
  created:
    - src/gmail/parsers/smartrecruiters.ts
    - src/gmail/parsers/ashby.ts
    - tests/gmail/parsers/smartrecruiters.test.ts
    - tests/gmail/parsers/ashby.test.ts
  modified:
    - src/gmail/parsers/index.ts
    - tests/gmail/parsers/workday.test.ts

key-decisions:
  - "Followed the CRITICAL_SENDER_OVERRIDE, not the stale plan text: built parseSmartRecruiters (Task 1) + parseAshby (Task 2) instead of the plan's literal 'Workday + Ashby' objective — Workday was already built in 03-04, and 03-03's real-inbox sampling confirmed SmartRecruiters (not Handshake) as the third sender. No Handshake parser was built."
  - "Removed workday.test.ts's now-obsolete 'returns null for a sender with no parser yet (SmartRecruiters, Ashby)' assertions incrementally as each domain gained a real parser in this plan, rather than leaving a stale/misleading test."
  - "Both new parsers are near-exact structural clones of parseWorkday (same LOW-confidence D3-02 comment block, same three-regex status dispatch, same parsedEmailResult gate) rather than introducing any new extraction strategy — matches 03-PATTERNS.md's stated 'no existing email-parsing analog, author fresh but consistent' guidance and the plan's own explicit instruction to mirror parseWorkday."

requirements-completed: [ING-02, ING-04]

coverage:
  - id: D1
    description: "parseSmartRecruiters extracts company + status + a real event date from synthetic SmartRecruiters fixtures (application-received/rejection/interview-invite shapes) and returns null when the D3-05 bar isn't met; dispatchParser routes a smartrecruiters.com From address to it"
    requirement: "ING-04"
    verification:
      - kind: unit
        ref: "tests/gmail/parsers/smartrecruiters.test.ts#parseSmartRecruiters and #dispatchParser (SmartRecruiters)"
        status: pass
    human_judgment: true
    rationale: "The parser regex is authored against synthetic fixtures (LOW confidence, D3-02), not real SmartRecruiters mail — accuracy against this user's actual inbox templates can only be judged once a live sync runs against real mail, not from unit tests alone."
  - id: D2
    description: "parseAshby extracts company + status + a real event date from synthetic Ashby fixtures and returns null below the D3-05 bar; dispatchParser routes an ashbyhq.com From address to it — completing the 3-sender set (Workday/SmartRecruiters/Ashby) ING-04 requires"
    requirement: "ING-04"
    verification:
      - kind: unit
        ref: "tests/gmail/parsers/ashby.test.ts#parseAshby and #dispatchParser (Ashby)"
        status: pass
    human_judgment: true
    rationale: "Same synthetic-fixture caveat as D1 (D3-02) — real-inbox validation is outside this plan's scope (no live sync smoke test task was included)."
  - id: D3
    description: "Full test suite (24 files / 105 tests) and npx tsc --noEmit remain green after both additions, confirming no regression to the Workday parser or dispatch table"
    verification:
      - kind: unit
        ref: "npx vitest run --exclude '**/.claude/**' && npx tsc --noEmit"
        status: pass
    human_judgment: false

duration: ~12min
completed: 2026-07-31
status: complete
---

# Phase 3 Plan 07: SmartRecruiters + Ashby Parsers Summary

**parseSmartRecruiters and parseAshby regex parsers added to the Gmail dispatch table, completing the confirmed 3-sender set (Workday/SmartRecruiters/Ashby) ING-04 requires — built per the CRITICAL_SENDER_OVERRIDE rather than the plan's stale "Workday + Ashby" objective text.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-31T14:38:00Z (approx.)
- **Completed:** 2026-07-31T14:50:05Z
- **Tasks:** 2/2
- **Files modified:** 6 (4 new, 2 modified)

## Accomplishments
- `src/gmail/parsers/smartrecruiters.ts` — `parseSmartRecruiters`: regex-extracts company + role + a real event date from three synthetic shapes (application-received → Applied, rejection → Rejected, interview invite → Interview); returns `null` below the D3-05 bar; date always comes from body text, never the message's received-time
- `src/gmail/parsers/ashby.ts` — `parseAshby`: same shape, tuned to Ashby's synthetic notification phrasing
- `src/gmail/parsers/index.ts` — `dispatchParser`'s domain-suffix table extended with `smartrecruiters.com` → `parseSmartRecruiters` and `ashbyhq.com` → `parseAshby`; all three confirmed real senders now dispatch to live parsers, and the file's header comment updated to reflect this (Handshake never referenced)
- 10 new tests across two new test files (parse success × 3 shapes each, below-bar null, missing-company null, dispatch-match, unknown-sender null per parser); `workday.test.ts`'s stale "no parser yet" assertions removed incrementally as each domain gained a real parser
- Full suite green: 24 test files / 105 tests; `npx tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: parseSmartRecruiters + dispatch + tests** - `9198015` (feat)
2. **Task 2: parseAshby + dispatch + tests** - `a51d841` (feat)

**Plan metadata:** (this commit, following SUMMARY write)

## Files Created/Modified
- `src/gmail/parsers/smartrecruiters.ts` - `parseSmartRecruiters`
- `src/gmail/parsers/ashby.ts` - `parseAshby`
- `src/gmail/parsers/index.ts` - `dispatchParser` domain-suffix table extended with both new parsers
- `tests/gmail/parsers/smartrecruiters.test.ts` - unit tests for `parseSmartRecruiters` + dispatch
- `tests/gmail/parsers/ashby.test.ts` - unit tests for `parseAshby` + dispatch
- `tests/gmail/parsers/workday.test.ts` - removed now-stale "no parser yet" assertions for SmartRecruiters/Ashby

## Decisions Made
- Applied the `CRITICAL_SENDER_OVERRIDE`: built `parseSmartRecruiters` + `parseAshby`, not a second Workday parser or a Handshake parser — Workday was already delivered in 03-04, and 03-03's real-inbox sampling replaced Handshake with SmartRecruiters in the confirmed sender set.
- Both parsers are structural clones of `parseWorkday` (same three-regex status dispatch, same D3-02 LOW-confidence comment block, same `parsedEmailResult` validation gate) rather than inventing a new extraction approach, per the plan's own "mirror the Handshake/Workday parsers" instruction and 03-PATTERNS.md's guidance for files with no closer analog.
- `dispatchParser`'s header comment was rewritten (not just appended to) once all three domains had live parsers, so it accurately states the finished state rather than accumulating stale "not yet built" caveats.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ashby regex mismatch on synthetic fixture whitespace and phrasing**
- **Found during:** Task 2 verification (`npx vitest run` on the new `ashby.test.ts`)
- **Issue:** `REJECTED_PATTERN` required the literal phrase "not move forward" but the fixture text read "not to move forward"; `INTERVIEW_PATTERN` required a literal space between "for" and the date but the fixture's line-wrapped text placed a newline there instead — both caused `parseAshby` to return `null` on fixtures that should have matched.
- **Fix:** Widened `REJECTED_PATTERN` to accept an optional "to" (`not (?:to )?move forward`) and changed `INTERVIEW_PATTERN`'s literal space to `\s+` so it tolerates a line-wrap between "for" and the date.
- **Files modified:** `src/gmail/parsers/ashby.ts`
- **Verification:** Re-ran `tests/gmail/parsers/ashby.test.ts` — all 7 tests pass; full suite (24 files / 105 tests) still green.
- **Committed in:** `a51d841` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 regex bug caught by the plan's own TDD verification loop)
**Impact on plan:** No scope creep — the fix only widened two regexes to correctly match the fixture text the task itself specified; both regexes still fail loud (return `null`) on genuinely unparseable content.

## Issues Encountered
None beyond the one auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three confirmed real senders (Workday, SmartRecruiters, Ashby) now have live, unit-tested parsers registered in `dispatchParser` — ING-04's "2-3 real senders" requirement is fully met with zero Handshake references anywhere in `src/gmail`.
- Both new parsers' regexes are LOW-confidence (D3-02, synthetic fixtures only) exactly like `parseWorkday` was at 03-04 — this plan did not include a live-sync smoke test task (unlike 03-06's Workday smoke test), so SmartRecruiters/Ashby accuracy against this user's real inbox templates remains unverified until a live sync actually processes mail from those domains. Flagged in `coverage` as `human_judgment: true` for that reason.
- `src/gmail/parsers/index.ts`'s dispatch table is now feature-complete for the current sender set; a future sender would be a one-line addition following the same pattern.
- No blockers for downstream plans (03-09, 03-10) beyond the standing, already-tracked risk in `STATE.md` (REL-04 silent recall gap for unlisted ATS domains).

---
*Phase: 03-gmail-ingestion-entity-resolution-fail-loud-surfacing*
*Completed: 2026-07-31*

## Self-Check: PASSED

All 7 claimed files verified present on disk (src/gmail/parsers/{smartrecruiters,ashby,index}.ts, tests/gmail/parsers/{smartrecruiters,ashby,workday}.test.ts, this SUMMARY.md). Both task commits (`9198015`, `a51d841`) verified present in `git log`.
