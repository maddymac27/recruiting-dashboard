# Deferred Items — Phase 01

Out-of-scope discoveries logged during execution, not fixed per the deviation-rules scope boundary (only auto-fix issues directly caused by the current task's changes).

## From Plan 01-01, Task 2 (npm install)

**Item:** `npm audit` reports 3 vulnerabilities (1 moderate, 2 high) after `npm install`:
- `postcss` (moderate) — XSS via unescaped `</style>` in CSS stringify output — transitive dependency of `next@16.2.11`.
- `sharp` (high) — inherited `libvips` CVEs (CVE-2026-33327/33328/35590/35591) — transitive dependency of `next@16.2.11`.

**Why deferred:** Both are transitive dependencies pulled in by the locked/researched `next@16.2.11` version itself, not something Task 2's own code or config introduced. `npm audit fix --force` would force a breaking Next.js version change, which is out of this plan's scope (schema + scaffold, not dependency-security triage) and risks destabilizing the pinned stack CLAUDE.md/RESEARCH.md locked in.

**Recommendation:** Re-check `npm audit` at the start of Phase 2 (next plan that touches `next.config.ts`/build tooling) or whenever `next` is next intentionally upgraded; address then if still present.

## From Plan 01-02, Task 3 (walking-skeleton liveness verification)

**Item:** `next-env.d.ts` (Next.js-generated) is not in `.gitignore`. Running `next dev`/`next build` regenerates it and re-injects a tsconfig plugin block.

**Why deferred:** Non-blocking — build/tests/liveness all pass without it; it only surfaces as uncommitted noise (`git status`) after running the dev server locally.

**Recommendation:** Add `next-env.d.ts` to `.gitignore` in a future cleanup pass.
