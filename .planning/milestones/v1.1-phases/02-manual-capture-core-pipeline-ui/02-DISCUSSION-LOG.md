# Phase 2: Manual Capture + Core Pipeline UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-28
**Phase:** 2-Manual Capture + Core Pipeline UI
**Areas discussed:** Visual style & app shell

Gray areas presented for selection: Visual style & app shell, Board layout & moving a stage, Add & quick-save flow, Job detail & contact logging. **User selected only "Visual style & app shell"** for discussion; the other three were resolved with Claude's recommended defaults and accepted by the user (see Claude's Discretion).

---

## Visual Style & App Shell

### Styling approach

| Option | Description | Selected |
|--------|-------------|----------|
| Tailwind + shadcn/ui | Utility CSS plus copy-in accessible prebuilt components; fastest path to a polished portfolio look | ✓ |
| Tailwind only | Utility CSS, hand-build every component; full control, more work | |
| Plain CSS / CSS Modules | No framework; lightest deps, most manual styling effort | |

**User's choice:** Tailwind + shadcn/ui

### App shell / navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Persistent nav shell | Sidebar/top nav with Pipeline now + reserved slots for Today/Analytics (Phase 5) | ✓ |
| Single board + detail routes | Board + detail routes only; add nav later | |

**User's choice:** Persistent nav shell

### Aesthetic direction & theme

| Option | Description | Selected |
|--------|-------------|----------|
| Clean minimal light | Neutral, data-forward, one accent color; light only | ✓ |
| Light + dark toggle | Same but with working dark mode; more setup | |
| Opinionated / branded | Distinct color identity, more design effort | |

**User's choice:** Clean minimal light

### Data-mode indicator

| Option | Description | Selected |
|--------|-------------|----------|
| Visible DEMO badge | Small badge in shell when in demo mode, driven by existing `dashboardMode` | ✓ |
| No indicator | Keep shell clean; mode implicit | |

**User's choice:** Visible DEMO badge

**Notes:** Portfolio presentability was the deciding lens across all four — shadcn + clean-light + the DEMO badge all serve confident screen-sharing of invented demo data. The badge must not add a second reader of `DASHBOARD_MODE` (Phase 1 single-reader invariant).

---

## Claude's Discretion

User scoped involvement to visual style & app shell and accepted recommended defaults for the remaining three areas:

- **Board layout & moving a stage** — Kanban columns keyed to the locked stage vocabulary (D-05); explicit "change stage" control (not drag-and-drop), each change appending a status event (D-09); summary counts as a KPI row above the board (DASH-04).
- **Add & quick-save flow** — shadcn modal dialogs: a minimal quick-save (URL + company + role → Saved application, CAP-01) and a full add/edit form for all fields (CAP-02).
- **Job detail & contact logging** — unified chronological timeline (DASH-05); inline contact + conversation logging on the detail page including a free-text paste for self-forwarded LinkedIn notes (CAP-04).

Also delegated: new domain read models (board list/aggregate, summary counts, composed detail timeline), the `updateApplication` write path, routing structure, component decomposition, and empty/loading states.

## Deferred Ideas

- Drag-and-drop stage changes (polish, not required).
- Dark-mode toggle (light-only this phase).
- In-UI demo/real toggle (mode is a startup swap by design — Phase 1 D-13; badge only displays it).
- Today view / auto-ghosting / funnel analytics — Phase 5 (nav reserves slots only).
- Override-survives-resync (CAP-03) — Phase 3.
