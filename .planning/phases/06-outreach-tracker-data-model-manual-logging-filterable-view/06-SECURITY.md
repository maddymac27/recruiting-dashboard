---
phase: 06
slug: outreach-tracker-data-model-manual-logging-filterable-view
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-06
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register authored at plan time (all 5 plans carried a `<threat_model>` block). Verified at ASVS L1 (grep-depth) against the implementation; `block_on: high`. No auditor escalation required — `threats_open: 0`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser form → newOutreachInput / logOutreachAction | untrusted manual-log input crosses into the server write path | recipient/company/channel/purpose/subject/body (user free text) |
| Server Action / demo seed → createOutreach | validated insert input crosses into the DB writer | outreach row fields incl. provenance |
| domain functions → node:sqlite | parameterized Drizzle queries only | query params |
| stored free text → view dialog / table cells | persisted body/subject/outcome/recipient rendered back to the DOM | user-authored text |
| searchParams.contactId → listOutreach | untrusted query param scopes the server-side read | integer contact id |
| schema/migration → both SQLite files | additive migration must reach real + demo stores | DDL |
| DASHBOARD_MODE=demo seed → data/demo.sqlite | seeded fixtures must never touch the real store | invented demo data |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-06-01 | Tampering | newOutreachInput (validation.ts) | high | mitigate | Contract omits `source`/`sourceMessageId` (explicit `// Deliberately NO source / sourceMessageId`); client cannot self-label a manual row as gmail-sourced | closed |
| T-06-02 | Information Disclosure | migration reaching only one store | medium | mitigate | Applied + PRAGMA-verified on BOTH data/real.sqlite and data/demo.sqlite (13-col table confirmed in each) | closed |
| T-06-03 | Tampering | drizzle migration integrity | medium | mitigate | drizzle-kit generated; single additive `CREATE TABLE` + `CREATE UNIQUE INDEX`, no destructive SQL; landed schema PRAGMA-verified | closed |
| T-06-04 | Tampering | createOutreach provenance default | high | mitigate | `source: input.source ?? "manual"`, `sourceMessageId: input.sourceMessageId ?? null` — a caller that omits provenance cannot create an unlabeled row (outreach.ts:52–53) | closed |
| T-06-05 | Tampering | listOutreach / count queries | low | mitigate | Drizzle parameterized query builder only; no raw string SQL | closed |
| T-06-06 | Tampering | logOutreachAction provenance | high | mitigate | Action hardcodes `source: "manual"` / `sourceMessageId: null` server-side, never accepted from client input (actions.ts:208–209) | closed |
| T-06-07 | Tampering (stored XSS) | outreach-view-dialog body render | medium | mitigate | body/subject/outcome rendered only as escaped JSX (`whitespace-pre-wrap`); no `dangerouslySetInnerHTML` (confirmed absent — only a comment documents it) | closed |
| T-06-08 | Denial (silent data loss) | form submit failure | medium | mitigate | Fail-loud: typed failure → inline text-destructive + `toast.error`; unexpected throw → "Something went wrong. Try again."; entry never silently dropped | closed |
| T-06-09 | Tampering | company/contact name resolution | low | mitigate | resolveCompany/createContact use Drizzle parameterized queries; no raw SQL | closed |
| T-06-10 | Information Disclosure | demo seed / real-data leakage | medium | mitigate | Fixtures are invented/portfolio-safe; seed resolves ONLY `resolveDbPath("demo")`; real.sqlite independently verified to hold 0 outreach rows | closed |
| T-06-11 | Information Disclosure | contacts-table cross-link | low | accept | Outreach badge exposes only a bounded integer count + a contactId in a query string — no message content | closed |
| T-06-12 | Tampering | outreach count aggregation | low | mitigate | Count via TypeScript Map reduce (no grouped SQL); Drizzle parameterized reads | closed |
| T-06-13 | Tampering (stored XSS) | outreach-table cells | medium | mitigate | All cell text rendered as escaped JSX (React default); truncation via CSS + `title` only; no raw-HTML injection | closed |
| T-06-14 | Tampering | searchParams.contactId | low | mitigate | Parsed via `Number()` and passed to a Drizzle parameterized `eq()` filter; non-numeric → undefined (unfiltered), never injected SQL (page.tsx:34) | closed |
| T-06-15 | Information Disclosure | Recipient cell dead-link temptation | low | mitigate | Recipient rendered as plain text — no `/contacts/[id]` route fabricated | closed |
| T-06-SC | Tampering (supply chain) | npm / shadcn installs | low | accept | No npm packages added across the phase; checkbox added via shadcn registry with no package.json change | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-11 | Cross-link badge exposes only a bounded integer count + a contactId query param — no message content or PII beyond what the contacts page already shows | MaddyMac | 2026-08-06 |
| AR-06-02 | T-06-SC | No npm packages were installed this phase (checkbox primitive vendored from the shadcn registry, zero package.json change) — no supply-chain trust decision to make | MaddyMac | 2026-08-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-06 | 16 | 16 | 0 | gsd-secure-phase (L1 grep-depth, register authored at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-06
