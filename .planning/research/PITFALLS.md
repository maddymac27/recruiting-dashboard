# Pitfalls Research

**Domain:** Email-ingested, local-first personal job-search tracker (Gmail API extraction, single-user, Windows 11 laptop, portfolio-shown repo)
**Researched:** 2026-07-21
**Confidence:** MEDIUM-HIGH (Gmail API behavior verified against Google's own documentation and support pages; abandonment/entity-resolution/scraper-drift findings drawn from cross-referenced community and industry sources, not a single authority)

## Critical Pitfalls

### Pitfall 1: The 7-day refresh token trap (Testing publishing status)

**What goes wrong:**
The OAuth setup this project has already chosen — a Google Cloud project kept in "Testing" publishing status with the user as sole test user, specifically to avoid Google's app-verification review — has a load-bearing side effect: refresh tokens issued to test users **expire exactly 7 days after consent**, not indefinitely. If the daily sync runs on schedule for a week and then the user misses re-authenticating, every subsequent sync fails with `invalid_grant`, silently (unless failure is surfaced loudly, which is this project's own hard constraint). This is exactly the "forgetting to update" failure mode recreated one layer down the stack — now it's "forgetting to re-auth" instead of "forgetting to log the application."

**Why it happens:**
Google treats "Testing" as equivalent to "unverified," and unverified-app tokens are capped at 7 days specifically so an app can't quietly retain user data access forever without going through review. This is confirmed directly on Google's own support page (support.google.com/cloud/answer/15549945): *"Authorizations by a test user will expire seven days from the time of consent. If your OAuth client requests an `offline` access type and receives a refresh token, that token will also expire."* The one documented exception is apps requesting only `name`/`email`/`profile` scopes — `gmail.readonly` does not qualify.

**How to avoid:**
Publish the OAuth consent screen to **"In Production"** rather than leaving it in Testing. For an app requesting only non-sensitive/non-restricted scopes with a small user base, this does not require Google's full verification review — it just removes the 7-day cap. The user will still see an "unverified app" warning screen on first consent (acceptable, since they're the only one ever clicking through it), but the refresh token becomes long-lived (Google states indefinite, subject to normal revocation conditions like 6 months of inactivity, password change, or explicit revocation). This should be a setup-phase decision, not something discovered a week after ingestion starts working.

**Warning signs:**
- Sync starts failing with `invalid_grant` roughly 7 days after initial setup, working perfectly until then (this delay makes it easy to misattribute to something else).
- Any dev-mode instructions or Google Cloud console defaults that assume "Testing" is a permanent, harmless posture for personal-use apps.

**Phase to address:**
Ingestion / setup phase (before the first scheduled sync ships). This is a configuration decision, not a code path — flag it explicitly in setup documentation and verify consent screen is published to Production, not left at default Testing.

---

### Pitfall 2: historyId expiry silently truncates incremental sync

**What goes wrong:**
Gmail's `history.list` API is the efficient way to fetch only what changed since the last sync (via a stored `historyId`). But `historyId` values are **not retained indefinitely** — Google's own docs describe them as valid "for at least a week," but real-world reports show they can expire in as little as a few hours in some cases (e.g., large mailbox reorganization, prolonged sync gaps). When the stored `historyId` goes stale, `history.list` returns an **HTTP 404**, not an empty result. A pipeline that doesn't explicitly handle this 404 as "must fall back to full pagination" will either crash (loud, survivable) or — worse — catch the 404 generically, log nothing useful, and silently treat "no history found" as "no new mail," permanently losing everything since the last successful sync.

**Why it happens:**
Developers implement the "happy path" (historyId works) and treat any error from that call as a transient failure to retry later, rather than as a structurally different scenario requiring a different strategy (full re-sync from the last known-good message).

**How to avoid:**
Explicitly branch on the 404 from `history.list`: on that specific error, fall back to a bounded full `messages.list` query (e.g., re-run the targeted search query from N days before the last successful sync, with overlap) rather than skipping the cycle. Every sync implementation needs both code paths from day one, not historyId-only with a TODO for the fallback.

**Warning signs:**
- A sync that "succeeds" (exit code 0, no error surfaced) but the ingested-message count is suspiciously low or zero after a period the user knows had activity.
- No explicit test/fixture that simulates an expired historyId.

**Phase to address:**
Ingestion phase. This should be verified with an explicit test: force a stale historyId and confirm the system falls back to full sync and *also* surfaces this as a visible event (not just an internal retry), since a fallback triggering silently every day would mask the fact that incremental sync isn't working at all.

---

### Pitfall 3: Silent record loss from swallowed exceptions in the per-message loop

**What goes wrong:**
The single most common cause of "the pipeline ran, reported success, but a job application is missing" is a broad `try/except` (or `catch`) around per-message processing that logs at debug level (or not at all) and moves to the next message. One malformed MIME structure, one Handshake email with a slightly different HTML template than the 50 before it, one message with an encoding the parser doesn't expect — and that single record vanishes with no trace, while the sync as a whole reports "success, 12 messages processed."

**Why it happens:**
It feels safer to keep the loop running than to let one bad message crash the whole batch — and for many pipelines that's the right instinct. But "keep going" and "silently discard" are different choices, and it's easy to accidentally implement only the first half.

**How to avoid:**
Never let a per-message catch block be the last thing that happens to a failure. Every caught exception in the ingestion loop must: (1) preserve the raw message (id, and ideally raw content) in a "needs attention" queue/table, (2) increment a per-run failure counter, (3) surface that counter somewhere the user actually sees on next dashboard load — not buried in a log file nobody tails. A sync that fails to extract N of M candidate messages should be reported as "12 processed, 2 need review," never as bare success. This is the direct, literal implementation of the project's own stated hard constraint ("Ingestion failures and unparseable messages surface visibly rather than failing silently").

**Warning signs:**
- Any `except Exception: continue` or `except Exception: log.debug(...)` in the message-processing loop with no user-visible surfacing.
- A "successful" sync log with no per-message accounting (count in vs count out).
- No UI element that shows "N messages need review" — if unparseable messages have nowhere to go, developers will be tempted to just drop them.

**Phase to address:**
Ingestion phase (the parsing/extraction sub-step specifically) and Data model phase (needs a place to *put* the failures — a review queue is a first-class data model concern, not an afterthought).

---

### Pitfall 4: Over-narrow search queries quietly exclude valid mail

**What goes wrong:**
"Targeted Gmail search from known sender domains" (the project's stated primary ingestion strategy) is high-precision but the recall failure mode is invisible by design: a query like `from:(greenhouse.io OR lever.co OR myworkday.com)` will never surface a rejection sent from `notifications@grnh.se` (Greenhouse's actual sending domain in many configurations), a Workday tenant subdomain like `company.wd1.myworkdayjobs.com`, or an ATS the user hasn't encountered yet. Because the query itself defines "what counts as job mail," anything outside it doesn't fail loudly — it simply never enters the pipeline at all. This is the pitfall most likely to defeat the project's own "fail loudly" constraint, because there's no exception to catch; the mail was never fetched.

**Why it happens:**
Sender domain lists are built from the ATS platforms the user has personally encountered so far, and ATS vendors frequently send from a different domain than their marketing/product name (Greenhouse → grnh.se, iCIMS → icims.com but often via multiple subdomains, Workday → tenant-specific myworkdayjobs.com domains that vary per employer). The list is inherently incomplete on day one and silently stays incomplete as new employers use new platforms.

**How to avoid:**
Pair the targeted query with a periodic, wider net: a scheduled (weekly is enough at this volume) broader search — subject-line keyword matching ("your application", "interview", "regret to inform") across the whole inbox, excluding what's already been ingested — whose *only* job is to surface candidates the targeted query missed, for manual review/promotion. This turns the recall gap from invisible to visible: instead of trusting the query is complete, the system actively checks its own blind spot. The label escape hatch already planned for recruiter threads should also be positioned as the general-purpose "the automated query didn't get this" bucket, and its existence should be foregrounded in onboarding docs, not left as a footnote.

**Warning signs:**
- The sender-domain list is a static, hand-maintained array with no process for reviewing what it's missing.
- No periodic "did we miss anything" pass — only the narrow query runs, ever.
- Pipeline confidence stays high while the user notices (from memory, not the dashboard) that an application they know they submitted never appeared.

**Phase to address:**
Ingestion phase — this is a design decision about the search strategy itself, not a later hardening pass. Flag it as a candidate for deeper research once real ATS domain patterns are being observed (this is a case where phase-specific research after some real usage will beat upfront research, since the actual sending domains in the user's inbox are the ground truth).

---

### Pitfall 5: Parser drift after ATS template changes — wrong data with no error

**What goes wrong:**
ATS vendors change their email templates (new fields, reordered sections, rebranded footer, A/B tested subject lines) without notice and without versioning. A regex- or fixed-selector-based parser tuned against last month's Greenhouse rejection email doesn't throw an exception when the template shifts — it keeps matching *something*, just the wrong thing. A "date applied" field silently starts capturing the email's received date instead of an applied-date buried in the body; a company-name extraction starts grabbing the ATS platform's own name ("Greenhouse") instead of the actual employer. This is strictly worse than a crash, because a crash is loud and a wrong value is not — it sits in the dashboard looking authoritative.

**Why it happens:**
Template-matching parsers are built and tuned against a snapshot of observed emails. There is no upstream signal (no changelog, no API version) when an ATS changes its email HTML, so the parser has no way to know it should re-validate itself — unless the system is explicitly built to check its own extraction confidence.

**How to avoid:**
Two complementary defenses, both cheap at this project's volume (~8 job emails/week):
1. **Extraction confidence, not just extraction.** Every parsed field should carry a lightweight confidence signal — did the expected anchor text/structure match cleanly, or was a fallback/fuzzy path used? Low-confidence extractions route to the same "needs review" queue as parse failures, rather than being written straight into the record as if certain.
2. **Field-level sanity checks at write time**, not just at parse time: a "date applied" more than N days in the future or before the account existed, a company name that's just the ATS vendor's own brand, an empty required field — these should trip the same review flag a parse exception would, even though no exception was thrown. This is what actually catches "wrong-but-plausible" values, which pure try/except cannot.

Given the low volume here, a periodic (monthly) manual spot-check of 5-10 recently ingested records against their source emails is also a legitimate, cheap detection method — cheaper to run than to build automated drift detection for a personal tool at this scale.

**Warning signs:**
- Parser confidence is binary (parsed / didn't parse) with no notion of "parsed but looks wrong."
- No sanity bounds on any extracted field.
- The only detection mechanism is the user noticing a wrong value by chance while looking at the dashboard.

**Phase to address:**
Data model phase (the "I can correct or override any auto-extracted field" requirement is the recovery mechanism — pair it with a review-queue surface that proactively flags low-confidence extractions rather than waiting for the user to spot them unprompted).

---

### Pitfall 6: Entity resolution errors — merged and split applications

**What goes wrong:**
Two distinct failure directions, both damaging to the "trustworthy pipeline view" this project promises:
- **False merge:** Two genuinely separate applications (e.g., reapplying to the same company for a different role six months later, or a referral application that runs in parallel with a direct application to the same employer) get collapsed into one record because they matched on company name, silently overwriting or hiding one application's history.
- **False split:** One application ends up as two records because the confirmation email said "Meta" and the recruiter's direct email came from "@fb.com," or because a staffing agency (e.g., "Aquent" or "Robert Half") applied to a role on behalf of a client company and only the agency name appears in early correspondence — the eventual direct contact from the actual employer creates what looks like a brand-new, unrelated application.

**Why it happens:**
Company names in the wild are inconsistent by nature: legal-entity name vs. trading name vs. rebrand (Facebook/Meta, Google/Alphabet for some subsidiaries), staffing/recruiting intermediaries that mask the true employer, ATS subdomains that only ever show the platform name, not the employer. Naive matching (exact string, or even case-insensitive string) will both over-merge (matching "Robert Half" across many unrelated employer engagements) and under-merge (missing that "Meta" and "fb.com" are the same employer) depending on which naive rule is chosen.

**How to avoid:**
- Match on more than company name alone: company + approximate role title + time proximity as a composite signal before ever auto-merging.
- **Never auto-merge silently.** Auto-*suggest* a merge ("this looks like the same application as X — merge?") and require a one-click confirm, rather than an automated merge that changes history without asking. This matches the project's own principle that any auto-extracted field must be user-correctable — extend that principle to auto-linked *records*, not just fields.
- Maintain a small user-editable alias table (canonical company name → known aliases/subsidiaries/agencies) rather than trying to infer this from external data. At ~8 emails/week volume, a user-maintained table of a few dozen entries is trivial to keep current and far more reliable than automatic fuzzy matching.
- Treat staffing agencies as a distinct entity type from the employer, with an explicit "applied via agency X for employer Y" relationship, rather than picking one name to store.

**Warning signs:**
- Merge/dedup logic runs automatically with no confirmation step.
- Company identity is a single free-text field with no alias/canonicalization layer.
- No way to distinguish "agency that submitted the application" from "the company that's actually hiring."

**Phase to address:**
Data model phase (schema needs to support agency-vs-employer and alias tables from the start — retrofitting this after applications already exist as single company-name strings is a data migration, not a schema tweak) and Ingestion phase (the merge-suggestion UX).

---

### Pitfall 7: Scheduled sync silently stops running on a laptop that sleeps

**What goes wrong:**
A daily scheduled task on a personal Windows laptop that is sometimes closed, asleep, or powered off simply does not run on its schedule — by default, Windows Task Scheduler does **not** run a missed task when the trigger time passes while the machine is off/asleep, and does not automatically catch up afterward unless specifically configured to. Days can pass with zero syncs and, absent an explicit "last successful sync" indicator, nothing in the UI communicates this. This directly threatens the project's core value proposition ("stays accurate without me remembering") by reintroducing a *different* silent staleness — not forgetting to log data, but the system forgetting to check for it.

**Why it happens:**
Task Scheduler's default behavior assumes a machine that's reliably on at the scheduled time (server assumption), which doesn't match a laptop's actual usage pattern (open when in use, asleep or off otherwise).

**How to avoid:**
- Configure the scheduled task with **both** "Run task as soon as possible after a scheduled start is missed" (Settings tab) **and** "Wake the computer to run this task" (Conditions tab) — the first alone is not enough if the machine is asleep at the time it would need to check.
- Even with wake timers, BIOS/UEFI wake-timer support and battery-mode "wake to run task" behavior are inconsistent across laptops, so wake-triggered runs cannot be treated as guaranteed.
- Design the actual reliability guarantee at the application layer, not the OS scheduler layer: on every app launch (manual open of the dashboard), check "when did the last successful sync run?" and if it's older than expected, trigger a catch-up sync automatically (or prompt to). This makes "opening the dashboard" itself a second, more reliable trigger, and it's the layer the user actually interacts with — Task Scheduler becomes a nice-to-have background convenience, not the single point of failure for freshness.
- Surface last-sync-time prominently on the dashboard ("last updated: 3 days ago") so staleness is visible rather than assumed away.

**Warning signs:**
- The only sync trigger is the OS scheduler, with no fallback check at app-open time.
- No stored/displayed "last successful sync" timestamp.
- Task Scheduler configured with default Conditions/Settings tabs (neither missed-run nor wake options enabled).

**Phase to address:**
Ingestion phase (build catch-up-on-open as a primary mechanism, not a defensive afterthought) and Dashboard phase (surface last-sync freshness as a visible, first-class dashboard element — arguably part of "what needs me today").

---

### Pitfall 8: This is the third attempt — the abandonment pattern is the real risk, not any single bug

**What goes wrong:**
The project's own history is the strongest evidence here: two prior attempts (spreadsheet, then a Claude-Code-prompted version) both died specifically at the *capture* step from ongoing effort, not from a missing feature. Research on personal/side-project abandonment broadly confirms the mechanism: projects fail less often from technical impossibility and more often from (a) ongoing maintenance burden exceeding perceived value, (b) scope/requirements drifting upward before the thing is ever "done enough" to use, and (c) the loop between build effort and payoff being too long or too indirect for motivation to survive it. For a tool whose entire value proposition is "accurate without me remembering," any residual step that still requires the user's discipline (re-authenticating a token, manually triggering a sync, correcting drifted data every week, running a `npm install` after every dependency bump) reproduces the exact failure mode this project exists to eliminate — just moved one layer down.

**Why it happens:**
It is very easy, while building the ingestion pipeline, to accumulate small "just remember to..." steps (re-auth the token, restart the scheduled task after a Windows update, check the review queue) that each feel minor individually but collectively recreate a maintenance tax. Each one is a rational engineering shortcut in isolation and an abandonment vector in aggregate.

**How to avoid:**
- Treat "does this require me to remember something on a cadence shorter than 'occasionally, when curious'" as a first-class design filter for every ingestion/scheduling decision, not just a nice property. This is a real test, not a proverb: for every recurring step introduced, ask "what happens if I ignore this for a month?" If the answer is "silent data loss" or "the system stops working," that step needs either automation or loud, unmissable surfacing (a banner on dashboard load, not a log file).
- Ship a genuinely minimal version early and use it in anger before adding analytics/differentiators. The project already frames Ingestion as the foundational phase for good reason — but the abandonment risk argues for treating "ingestion + a bare-bones list view I actually check daily" as the real MVP milestone, with dashboard polish and analytics deliberately deferred until the capture loop has survived contact with a few real weeks of an actual job search.
- Make token re-auth (Pitfall 1) and sync failures (Pitfall 3) impossible to ignore: a banner, not a log line, is the difference between "the system reminds me" and "the system requires me to remember to check if it's working," which is the same failure mode restated.

**Warning signs:**
- Any setup step documented as "remember to do X periodically" rather than automated or eliminated.
- A gap of more than ~2 weeks between "ingestion works" and "I am actually looking at this dashboard regularly" during development — that gap is exactly where the two prior attempts likely died.
- Analytics/charting work happening before the ingestion + review-queue loop has been used for at least a couple of real weeks.

**Phase to address:**
All phases, but concretely: sequence the roadmap so Ingestion (with review-queue surfacing) ships and gets used before Analytics is built. This is the single highest-leverage phase-ordering decision available from this research.

---

### Pitfall 9: Secrets committed to a repo intended to be shown publicly as a portfolio piece

**What goes wrong:**
This project has an unusual, specific version of a common risk: the repo is *meant* to be shown to others (as evidence of shipping ability) while containing OAuth client secrets, refresh/access tokens, and — via demo mode's necessary contrast — potentially real personal job-search data (rejections, compensation discussions) if demo-mode toggling is implemented carelessly (e.g., a "real data" JSON file checked in alongside the demo seed file, or an `.env` with a live token committed "temporarily" and forgotten). Once pushed to a public GitHub repo, secrets must be treated as compromised immediately — deleting the file in a later commit does not remove it from history, forks, or GitHub's own caches.

**Why it happens:**
Local-first, single-user projects often skip the secrets hygiene habits that team/production projects enforce by default (no CI secret scanning conversation ever happens, `.gitignore` is an afterthought since "it's just me"), and the explicit intent to eventually make the repo public is often decided *after* initial setup, when a `credentials.json` or `token.json` may already be a few commits deep.

**How to avoid:**
- `.gitignore` entries for the OAuth client secret file, the token/refresh-token storage file, and any local `.env` **before the first commit that touches Gmail auth**, not retroactively.
- Never store the real Gmail credentials/token file inside the repo directory at all if avoidable — an OS-level location (e.g., a directory outside the git working tree, or Windows Credential Manager) removes the "accidentally staged" failure mode entirely rather than relying on `.gitignore` discipline.
- Enable GitHub push protection / secret scanning on the repo from the start (available on public repos and increasingly on private ones) as a backstop, not the primary control.
- Treat "real job-search data must never be committed" as a schema-level guarantee, not a discipline-level one: keep real ingested data in a local SQLite file path that's gitignored by default, and make the demo dataset the only thing that ever lives inside the tracked repo tree.
- If a secret or real data does get committed before this is caught: rotate/revoke the OAuth client credentials in Google Cloud Console immediately (assume compromised the moment it's pushed, regardless of whether the repo is public yet), then rewrite history with `git filter-repo` (the current recommended tool, superseding `filter-branch` and BFG for most cases) before making the repo public.

**Warning signs:**
- No `.gitignore` present before the first Gmail API code is written.
- Any real data file (not clearly named/pathed as demo/seed data) present in `git status` at any point.
- `git log -p` on the credentials/token path has ever shown actual content, even if later deleted.

**Phase to address:**
Ingestion phase, specifically before any Gmail auth code is written — this is a Phase 0 / setup-order concern, not something to clean up before the "make it public" milestone. Also relevant to Demo mode phase (verify the real-vs-demo data separation is structural, e.g., separate files/paths, not a runtime flag reading from the same store).

---

### Pitfall 10: Over-engineering the ingestion pipeline before it delivers any value

**What goes wrong:**
Given the explicit prior failure pattern (abandonment from maintenance burden) it would be easy to overcorrect into the opposite failure: building an elaborate, "production-grade" ingestion architecture (queue-based processing, pub/sub push notifications instead of polling, a pluggable parser-plugin system anticipating ATS platforms not yet encountered, a full entity-resolution ML layer) that never reaches a state where the user is actually looking at real data, because the pipeline itself became the project.

**Why it happens:**
This is a portfolio piece as well as a personal tool, which creates real pressure to build something that *looks* sophisticated, and Gmail API's own feature surface invites over-scoping — e.g., Gmail push notifications via Google Cloud Pub/Sub exist and are the "correct" way to do near-real-time sync at scale, but they require a Pub/Sub topic, a `watch()` re-registration every 7 days (yes, another 7-day expiry, this time on the watch subscription itself, unrelated to the OAuth token issue), and a publicly reachable webhook endpoint or Pub/Sub pull subscription — infrastructure this project's own constraints explicitly rule out ("no hosting," daily sync is an explicit, deliberate non-goal of true real-time).

**How to avoid:**
At ~8 emails/week (rising, but still low absolute volume), a straightforward **polling** design — scheduled task runs `messages.list`/`history.list` once daily, plus a manual "sync now" button calling the same code path — is not a compromise, it is the correctly-scoped solution. Explicitly reject: Pub/Sub push notifications (needs hosting/public endpoint this project has ruled out), a plugin architecture for hypothetical future ATS platforms (add a new sender-domain/parser case when a new ATS is actually encountered, not before), and any entity-resolution approach fancier than the alias-table-plus-confirm-merge design in Pitfall 6 (a personal tool with one user generating a handful of applications per week does not need statistical matching).

**Warning signs:**
- Any infrastructure requirement (a queue, a hosted webhook, a second always-on process) creeping in to support "daily sync" — daily sync by definition does not need infrastructure beyond a scheduled task and a database file.
- Time spent on parser generality for ATS platforms not yet seen in the user's actual inbox.
- The ingestion phase taking meaningfully longer to ship than a simple poll-and-parse loop would reasonably take, without a concrete recall or reliability problem driving the extra complexity.

**Phase to address:**
Ingestion phase — this is the phase most at risk of scope creep given it's simultaneously the hardest problem and the most demo-able piece of engineering. Roadmap should explicitly scope it to polling + targeted query + label escape hatch + review queue, with Pub/Sub and generalized parser frameworks named as out-of-scope decisions (mirroring how PROJECT.md already handles LinkedIn access).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|--------------------|-----------------|------------------|
| Regex/fixed-selector email parsing instead of an LLM-assisted extraction pass | Fast, free, no external API dependency, keeps data fully local | Brittle to ATS template changes (Pitfall 5); needs manual sanity-check layer to compensate | Acceptable and arguably preferable given the privacy constraint (no third-party service touches email content) — pair with confidence scoring and a review queue, not with blind trust |
| Polling instead of Gmail push notifications | No hosting, no public endpoint, matches "no infra" constraint | Not truly real-time (already an accepted, explicit tradeoff per PROJECT.md) | Always acceptable here — this is the correct choice, not a shortcut being tolerated |
| Storing OAuth token file on local disk unencrypted | Fast to implement, no OS-integration code | If repo path is wrong or `.gitignore` is missed once, credential leaks into git history | Acceptable only if the token path is structurally outside the git working tree from day one |
| Auto-merging entity records on exact company-name match | Simple to implement, "just works" for the common case | Silent false-merges hide real distinct applications (Pitfall 6) | Never acceptable for merges that discard/overwrite history without confirmation; acceptable only as a *suggestion* surfaced for one-click confirm |
| Treating "sync ran without throwing" as "sync succeeded" | Simple success/failure model | Masks partial failures (some messages silently dropped) — directly violates the project's own fail-loudly constraint | Never acceptable — must track per-message accounting, not just process-level exit status |
| Skipping a review-queue UI in the first ingestion pass ("I'll just check the log") | Faster initial ship | Recreates exactly the discipline-dependent failure mode (Pitfall 8) that killed prior attempts | Never acceptable — review queue is core, not a stretch feature |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|------------------|--------------------|
| Google OAuth consent screen | Leaving publishing status at "Testing" indefinitely for a personal-use app | Publish to "In Production" immediately after initial testing; accept the unverified-app warning screen as a one-time click-through, not a blocker |
| Gmail `history.list` | Treating any error as retry-and-ignore | Explicitly branch on 404 → fall back to full `messages.list` resync; treat this fallback path as a normal, tested code path, not an edge case |
| Gmail `messages.list` pagination | Assuming one page (default up to 100, max 500) covers all results; forgetting to loop on `nextPageToken` | Always loop until `nextPageToken` is absent, even though at ~8 emails/week this will rarely span multiple pages — build it correctly once rather than special-casing low volume |
| Gmail thread vs message IDs | Conflating `threadId` with `id` when deduplicating or linking; assuming thread IDs are stable/portable identifiers | Store both `id` (per-message) and `threadId` (per-conversation) explicitly; treat `threadId` as scoped to this one mailbox, never compared against any external system |
| Task Scheduler | Leaving default Settings/Conditions (no missed-run catch-up, no wake-to-run) on a task expected to run daily on a laptop | Enable "run as soon as possible after a missed start" and "wake the computer to run this task"; still back this with an app-launch-time freshness check (Pitfall 7) since wake timers are not universally reliable across laptop hardware |
| Company/employer identity | Matching purely on the string that arrived in the email (ATS platform name, agency name, or old/new brand name) | Maintain a small user-editable alias table; separate "agency that submitted" from "employer" as distinct fields/entities |

## Performance Traps

At this project's stated scale (~8 job emails/week now, "expected to increase substantially" but still a single personal mailbox), classic performance traps mostly do not apply — this section is intentionally short because over-indexing on scale concerns here would itself be a form of Pitfall 10.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Fetching full message bodies for every message in the search result set on every sync (instead of using historyId/date-bounded queries) | Sync gets slower and burns more quota units every month as inbox history grows | Bound the targeted query by date (e.g., "since last successful sync minus overlap buffer") rather than re-querying the whole mailbox each run | Would start mattering only in the thousands of messages / very frequent re-sync range — not a near-term concern at 8-dozens/week |
| Recomputing analytics (funnel, conversion) from raw transition events on every dashboard load with no caching | Dashboard feels sluggish as transition-event history grows over months | Precompute/cache derived analytics on sync completion rather than on every page view, since data changes only once a day | Only becomes noticeable after a year+ of accumulated history at this volume — safe to defer |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Committing OAuth client secret or token/refresh-token file to git | Credential compromise, worse if repo is later made public as a portfolio piece (Pitfall 9) | `.gitignore` before first auth code; store token outside the git working tree; enable GitHub secret scanning/push protection |
| Real job-search data (rejections, comp discussions) living in the same data file/path that demo mode reads from | A screen-share or repo-publish accidentally exposes real personal/compensation data | Structural separation: demo seed data and real data are different files/paths from the start, not a runtime toggle over one shared store |
| Requesting broader Gmail scopes than needed (e.g., full read/write instead of `gmail.readonly` plus the specific label) | Larger blast radius if the token is ever compromised; also triggers more scrutiny in Google's consent flow | Request the narrowest scope that satisfies the read-only ingestion + label-read use case |
| Storing extracted email content (including sender emails, message snippets) without considering it "real personal data" for demo-mode purposes | Demo mode built from a lightly-redacted export of real data instead of fully synthetic seed data, defeating its purpose | Demo mode data must be synthetic/fabricated, never derived from filtering real records, since filtering can miss fields |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Failures surfaced only in a log file | User never checks the log, silent-failure problem recurs in a new form (Pitfall 3/8) | A persistent, unmissable "N items need review" indicator visible on dashboard load |
| No visible "last synced" timestamp | User can't tell if the dashboard is current or 5 days stale after a missed scheduled run (Pitfall 7) | Prominent last-sync-time display, ideally as part of the existing "what needs me today" surface |
| Correcting a wrong auto-extracted field requires digging into a settings/admin view | Users tolerate wrong data rather than fixing it, reintroducing the "stale/wrong data" failure of prior attempts | Inline correction directly on the job/detail view where the wrong field is seen |
| Merge suggestions presented as already-applied instead of pending confirmation | User loses trust in the tool the first time a merge silently combines two real, distinct applications | Merge suggestions are a distinct, dismissible/confirmable UI state, never an automatic silent action |

## "Looks Done But Isn't" Checklist

- [ ] **Ingestion pipeline:** Often missing the historyId-expired fallback path — verify by forcing a stale historyId in a test and confirming full resync triggers (not a silent no-op).
- [ ] **Fail-loudly constraint:** Often "done" only for exceptions, not for logically-wrong-but-non-crashing extractions — verify a deliberately malformed/edge-case test email produces a visible review-queue entry, not just a caught exception.
- [ ] **Scheduled sync:** Often configured with OS-scheduler defaults only — verify Task Scheduler has both missed-run and wake-to-run enabled, *and* that an app-open freshness check exists independent of the scheduler.
- [ ] **Demo mode:** Often retrofitted as a flag over the same data store rather than a structurally separate dataset — verify demo mode cannot leak a single real field, by checking it reads from a fully distinct source, not a filter over real data.
- [ ] **Company/entity matching:** Often ships with naive exact-string matching that "looks fine" until a rebrand or agency-submitted application appears — verify with a test case using two known aliases (e.g., "Meta"/"Facebook"-style) and one agency-submitted scenario.
- [ ] **Secrets hygiene:** Often "fine" only because the repo hasn't been made public yet — verify `.gitignore` covers the token/credential path and run a `git log -p -- <credentials path>` check before ever flipping the repo to public.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|-------------------|
| Refresh token expired (7-day Testing cap) | LOW | Re-authenticate once; then fix root cause by publishing consent screen to Production so it doesn't recur |
| historyId expired, gap in ingested data | MEDIUM | Trigger full re-sync bounded by a "safe" date range (last known-good date minus buffer); verify no duplicate records created by re-ingesting overlapping messages |
| Discovered a systematically wrong field from parser drift (e.g., "date applied" wrong for weeks) | MEDIUM | Re-parse affected messages from raw stored source (if retained) with corrected logic; if raw source wasn't retained, this becomes HIGH cost — argues for retaining raw message content, not just extracted fields, at least for a rolling window |
| Secret/credential committed to git before catching it | HIGH if already pushed publicly | Revoke/rotate the Google Cloud OAuth client credentials immediately (assume compromised); rewrite history with `git filter-repo`; force-push only after confirming no other clones/forks exist, since rewritten history doesn't retroactively scrub caches or forks |
| Company records incorrectly auto-merged, real history lost | MEDIUM-HIGH | Requires an "undo merge" capability or, absent that, manual reconstruction from retained raw source messages — argues for never auto-merging without confirmation (Pitfall 6) so this recovery is rarely needed |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|-----------------|
| 7-day refresh token expiry (Testing mode) | Ingestion / setup phase | Consent screen confirmed "In Production" in Google Cloud Console before first scheduled sync ships |
| historyId expiry silently truncating sync | Ingestion phase | Test simulates a stale/invalid historyId and confirms full-resync fallback triggers and is visibly logged |
| Swallowed exceptions dropping records silently | Ingestion phase | Deliberately malformed test message produces a visible review-queue entry with per-run failure count nonzero |
| Over-narrow search query missing valid mail | Ingestion phase | A periodic wider-net check exists and its results (candidates missed by the primary query) are surfaced for review |
| Parser drift producing wrong-not-missing data | Data model phase | Extracted fields carry a confidence signal; sanity bounds exist on date/required fields; "correct any auto-extracted field" UI is implemented and tested |
| Entity merge/split errors | Data model phase | Merge suggestions require explicit confirm; alias table exists and is user-editable; agency vs. employer modeled as distinct concepts |
| Scheduled sync silently stalling on a sleeping laptop | Ingestion phase + Dashboard phase | Task Scheduler configured with missed-run/wake options; app-open freshness check exists independently; last-sync timestamp visible on dashboard |
| Abandonment via accumulating "remember to..." steps | All phases (sequencing decision) | Roadmap ships Ingestion + review queue before Analytics; every recurring manual step has an automation or loud-surfacing alternative documented |
| Secrets/real data committed to a public-intended repo | Ingestion phase (before first auth code) + Demo mode phase | `.gitignore` covers credential/token paths before first commit touching Gmail auth; demo and real data are structurally separate files/paths |
| Over-engineered ingestion pipeline (Pub/Sub, plugin frameworks) never reaching usable state | Ingestion phase (scope-setting) | Roadmap explicitly names Pub/Sub push and generalized parser plugin frameworks as out-of-scope, mirroring PROJECT.md's existing out-of-scope pattern |

## Sources

- [Google Cloud Platform Console Help — Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en) — official Google documentation, confirms 7-day refresh token expiry for Testing-status apps and the profile-scope exception; verified directly via WebFetch (MEDIUM confidence per source-hierarchy classification for cross-checked web findings)
- [Google OAuth Refresh Token: Expiration, 7-Day Limit & Lifetime Explained — Unipile](https://www.unipile.com/google-oauth-refresh-token/)
- [HomeSeer Forums — Refresh Token Expires in 7 Days if OAuth Consent screen publishing status is Testing](https://forums.homeseer.com/forum/internet-or-network-related-plug-ins/internet-or-network-discussion/ak-google-calendar-alexbk66/1545936-refresh-token-expires-in-7-days-if-oauth-consent-screen-publishing-status-is-testing)
- [Google for Developers — Method: users.history.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)
- [Nylas — Gmail API pagination and sync explained](https://developer.nylas.com/docs/cookbook/email/gmail-api-pagination-sync/)
- [Google for Developers — List Gmail messages](https://developers.google.com/workspace/gmail/api/guides/list-messages)
- [Google for Developers — Manage threads](https://developers.google.com/workspace/gmail/api/guides/threads)
- [Google for Developers — Usage limits (Gmail API quota)](https://developers.google.com/workspace/gmail/api/reference/quota)
- [Unipile — Gmail API Limits in 2026](https://www.unipile.com/gmail-api-limits/)
- [Microsoft Support — Task Scheduler runs a missed task](https://support.microsoft.com/en-au/topic/task-scheduler-runs-a-missed-task-unexpectedly-on-a-computer-that-is-running-windows-7-or-windows-server-2008-r2-d4b1411c-6b49-cf88-bf03-a1a38b86a94f)
- [Microsoft Learn — Event ID 410, Wake Computer Task Registration](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2008-r2-and-2008/cc727230(v=ws.10))
- [DEV Community — The Real Cost of Silent Data Pipeline Failures](https://dev.to/137foundry/the-real-cost-of-silent-data-pipeline-failures-4k3p)
- [DEV Community — How to Add Error Handling and Monitoring to a Data Pipeline](https://dev.to/137foundry/how-to-add-error-handling-and-monitoring-to-a-data-pipeline-53bg)
- [Rayobyte — Stop Scraper Failures Early with Machine Learning Detection](https://rayobyte.com/blog/machine-learning-detect-site-changes-scrapers)
- [Rayobyte — Monitoring Scraping Systems: Metrics That Prevent Failures](https://rayobyte.com/blog/monitoring-scraping-systems-metrics-to-track)
- [Neo4j Labs — Entity Resolution and Deduplication](https://neo4j.com/labs/agent-memory/explanation/resolution-deduplication/)
- [RecordLinker — Name Normalization: Matching Companies, Vendors, Suppliers](https://recordlinker.com/name-normalization-matching/)
- [DEV Community — My GitHub Graveyard has 27 dead projects](https://dev.to/tahosin/my-github-graveyard-has-27-dead-projects-here-is-the-brutal-truth-about-why-52d9)
- [arXiv — On the abandonment and survival of open source projects](https://arxiv.org/pdf/1906.08058)
- [Journal of Software: Evolution and Process — Exploring factors affecting developer abandonment of open source software projects](https://onlinelibrary.wiley.com/doi/10.1002/smr.2484)
- [GitHub Docs — Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Microsoft Tech Community — How to Remove Secrets from Git History Safely](https://techcommunity.microsoft.com/blog/azureinfrastructureblog/how-to-safely-remove-secrets-from-your-git-history-the-right-way/4464722)

---
*Pitfalls research for: Email-ingested, local-first job-search dashboard (Gmail API, single-user, Windows 11)*
*Researched: 2026-07-21*
