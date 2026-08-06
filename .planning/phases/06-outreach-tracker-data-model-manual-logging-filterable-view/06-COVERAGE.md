---
phase: 06-outreach-tracker-data-model-manual-logging-filterable-view
kind: api-coverage
created: 2026-08-06
---

# Phase 6 — API Coverage Matrix

Phase 6 (Outreach Tracker — manual slice) integrates **no external API**. This
matrix records that decision explicitly so the api-coverage gate has an honest
OPT-OUT to validate rather than being silently bypassed.

Why the gate fired: its `wire` + `rest` heuristic matched the plan prose
"Wire outreach into the rest of the app" (`06-05-PLAN.md:43`) — a description of
cross-linking local UI, not a REST integration. The only external-API references
in Phase 6's touched files are the **pre-existing** Gmail ingestion helpers in
`src/app/actions.ts` (`runGmailSync`, `getGmailClient`, `connectGmailAction`,
`syncGmailAction`) from Phases 3–4; Phase 6 only appended the fully-local
`logOutreachAction` server action to that file. Real outreach auto-capture via
the Gmail label escape-hatch is deliberately deferred to **Phase 7 (OUT-02)**.

| capability | decision | reason |
|------------|----------|--------|
| gmail-outreach-autocapture | OPT-OUT | Deferred to Phase 7 (OUT-02). Phase 6 is a manual-logging-only slice and adds no Gmail or other external-API code. |
| rest-api-integration | OPT-OUT | False-positive signal from the prose "wire outreach into the rest of the app" (06-05-PLAN.md:43). Phase 6 introduces no REST or external-API surface. |
