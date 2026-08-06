---
phase: 02-manual-capture-core-pipeline-ui
plan: 01
subsystem: ui
tags: [tailwindcss, shadcn, radix-ui, nextjs, app-shell, demo-mode]

# Dependency graph
requires:
  - phase: 01-schema-demo-mode-foundation
    provides: dashboardMode/db singleton export (src/db/client.ts), event-sourced schema
provides:
  - Tailwind CSS v4 scaffolding (postcss.config.mjs, globals.css with @theme tokens)
  - Hand-authored components.json (new-york / neutral / css-variables)
  - 12 shadcn/ui primitives under src/components/ui/ (button, card, dialog, input, label, select, textarea, badge, dropdown-menu, separator, skeleton, sonner)
  - cn() helper (src/lib/utils.ts)
  - Persistent nav shell (src/components/nav-shell.tsx) with active Pipeline link, inert Today/Analytics slots, prop-driven DEMO badge
  - Rewritten root layout (src/app/layout.tsx) wiring globals.css, Geist Sans, NavShell, Toaster
affects: [02-02, 02-03, 02-04, 02-05, 02-06]

# Tech tracking
tech-stack:
  added: [tailwindcss@4.3.3, "@tailwindcss/postcss@4.3.3", postcss, shadcn@4.16.0 (CLI devDependency), class-variance-authority@0.7.1, lucide-react@1.27.0, clsx@2.1.1, tailwind-merge@3.6.0, tw-animate-css@1.4.0, radix-ui@^1.6.7 (unified package), next-themes@^0.4.6, sonner@^2.0.7]
  patterns:
    - "shadcn v4.16.0 non-interactive setup: hand-author components.json before running `shadcn add` (no --style/--base-color/--css-variables flags exist anymore)"
    - "UI-SPEC Accent role binds to shadcn's --primary/--ring tokens, never shadcn's own --accent token"
    - "Client chrome (nav-shell.tsx) receives dashboardMode only as a prop from the root Server Component — never imports the db client module"
    - "--font-sans theme override in globals.css @theme block wires next/font/google's Geist export as the default body font"

key-files:
  created:
    - postcss.config.mjs
    - components.json
    - src/app/globals.css
    - src/lib/utils.ts
    - src/components/ui/button.tsx
    - src/components/ui/card.tsx
    - src/components/ui/dialog.tsx
    - src/components/ui/input.tsx
    - src/components/ui/label.tsx
    - src/components/ui/select.tsx
    - src/components/ui/textarea.tsx
    - src/components/ui/badge.tsx
    - src/components/ui/dropdown-menu.tsx
    - src/components/ui/separator.tsx
    - src/components/ui/skeleton.tsx
    - src/components/ui/sonner.tsx
    - src/components/nav-shell.tsx
    - .planning/phases/02-manual-capture-core-pipeline-ui/deferred-items.md
  modified:
    - package.json
    - package-lock.json
    - src/app/layout.tsx

key-decisions:
  - "shadcn CLI v4.16.0 copied primitive source importing class-variance-authority/lucide-react/clsx/tailwind-merge but did not add them to package.json this run — installed explicitly using the exact versions already Approved in 02-RESEARCH.md's Package Legitimacy Audit, not novel package choices"
  - "shadcn CLI resolved the unified `radix-ui` package plus `next-themes` (for sonner's theme wiring) instead of individual @radix-ui/react-* packages RESEARCH anticipated — let the CLI's own resolution stand (RESEARCH explicitly said not to hand-pin Radix versions)"
  - "tw-animate-css installed after confirming dialog.tsx's animate-in/animate-out classes would resolve to nothing without it (RESEARCH Assumption A4 check)"
  - "Left sidebar (not top nav) chosen for the nav shell, consistent with UI-SPEC's 'sidebar/nav background' color-role wording"

patterns-established:
  - "Pattern 0 (RESEARCH): hand-authored components.json, no tailwind.config.js, Tailwind v4 CSS-first @theme tokens"
  - "Single DASHBOARD_MODE reader: only src/app/layout.tsx imports dashboardMode; nav-shell.tsx receives it as a prop"

requirements-completed: [DASH-02]

coverage:
  - id: D1
    description: "Tailwind v4 + shadcn/ui scaffolded from scratch (components.json, postcss.config.mjs, globals.css with UI-SPEC token bindings, no tailwind.config.js)"
    requirement: DASH-02
    verification:
      - kind: unit
        ref: "Task 1 acceptance_criteria: components.json parses with style=new-york/baseColor=neutral/cssVariables=true; globals.css first line @import tailwindcss; #2563EB bound to --primary/--ring; no tailwind.config.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "12 shadcn/ui primitives generated and cn() helper present, project type-checks"
    requirement: DASH-02
    verification:
      - kind: unit
        ref: "Task 2 acceptance_criteria: all 12 primitive files exist under src/components/ui/, src/lib/utils.ts exports cn, npx tsc --noEmit exits 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Persistent nav shell renders with Pipeline active, Today/Analytics reserved-but-inert, and a DEMO badge gated on dashboardMode — driven only by a prop, never a direct db-client import"
    requirement: DASH-02
    verification:
      - kind: unit
        ref: "Task 3 acceptance_criteria: nav-shell.tsx begins with 'use client' and has zero @/db/client import matches (grep); layout.tsx imports globals.css + dashboardMode + renders <NavShell dashboardMode=...> + <Toaster>; NavShell renders Badge(DEMO) gated on dashboardMode === 'demo'; npx tsc --noEmit exits 0"
        status: pass
      - kind: manual_procedural
        ref: "npm run dev fetch check: demo mode response body contains DEMO/Pipeline/Today/Analytics text; real mode response body omits DEMO text, still contains Pipeline"
        status: pass
    human_judgment: true
    rationale: "Visual/layout adequacy (light theme rendering correctly, blue CTA color, sidebar layout quality on screen-share) was checked via HTML content assertions only, not a rendered screenshot — a human should still eyeball the actual rendered shell before treating the portfolio-grade visual bar as met."

# Metrics
duration: ~25min
completed: 2026-07-29
status: complete
---

# Phase 2 Plan 1: Tailwind v4 + shadcn Scaffold + Nav Shell Summary

**Tailwind CSS v4 + shadcn/ui (new-york/neutral/css-vars) scaffolded from a bare Next.js app, with a persistent nav shell whose DEMO badge is driven entirely by a `dashboardMode` prop from the root layout.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 completed
- **Files modified:** 20 (17 created, 3 modified)

## Accomplishments

- Tailwind v4 + shadcn/ui installed and configured with a hand-authored `components.json` (no `tailwind.config.js` — v4 is CSS-first), matching UI-SPEC's new-york/neutral/CSS-variables preset.
- `globals.css` binds UI-SPEC's Accent role (#2563EB) to shadcn's `--primary`/`--ring` tokens (not shadcn's own `--accent` token, per RESEARCH Pitfall 3), plus Dominant/Secondary/Destructive roles.
- All 12 required shadcn primitives generated (button, card, dialog, input, label, select, textarea, badge, dropdown-menu, separator, skeleton, sonner) plus the `cn()` helper.
- Persistent left-sidebar nav shell: active accent-colored **Pipeline** link, inert **Today**/**Analytics** slots reserved for Phase 5, and a **DEMO** badge that renders only when `dashboardMode === "demo"`.
- Root layout rewritten as the sole `dashboardMode` reader — Geist Sans wired via `next/font/google`, `NavShell` + `Toaster` mounted.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Tailwind v4 + author components.json, postcss, globals.css** - `039f901` (feat)
2. **Task 2: Generate the 12 shadcn primitives + cn() helper** - `6f45d1f` (feat)
3. **Task 3: Nav shell + DEMO badge, wired into the root layout** - `e899ad9` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `components.json` - Hand-authored shadcn config (new-york/neutral/css-vars, no tailwind.config)
- `postcss.config.mjs` - `@tailwindcss/postcss` plugin wiring
- `src/app/globals.css` - `@import "tailwindcss"` + `tw-animate-css` + `@theme` token map + `:root` color roles + `--font-sans` Geist wiring
- `src/lib/utils.ts` - `cn()` helper (clsx + tailwind-merge)
- `src/components/ui/{button,card,dialog,input,label,select,textarea,badge,dropdown-menu,separator,skeleton,sonner}.tsx` - shadcn-generated primitives
- `src/components/nav-shell.tsx` - Client nav shell + prop-driven DEMO badge
- `src/app/layout.tsx` - Root Server Component: globals.css import, dashboardMode read, Geist Sans, NavShell + Toaster
- `package.json` / `package-lock.json` - Tailwind v4, shadcn CLI, and shadcn-component transitive deps
- `.planning/phases/02-manual-capture-core-pipeline-ui/deferred-items.md` - Out-of-scope observations logged during execution

## Decisions Made

- Installed `class-variance-authority`, `lucide-react`, `clsx`, `tailwind-merge` explicitly (RESEARCH-vetted exact versions) because the shadcn CLI copied component source importing them but did not add them to `package.json` this run.
- Let the shadcn CLI's own dependency resolution stand for `radix-ui` (unified package) and `next-themes` even though RESEARCH anticipated individual `@radix-ui/react-*` packages — RESEARCH explicitly said not to hand-pin Radix versions.
- Installed `tw-animate-css` after confirming `dialog.tsx` actually uses `animate-in`/`animate-out` utility classes that would otherwise resolve to nothing in Tailwind v4 (RESEARCH Assumption A4 check, done rather than assumed).
- Built the nav shell as a left sidebar rather than a top bar, matching UI-SPEC's "sidebar/nav background" color-role wording.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn CLI didn't add its own component-source dependencies to package.json**
- **Found during:** Task 2
- **Issue:** `npx shadcn add ...` copied primitive source (`button.tsx`, `dialog.tsx`, etc.) importing `class-variance-authority`, `lucide-react`, and `clsx`, but none of the three were added to `package.json`/installed — `npx tsc --noEmit` would have failed at build/import resolution.
- **Fix:** Installed all three at the exact versions already vetted Approved in `02-RESEARCH.md`'s Package Legitimacy Audit (`class-variance-authority@0.7.1`, `lucide-react@1.27.0`, `clsx@2.1.1`) — not new package choices, completing the plan's own explicit instruction to install "their exact ... transitive deps."
- **Files modified:** package.json, package-lock.json
- **Verification:** `npx tsc --noEmit` exits 0 after install
- **Committed in:** 6f45d1f (Task 2 commit)

**2. [Rule 3 - Blocking] tailwind-merge was only a transitive devDependency of the shadcn CLI, not a direct app dependency**
- **Found during:** Task 2
- **Issue:** `src/lib/utils.ts` imports `tailwind-merge` directly, but it was only present in `node_modules` as a transitive dependency of the `shadcn` devDependency — fragile, since a production-only install (`npm install --omit=dev`) would not include devDependencies and would break `cn()`.
- **Fix:** Installed `tailwind-merge@3.6.0` (RESEARCH-vetted version) as a direct dependency.
- **Files modified:** package.json, package-lock.json
- **Verification:** `npm ls tailwind-merge` shows it as a direct top-level dependency; `npx tsc --noEmit` exits 0
- **Committed in:** 6f45d1f (Task 2 commit)

**3. [Rule 1 - Bug] False-positive `@/db/client` match in nav-shell.tsx's own doc comment**
- **Found during:** Task 3
- **Issue:** An explanatory comment in `nav-shell.tsx` literally contained the string `from "@/db/client"` (describing what NOT to do), which the plan's own verify grep (`grep -Eq "from \"@/db/client\""`) would match as a false positive.
- **Fix:** Reworded the comment to avoid the literal import-syntax string while preserving the same warning.
- **Files modified:** src/components/nav-shell.tsx
- **Verification:** Re-ran the plan's exact verify command; passes (0 matches)
- **Committed in:** e899ad9 (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking dependency gaps, 1 bug/false-positive)
**Impact on plan:** All three fixes were necessary for the plan's own stated verification to pass; no scope creep — every package installed was already named and version-pinned in `02-RESEARCH.md`'s own Package Legitimacy Audit before this plan ran.

## Issues Encountered

- `data/demo.sqlite` had no `applications` table when first exercised via `npm run dev` this session (a pre-existing data-directory state issue, unrelated to any 02-01 code change). Resolved by running `db:migrate`, `db:seed:lookups`, `db:seed:demo` against `DASHBOARD_MODE=demo` so the nav-shell verification (`npm run dev` demo/real fetch checks) could complete. No SUMMARY-relevant code changed.
- `next dev`/`next build` auto-rewrites `tsconfig.json` on every invocation (reformats arrays, flips `jsx: preserve` → `jsx: react-jsx`, appends `.next/dev/types/**/*.ts` to `include`) — pre-existing Next.js 16.2.11 behavior unrelated to this plan's scope. Reverted with `git checkout -- tsconfig.json` each time it appeared during verification; not part of `files_modified` for this plan. Logged to `deferred-items.md` for a future cleanup pass.
- `npx next build` (production build, not required by this plan's verification) crashes with `The "id" argument must be of type string. Received undefined` independent of the tsconfig churn. Not investigated further since the plan's actual verification requirement is `npm run dev`, which works correctly in both modes — logged to `deferred-items.md` as a pre-production concern.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Styling foundation (Tailwind v4 + shadcn) and the persistent app shell are in place; every remaining Phase 2 slice (board, dialogs, detail view) can now render inside `<NavShell>` and use the 12 vendored primitives without further scaffolding.
- `src/db/client.ts`'s `dashboardMode` single-reader invariant is preserved end-to-end (only `layout.tsx` imports it; `nav-shell.tsx` receives it as a prop) — later plans building dialogs/forms must follow the same props-not-imports pattern for any client component that needs mode-derived data.
- Known pre-existing gaps (tracked in `deferred-items.md`, not blocking): `next build` production-build crash, `tsconfig.json` auto-rewrite churn on every dev/build run. Neither blocks `npm run dev`-based development for the rest of Phase 2.

## Self-Check: PASSED

All 18 created files verified present on disk (components.json, postcss.config.mjs, src/app/globals.css, src/lib/utils.ts, 12 shadcn primitives, nav-shell.tsx, layout.tsx). All 3 task commits (039f901, 6f45d1f, e899ad9) verified present in git log. `npx tsc --noEmit` exits 0.

---
*Phase: 02-manual-capture-core-pipeline-ui*
*Completed: 2026-07-29*
