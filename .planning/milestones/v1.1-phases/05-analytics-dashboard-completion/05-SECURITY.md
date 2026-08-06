---
phase: 5
slug: analytics-dashboard-completion
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-04
---

# Phase 5 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (all 4 PLAN.md files carry `<threat_model>` blocks); verified retroactively at ASVS L1 (grep-depth) — no open threats at or above the `high` block threshold.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client dialog → reused Server Action | Today-view "Log a follow-up"/"Change stage" submit through the already-`safeParse`-gated `logConversationAction`/`changeStageAction` — no new mutation surface this phase | Contact/conversation + stage-change form data |
| DASHBOARD_MODE-resolved db → read models | today.ts / contacts.ts / analytics.ts / board read path receive the already-mode-resolved db handle from the single-reader client.ts (PROJECT.md D-13); no module checks or bypasses the mode | Real vs demo job-search data (rejections/comp are sensitive) |
| server → client (funnel data) | Only a plain `{ stageLabel, count }[]` crosses into the `"use client"` FunnelChart — never the DB handle or raw rows | Pre-aggregated per-stage counts (non-sensitive) |
| rendered application free-text → UI | company/role strings render as escaped JSX (React default) on Today rows and board cards | Company/role text |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Tampering | getStalenessStatus / getTodayItems auto-writing a status event | high | mitigate | Read-time-only overlay (D5-06); **verified**: no insert/update/delete in `application-staleness.ts`/`today.ts`; `today.test.ts` asserts `statusEvents` row count unchanged across `getTodayItems`; only writer remains the user via `changeStageAction` | closed |
| T-05-02 | Information Disclosure | Demo/real leakage across DASHBOARD_MODE in today.ts/contacts.ts | medium | mitigate | Both read functions receive the mode-resolved db handle from the single-reader client.ts (D-13); neither knows or checks the mode | closed |
| T-05-03 | Tampering / Information Disclosure | Stored XSS via company/role free text on Today rows | low | mitigate | **Verified**: `today-list.tsx` renders text as escaped JSX; no `dangerouslySetInnerHTML` anywhere in scope | closed |
| T-05-04 | Spoofing | Gone-quiet flag hiding/suppressing an application from other views | low | mitigate | Overlay is additive (badge/row only); no read model filters or removes an application because it is flagged | closed |
| T-05-SC | Tampering | npm install of recharts via `npx shadcn add chart` | high | mitigate | Blocking-human package-legitimacy checkpoint (never auto-approved), **user-approved 2026-08-04**; recharts `^3.8.0` from the official repo, no postinstall script; SUS/"too-new" signal documented as a heuristic false-positive | closed |
| T-05-SC2 | Tampering | Unintended extra packages (e.g. progress or a typosquat) | medium | mitigate | Install scope limited to the single official shadcn `chart` block; **verified**: `progress` component absent, `recharts` present | closed |
| T-05-05 | Information Disclosure | Demo/real leakage in analytics.ts (real rejections/comp surfacing in demo) | medium | mitigate | analytics.ts receives the single-reader mode-resolved db handle (D-13); never checks/bypasses the mode; page passes only pre-aggregated numbers to the client | closed |
| T-05-06 | Information Disclosure | DB handle or raw rows leaking across the server→client boundary | low | mitigate | **Verified**: FunnelChart receives only a plain `{ stageLabel, count }` array; DB handle stays server-side | closed |
| T-05-07 | Tampering / Information Disclosure | XSS via chart axis / tile text | low | accept | Chart categories are the five fixed seed stage labels and tiles render only bounded numerals — no user-supplied free text reaches this surface (see Accepted Risks Log) | closed |
| T-05-08 | Tampering | Board badge path auto-writing a Ghosted/terminal event | high | mitigate | Board consumes the same read-time-only `getStalenessByApplication` (D5-06); **verified**: no write on render in the board read path; only status-event writer remains the user via `changeStageAction` | closed |
| T-05-09 | Spoofing | Gone-quiet badge filtering/hiding a card from its column | low | mitigate | Badge is additive to the existing card; board grouping/ordering unchanged; no read model removes a card because it is flagged | closed |
| T-05-10 | Information Disclosure | Stored XSS via company/role text or badge on the board card | low | mitigate | **Verified**: escaped JSX (React default), reused from the existing card; badge is a fixed string + bounded integer | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-05-01 | T-05-07 | Analytics chart axis/tile text is drawn only from the five fixed seed-controlled stage labels and bounded integer counts — no user-supplied free text reaches this surface, so an XSS control would guard an input that cannot occur | MaddyMac (via /gsd-secure-phase) | 2026-08-04 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-04 | 12 | 12 | 0 | Claude (gsd-secure-phase, ASVS L1 grep-depth) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-04
