// Pure D5-08 application-staleness predicate — no server-only imports, no
// DB/domain dependency. This is a standalone module, deliberately structured
// like src/lib/staleness.ts (Phase 4's sync-staleness predicate), so it is
// safe to import from BOTH a Server Component (Today view, board card) and
// any future "use client" component with zero DB/server-only imports.
// Do NOT import this module from src/lib/staleness.ts or vice versa — the
// two are functionally unrelated (RESEARCH Pitfall 4): staleness.ts answers
// "is the Gmail sync stale" (single global threshold), this module answers
// "is THIS application gone quiet" (a per-stage threshold map).
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const GONE_QUIET_THRESHOLDS_DAYS: Record<string, number> = {
  Applied: 14,
  Screen: 10,
  Interview: 10,
};
export const SAVED_NUDGE_THRESHOLD_DAYS = 7;

export type StalenessStatus =
  | { kind: "gone-quiet"; daysSince: number }
  | { kind: "saved-nudge"; daysSince: number }
  | { kind: "none" };

/**
 * `stageLabel` and `isTerminal` come from the same stages join every other
 * read model already uses (src/domain/board.ts `currentStageLabel` /
 * `currentStageIsTerminal`). `lastActivityAt` is the D5-01 clock —
 * max(currentStageSince, latest conversation date) — computed by the caller
 * (src/domain/today.ts), NOT inside this pure module.
 *
 * Short-circuits to `{ kind: "none" }` on a null stageLabel OR a truthy
 * isTerminal — terminality is always keyed on the explicit `isTerminal`
 * column, never inferred from the stage label string (RESEARCH Pitfall 1,
 * D5-06: Ghosted stays a manual terminal stage; this predicate must never
 * flag any terminal stage regardless of activity age).
 */
export function getStalenessStatus(
  stageLabel: string | null,
  isTerminal: boolean | null,
  lastActivityAt: Date | null,
  now: Date = new Date(),
): StalenessStatus {
  if (!stageLabel || isTerminal) return { kind: "none" };

  if (stageLabel === "Saved") {
    if (!lastActivityAt) return { kind: "none" };
    const daysSince = Math.floor(
      (now.getTime() - lastActivityAt.getTime()) / MS_PER_DAY,
    );
    return daysSince >= SAVED_NUDGE_THRESHOLD_DAYS
      ? { kind: "saved-nudge", daysSince }
      : { kind: "none" };
  }

  const threshold = GONE_QUIET_THRESHOLDS_DAYS[stageLabel];
  if (threshold === undefined || !lastActivityAt) return { kind: "none" };

  const daysSince = Math.floor(
    (now.getTime() - lastActivityAt.getTime()) / MS_PER_DAY,
  );
  return daysSince >= threshold
    ? { kind: "gone-quiet", daysSince }
    : { kind: "none" };
}
