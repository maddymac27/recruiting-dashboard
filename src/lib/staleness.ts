// Pure D4-03 staleness predicate — no server-only imports, no DB/domain
// dependency. This is deliberately a standalone module rather than living
// inside src/components/ingestion-health.tsx (as 04-PATTERNS.md originally
// mapped it): ingestion-health.tsx is a "use client" component and vitest
// here runs with `environment: "node"`, so importing a React client
// component into a node test is fragile. A pure util is also safe to import
// from BOTH the client component and src/app/layout.tsx (a Server
// Component) without pulling server-only db/sync-state code into the
// client bundle. See 04-03-PLAN.md's architecture_note for the full
// rationale — this is a documented deviation from the pattern map.
export const STALE_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // D4-A2 (RESEARCH A2)

/**
 * Whether the last successful sync is stale — no success in more than
 * STALE_THRESHOLD_MS (2 days). `lastSuccessAt === null` means "never
 * synced", which is its own existing UI state, not "stale" (D4-03).
 */
export function isSyncStale(
  lastSuccessAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!lastSuccessAt) return false;
  return now.getTime() - lastSuccessAt.getTime() > STALE_THRESHOLD_MS;
}
