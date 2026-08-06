---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Outreach & Email Threading
current_phase: 7
current_phase_name: Editable Columns Across Pipeline, Contacts & Outreach
status: planning
stopped_at: Phase 7 context gathered
last_updated: "2026-08-06T18:15:25.255Z"
last_activity: 2026-08-06
last_activity_desc: Phase 06 complete; inserted Phase 7 (Editable Columns) before the Gmail work (Outreach auto-capture → 8, Email threading → 9)
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 5
  completed_plans: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-04)

**Core value:** The dashboard stays accurate without me remembering to update it.
**Current focus:** Phase 7 — Editable Columns Across Pipeline, Contacts & Outreach

## Current Position

Phase: 7 — Editable Columns Across Pipeline, Contacts & Outreach
Plan: Not started
Status: Ready to discuss/plan
Last activity: 2026-08-06 — Phase 06 complete; inserted Phase 7 (Editable Columns) before the Gmail work (Outreach auto-capture → 8, Email threading → 9)

## Performance Metrics

**Velocity:**

- Total plans completed: 34
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | - | - |
| 02 | 6 | - | - |
| 03 | 10 | - | - |
| 4 | 4 | - | - |
| 5 | 4 | - | - |
| 06 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: none yet
- Trend: N/A

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 25min | 4 tasks | 16 files |
| Phase 01 P02 | 20min | 3 tasks | 7 files |
| Phase 01 P03 | unknown (recovery pass) | 3 tasks | 6 files |
| Phase 01 P04 | 65min | 3 tasks | 6 files |
| Phase 01 P05 | 45min | 3 tasks | 6 files |
| Phase 02 P01 | 25min | 3 tasks | 20 files |
| Phase 02 P02 | 9 min | 3 tasks | 6 files |
| Phase 02 P03 | 40min | 3 tasks | 10 files |
| Phase 02 P04 | 20min | 2 tasks | 8 files |
| Phase 02 P05 | 45min | 3 tasks | 12 files |
| Phase 03 P01 | 25min | 2 tasks | 6 files |
| Phase 03 P02 | 8min | 2 tasks | 2 files |
| Phase 03 P05 | 20min | 2 tasks | 6 files |
| Phase 03 P03 | ~10min active + checkpoint pause | 3 tasks | 7 files |
| Phase 03 P04 | ~20min | 3 tasks | 12 files |
| Phase 03 P08 | 40min | 3 tasks | 8 files |
| Phase 03 P07 | ~12min | 2 tasks | 6 files |
| Phase 03 P09 | 15min | 2 tasks | 5 files |
| Phase 03 P06 | ~90min | 3 tasks | 11 files |
| Phase 03 P10 | 25min | 3 tasks | 4 files |
| Phase 04 P01 | 15min | 3 tasks | 10 files |
| Phase 04 P02 | 20min | 3 tasks | 5 files |
| Phase 04 P03 | ~35min | 3 tasks | 7 files |
| Phase 05 P01 | 25min | 3 tasks | 12 files |
| Phase 05 P02 | 12min | 2 tasks | 3 files |
| Phase 05 P03 | 20min | 3 tasks | 4 files |
| Phase 05 P04 | 15min | 2 tasks | 4 files |
| Phase 06 P01 | 4min | 2 tasks | 7 files |
| Phase 06 P02 | 10min | 2 tasks | 2 files |
| Phase 06 P03 | 3min | 3 tasks | 4 files |
| Phase 06 P05 | 6min | 2 tasks | 4 files |
| Phase 06 P04 | ~12min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmapping (v1.1): Split Outreach into two phases rather than one — Phase 6 delivers the manual Outreach slice (new outreach table + logging form + filterable tab + response tracking, OUT-01/03/04/05/06), shippable and verifiable before any Gmail code; Phase 8 layers the heavier fail-loud auto-capture path (OUT-02) on top (renumbered from 7 when Editable Columns was inserted as Phase 7 on 2026-08-06). This mirrors the v1.0 Phase 2 (manual) → Phase 3 (Gmail ingestion) separation and isolates the core failure mode (a self-forwarded outreach that silently fails to capture) into its own phase with its own fail-loud success criteria.
- Roadmapping (v1.1): Email Threading (MAIL-01/02/03) kept as its own phase (Phase 9, renumbered from 8), independent of Outreach — it extends the existing Phase-3 Gmail ingestion (subject + thread id capture) plus a per-application "Email thread" dropdown and manual email→application tagging.
- Roadmapping (v1.1): Continued phase numbering from v1.0 (Phases 6→8, not reset to 1); backlog Phases 999.1/999.2 left untouched.
- Roadmapping (v1.1): Every v1.1 phase set to Mode: mvp (vertical slices) since all three are new data-model + write-path features, consistent with how Phase 5 was built. Both new tables (outreach, email thread metadata) must exist in the real AND demo stores via additive Drizzle migrations, with no path that leaks real data into demo.
- Roadmapping: Merged research's 8-9 step build order into 5 standard-granularity phases, keeping the fail-loudly rule intact (review queue + dead-letter ship in the same phase as Gmail ingestion, Phase 3, not later).
- Roadmapping: CAP-03 (override persistence across syncs) placed in Phase 3 rather than Phase 1, since it can't be meaningfully verified until a real parser/sync exists to override.
- Roadmapping: REL-04 (silent recall gap of targeted sender search) is surfaced as a visible, unresolved UI-level risk in Phase 3 — not treated as solved by this roadmap.
- [Phase ?]: Bumped drizzle-orm/drizzle-kit from pinned 0.45.x/0.31.x to 1.0.0-rc.4 — stable 0.45.x has no drizzle-orm/node-sqlite export, required to fulfill D-14 (node:sqlite driver)
- [Phase ?]: Used drizzle-orm 1.0.0 single-object drizzle({ client }) constructor form instead of the 0.45.x two-argument form for the node-sqlite driver
- [Phase ?]: Added dashboardMode export to client.ts alongside db — the only way to satisfy the health route's mode field without violating the single-reader-of-DASHBOARD_MODE must-have.
- [Phase ?]: Installed @types/react + @types/react-dom (devDependencies) after developer-approved package-legitimacy checkpoint — closes a scaffold gap from 01-01 where no .tsx file could type-check.
- [Phase ?]: 01-03: TDD RED->GREEN commit granularity lost due to mid-plan executor interruption; tests still fully prove DATA-01/02/03/06 behaviors
- [Phase ?]: 01-04: Override write path types fieldName as OverridableField for compile-time allow-list guidance, on top of runtime overrideInput.parse enforcement
- [Phase ?]: seedLookups uses onConflictDoNothing on single-column unique label (not composite-key upsert)
- [Phase ?]: Saved-not-applied fixtures get one Saved status event so currentStageId is never null
- [Phase ?]: Shipped 17 invented demo companies covering all 8 stages (above the 15/5 minimums) for screen-share density
- [Phase ?]: 02-01: Installed class-variance-authority/lucide-react/clsx/tailwind-merge explicitly (RESEARCH-vetted versions) after shadcn CLI copied component source importing them without adding to package.json
- [Phase ?]: 02-01: Let shadcn CLI resolve unified radix-ui package + next-themes instead of individual @radix-ui/react-* packages RESEARCH anticipated (RESEARCH said not to hand-pin Radix versions)
- [Phase ?]: 02-01: Left sidebar nav shell chosen over top nav, matching UI-SPEC's sidebar/nav-background color-role wording
- [Phase ?]: 02-02: Repaired a pre-existing stale __drizzle_migrations journal entry in data/real.sqlite (recorded a since-renamed Phase 1 migration folder) so the postingUrl migration could apply cleanly to the real store.
- [Phase ?]: 02-02: appendStatusEventTx(tx, validated) extracted as the non-transaction-owning helper mirroring recomputeCurrentStage's DbOrTx shape; appendStatusEvent stays the public validate-then-transaction wrapper, unblocking Wave 3 write slices.
- [Phase ?]: 02-03: Kept RESEARCH's flagged KPI bucket rule as-is (applied = dateApplied not null, overlapping total by construction) — cheap to revisit if UAT prefers mutually-exclusive buckets.
- [Phase ?]: 02-03: PipelineBoardSkeleton kept within Task 2's declared file scope and wired into a new src/app/loading.tsx (Rule 2 deviation) so the loading/board UI-SPEC backstop is actually delivered via Next.js's automatic route-level Suspense boundary.
- [Phase ?]: 02-04: Assigned an explicit source-order index to every timeline entry before sorting (rather than relying on JS Array.sort stability) so the equal-occurredAt tiebreak is deterministic and independently testable
- [Phase ?]: 02-04: Stage badge on the detail header uses Badge variant=secondary, not the default primary/accent variant — UI-SPEC reserves accent for CTAs/focus rings
- [Phase ?]: 02-05: quickSaveApplication inserts directly against applications inside its own transaction rather than delegating to createApplication, which would silently strip postingUrl via newApplicationInput.parse's default strip-unknown-keys behavior.
- [Phase ?]: 02-05: Extended BoardApplication (board.ts) with companyId/roleTypeId/sourceId/postingUrl so the inline edit dialog can pre-fill every field from the board's own read model, avoiding a second per-card detail fetch.
- [Phase ?]: 02-05: Added an edit-application trigger to application-card.tsx (not explicitly named in Task 3's action text) since CAP-02 had no other UI entry point in this plan's declared scope; threaded stages/roleTypes/sources props through board-column.tsx/pipeline-board.tsx to wire it.
- [Phase ?]: 02-05: updateApplicationAction accepts an optional companyName (resolved/created like quick-save) since companies aren't a fixed lookup and the client can't supply a numeric companyId for a free-text company field.
- [Phase 03]: Package-legitimacy checkpoint (03-01) confirmed googleapis/google-auth-library/mailparser/html-to-text publisher identity before install; not auto-approved — gate=blocking-human protocol requires explicit human confirmation for supply-chain trust decisions
- [Phase ?]: 03-02: getApplicationDetail wires getMergedField for all six OVERRIDABLE_FIELDS (CAP-03 read-path fix); date_applied bridged via ISO-string round trip; outcome stays derived from the raw (unmerged) current stage join per plan instruction
- [Phase ?]: Same-timestamp tiebreak: added desc(id) secondary sort to all newest-first review-queue/dead-letter/sync-run queries (unixepoch() has 1s resolution)
- [Phase ?]: finishSyncRun narrows newSyncRunInput's optional status to a required success|failed union so a run can never be left in running by omission
- [Phase ?]: 03-03: Used google.auth.OAuth2 (via googleapis) instead of a direct google-auth-library import — googleapis-common ships its own nested google-auth-library copy that google.gmail() expects, structurally incompatible with the top-level hoisted package
- [Phase ?]: 03-03: Real-inbox sampling confirmed Job Search label id=Label_11 (top-level, not nested) and CHANGED the confirmed sender set to Workday (myworkday.com, dominant)/SmartRecruiters (smartrecruiters.com, NEW)/Ashby (ashbyhq.com) — Handshake DROPPED (0 of 51 sampled messages), superseding 03-RESEARCH.md's Handshake-first assumption
- [Phase ?]: 03-04: Retargeted first parser from Handshake to Workday (0/51 sampled messages were Handshake, 11/51 Workday) per 03-03's real-inbox sampling; KNOWN_SENDER_DOMAINS never references Handshake
- [Phase ?]: 03-04: Workday matched by broad myworkday.com domain suffix (never a fixed address) given its confirmed multi-tenant sender pattern
- [Phase ?]: 03-04: Added src/types/vendor.d.ts ambient declarations for mailparser/html-to-text instead of installing @types/* packages, avoiding a package-legitimacy checkpoint mid-autonomous-plan
- [Phase ?]: 03-08: review-queue-item.tsx reuses ContactConversationForm's ExistingContactOption type + field layout for Log as conversation, but dispatches through logReviewAsConversationAction (one composed action) rather than embedding the component instance (which is hardwired to job/[id]/actions.ts's two-step calls)
- [Phase ?]: 03-08: Added getReviewItemById to src/domain/review-queue.ts so review actions read the item's server-stored parsedStageLabel/parsedEventDate/sourceMessageId rather than trusting client-resubmitted copies
- [Phase ?]: 03-08: Review-queue pagination implemented via ?pendingLimit/?resolvedLimit URL search params (server-rendered Load-more Link) instead of a client-side pagination component, keeping page.tsx a pure Server Component
- [Phase ?]: 03-07: Followed CRITICAL_SENDER_OVERRIDE — built parseSmartRecruiters + parseAshby (not a second Workday parser or Handshake), completing the confirmed 3-sender set (Workday/SmartRecruiters/Ashby)
- [Phase ?]: 03-07: Both new parsers are structural clones of parseWorkday (same three-regex status dispatch, D3-02 LOW-confidence comment block, parsedEmailResult validation gate)
- [Phase ?]: 03-09: dead-letter Actions column (View raw email) rendered in both Pending and Resolved tabs, not only Pending, since diagnosing a resolved item's original failure retains value
- [Phase ?]: 03-09: Added src/app/dead-letter/loading.tsx (not in files_modified) mirroring 03-08's review/loading.tsx Skeleton backstop for route-level Suspense loading state
- [Phase ?]: 03-06: unmatched-company Applied confirmations now auto-create the application (source Company site / ATS) instead of routing to review — real-inbox validation showed this is the dominant case (3/3 real apps this run); Rejected/Interview for an unknown company still routes to review
- [Phase ?]: 03-06: D3-05 event-date policy revised — prefer an explicit date, fall back to the message's received time when none exists (resolveOccurredAt) — real inbox had zero ATS confirmations with an explicit calendar date in body
- [Phase ?]: 03-06: runGmailSync gained a permanent third pass (reparseDeadLetter) that re-fetches and re-parses every pending dead_letter row on each Sync now click, resolving backlog automatically once a sender's parser is fixed
- [Phase ?]: 03-06: rewrote Workday/SmartRecruiters/Ashby parser extraction patterns against real ATS templates — the 03-04/03-07 synthetic-fixture regexes matched zero real messages on first live sync
- [Phase ?]: 03-10: REL-04 risk note renders in demo mode too (not just real mode) — it discloses a fixed pipeline-design limitation, not live sync state
- [Phase ?]: 03-10: Count badges (Review/Dead-letter) render regardless of isConnected so prior-session queue state stays visible at a glance
- [Phase ?]: 03-10: Added a running-status last-sync line ('Syncing…') beyond the plan's three named states, so every SyncRunStatus value is handled
- [Phase ?]: 04-01: historyId cursor carried on sync_runs row (not a dedicated table) per D4-05 default; used_fallback implemented as its own boolean column per RESEARCH open question 2
- [Phase ?]: 04-01: busy_timeout=5000 centralized in openSqliteFile so every production connection (client.ts, migrate.ts, seed scripts, future scripts/sync.ts) inherits it automatically
- [Phase ?]: 04-02: runGmailSync's { lastSync, historyId } param kept as a required (non-optional) intersection type per RESEARCH — every call site passes historyId explicitly (null on cold start)
- [Phase ?]: 04-02: GaxiosError test fixtures build config/response via ConstructorParameters<typeof Common.GaxiosError> instead of naming gaxios's non-exported GaxiosOptionsPrepared type directly
- [Phase ?]: 04-02: usedFallback initialized to historyId !== null and flipped false only on a successful fetchHistoryMessageIds call, so a cold-start call is never mistakenly flagged as a fallback
- [Phase ?]: 04-02: syncGmailAction derives both lastSync and historyId from getLatestSuccessfulSyncRun (last SUCCESS, not merely latest run) — one code path shared with the future scripts/sync.ts (D4-05)
- [Phase ?]: 04-03: scripts/sync.ts defers the server-only-guarded Gmail client/oauth imports to a dynamic import() inside the runnable body (not top-level) so importing the module for shouldThrottle/AT_LOGON_THROTTLE_MS never triggers the server-only throw; real invocation requires --conditions=react-server
- [Phase ?]: 04-03: scripts/register-task.ps1 wraps its action in cmd.exe /c set DASHBOARD_MODE=real && npx.cmd tsx --conditions=react-server scripts/sync.ts, scoping both the mode env var and node resolution condition to the one child process rather than a persistent machine env var
- [Phase ?]: 04-03: AT_LOGON_THROTTLE_MS=4h (D4-A1) and STALE_THRESHOLD_MS=2 days (D4-A2) confirmed as the planning defaults
- [Phase ?]: 05-01: Added optional trigger prop to StageChangeDialog/ContactConversationForm (not in files_modified) so the Today view can use UI-SPEC's labeled buttons without forking dialog/Server Action logic; every existing call site keeps its original trigger unchanged
- [Phase ?]: 05-01: Split src/app/loading.tsx into board/loading.tsx (verbatim) + a new row-shaped Today loading.tsx alongside the D5-04 route move, satisfying the plan's Skeleton-loading backstop truth
- [Phase ?]: 05-01: application-card.tsx (board-card gone-quiet overlay, UI-SPEC Surface 3) intentionally not touched — not in this plan's files_modified, deferred to a later 05-0x plan
- [Phase ?]: D5-07: recharts install gated behind blocking-human package-legitimacy checkpoint (never auto-approved) — approved by user; shadcn chart block used to install, progress block deliberately skipped
- [Phase ?]: 05-03: responseRatePct denominator kept as the funnel's Applied bucket (event-sourced), not applications.dateApplied, for numerator/denominator consistency (D5-07)
- [Phase ?]: 05-03: Summary tiles rendered inline in analytics/page.tsx (not via KpiRow reuse) since KpiRow's props are typed to PipelineSummary, a different shape than AnalyticsSummary
- [Phase ?]: 05-04: Used a flex row (min-w-0 flex-1 Link + shrink-0 Badge) instead of absolute positioning for the board card's gone-quiet badge — simpler and layout-safe at any card width
- [Phase ?]: 05-04: Matched today-list.tsx's exact badge styling/copy convention verbatim (variant=destructive, AlertTriangle size-3, 'Gone quiet · {N} days') for visual consistency between Today view and board card per UI-SPEC Surface 3
- [Phase ?]: 06-01: outreachMessages has notNull contactId AND companyId (D-02) — no nullable-FK path, unlike contacts.companyId
- [Phase ?]: 06-01: newOutreachInput deliberately omits source/sourceMessageId — provenance hardcoded by the future Server Action (06-03), never client-supplied (T-06-01 mitigation)
- [Phase ?]: 06-01: sentDate has NO DB default — always user-supplied, matching conversations.occurredAt exactly (D-07)
- [Phase ?]: 06-02: listOutreach writes two full query chains (contactId-filtered / unfiltered) instead of conditionally chaining .where() onto one stored query variable, avoiding drizzle-orm's dynamic-query-builder type surface at the pinned 1.0.0-rc.4 release
- [Phase ?]: 06-03: logOutreachAction hardcodes source:"manual"/sourceMessageId:null server-side; newOutreachInput never declares either field, closing the provenance-spoof surface at the schema level (T-06-06)
- [Phase ?]: 06-03: outreach-log-form's new-contact sub-form deliberately trimmed to Name/Email/LinkedIn only (Role/Relationship/Source/Channel omitted) per D-12 low-friction logging
- [Phase ?]: 06-03: outreach-view-dialog omits a null Subject entirely (no em-dash) since LinkedIn messages structurally have none; Body always rendered since required at log time
- [Phase ?]: outreachCount computed via getOutreachCountsByContact Map lookup, never grouped SQL (mirrors touchpoints reduce)
- [Phase ?]: 3 new demo contacts added purely for outreach fixtures so demo dataset covers cold recruiter/peer outreach, not just active-thread contacts
- [Phase ?]: 06-04: Recipient cell renders as plain text, never a Link — no /contacts/[id] route exists
- [Phase ?]: 06-04: Reused listContactsWithOutreach(db) for the log form's recipient picker and the deep-link chip's contact name, instead of adding a new domain function outside this plan's file scope
- [Phase ?]: 06-04: filterChip renders above whichever branch is active (table or empty state) so the dismissible chip stays visible even when a contactId filter matches zero rows

### Pending Todos

- [Phase 2 planning] Decision-coverage gate override (recorded, no action needed): the automated gate reported a false-negative because its parser only recognizes `D-NN` decision IDs, but this phase uses the `D2-NN` convention (D2-01..D2-10). All 10 decisions are in fact cited across the 6 plans (02-01→D2-01/02/03/04, 02-03→D2-05/07, 02-04→D2-09, 02-05→D2-06/08, 02-06→D2-10), independently confirmed by the plan-checker. Proceeded past the gate. If verify-phase re-surfaces this, it is a known tooling format mismatch, not a dropped decision.

### Blockers/Concerns

- Phase 8 (Outreach Auto-Capture): the self-forwarded outreach parser must fail loudly — an unparseable self-forward has to surface in the review/dead-letter queue, never be silently dropped. It must also be disambiguated from application/recruiter mail landing in the same "Job search" label so it isn't miscategorized as a status event.
- Phase 6 / Phase 9: both introduce a new table (outreach messages; email-thread metadata) that must be created in BOTH the real and demo SQLite stores via additive migrations, with a demo seed, so the feature is presentable on screen-share and no real data can leak into demo.
- Phase 7 (Editable Columns) INSERTED 2026-08-06 before the Gmail work — makes Pipeline/Contacts/Outreach columns editable, with colored-circle/enum fields as dropdown+"Other". Open design questions (deferred to discuss-phase): the "Other"/enum data-model shape, inline-cell vs edit-panel UX, and whether a Pipeline row edits the application or the company. Must respect the existing override/precedence model (CAP-03/DATA-07).
- Phase 3 (Gmail Ingestion): OAuth consent screen must be published to "In Production" status (not left in Testing) before the first scheduled sync ships, or refresh tokens expire after 7 days. This must land before any auth code is written.
- Phase 3 / Phase 5: REL-04 silent recall gap (unlisted ATS sender domains never enter the pipeline) has no complete fix in this roadmap; carried forward as an open risk, mitigated only partially by a future wider-net keyword scan.
- Phase 4: Windows Task Scheduler wake-timer reliability is hardware-dependent and needs direct testing on the actual laptop, not assumed from documentation alone.
- npm run build fails with a pre-existing, unrelated Turbopack build-worker crash ("The id argument must be of type string. Received undefined"), confirmed present before any 02-05 code via git apply -R isolation test. Needs root-causing before any phase requiring a real production build (e.g. deployment prep). See deferred-items.md ## 02-05.
- ~~03-04-PLAN.md (as currently written) targets a Handshake parser first~~ — RESOLVED 03-04 execution: built parseWorkday (Workday-first, per the CRITICAL_SENDER_OVERRIDE) and seeded KNOWN_SENDER_DOMAINS with myworkday.com/smartrecruiters.com/ashbyhq.com; Handshake never referenced. See 03-04-SUMMARY.md.
- 03-06-PLAN.md and 03-07-PLAN.md still target a Handshake parser (0/51 real-inbox sampled messages) — stale like 03-04 was; whoever executes 03-06 should adjust scope to Workday(done)/SmartRecruiters/Ashby, or re-plan first. See 03-04-SUMMARY.md Next Phase Readiness.
- Phase 4: full-suite (npm test) has 3 pre-existing failures from a stray .claude/worktrees/hopeful-mestorf-9a8ba0/ test copy, unrelated to 04-01/04-02 — confirmed pre-existing via git stash isolation test, logged in 04-02 deferred-items.md, needs cleanup as a separate housekeeping item

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2 requirements | ANLYT-01/02/03 (conversion analysis, response-time metrics, self-serve slicing), INGB-01/02 (full ATS parser breadth, URL auto-extraction), ACC-01 (hosted deployment) | Deferred to v2 | Requirements definition |

## Session Continuity

Last session: 2026-08-06T18:15:25.245Z
Stopped at: Phase 7 context gathered
Resume file: .planning/phases/07-editable-columns-across-pipeline-contacts-outreach/07-CONTEXT.md
