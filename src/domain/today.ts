import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { listBoardApplications, type BoardApplication } from "./board";
import { getLatestConversationDateByApplication } from "./contacts";
import { getStalenessStatus, type StalenessStatus } from "@/lib/application-staleness";

// Today-view read model (DASH-01/DASH-03, D5-01, D5-08) — composes the D5-01
// activity clock from board.ts's `currentStageSince` (the "last status
// transition" half) and contacts.ts's `getLatestConversationDateByApplication`
// (the "last conversation" half), then calls the shared pure predicate from
// src/lib/application-staleness.ts. Follows the same "call an existing flat
// read model, then .map()/.filter() in TypeScript" shape as
// `getPipelineSummary` — never a second grouped SQL query (RESEARCH
// Pattern 3, a hard codebase constraint). Performs no writes (D5-06):
// "gone quiet" is derived at read time only.

export interface TodayItem {
  application: BoardApplication;
  status: StalenessStatus;
}

/**
 * The shared D5-01 "activity clock": `max(last stage change, last
 * conversation)`, falling back to whichever side is present when the other
 * is null. Extracted so `getStalenessByApplication` and `getTodayItems`
 * cannot silently drift from each other (WR-01) — the Today view and the
 * board card's gone-quiet overlay must always agree on this computation.
 */
function computeLastActivityAt(
  application: BoardApplication,
  latestConversationByApplication: Map<number, Date>,
): Date | null {
  const lastConversation =
    latestConversationByApplication.get(application.id) ?? null;
  const lastStageChange = application.currentStageSince;
  return lastConversation && lastStageChange
    ? new Date(Math.max(lastConversation.getTime(), lastStageChange.getTime()))
    : (lastConversation ?? lastStageChange);
}

/**
 * Maps every application id to its computed `StalenessStatus`, including
 * items whose status is `{ kind: "none" }` — the raw per-application map
 * `getTodayItems` filters down to only the flagged rows the Today view
 * renders. Exposed separately so a future caller (e.g. the board card's
 * gone-quiet overlay, UI-SPEC Surface 3) can look up a single application's
 * status without re-deriving `getTodayItems`' own sorted/filtered shape.
 */
export function getStalenessByApplication(
  db: NodeSQLiteDatabase,
  now: Date = new Date(),
): Map<number, StalenessStatus> {
  const boardApplications = listBoardApplications(db);
  const latestConversationByApplication =
    getLatestConversationDateByApplication(db);

  const result = new Map<number, StalenessStatus>();
  for (const application of boardApplications) {
    const lastActivityAt = computeLastActivityAt(
      application,
      latestConversationByApplication,
    );

    result.set(
      application.id,
      getStalenessStatus(
        application.currentStageLabel,
        application.currentStageIsTerminal,
        lastActivityAt,
        now,
      ),
    );
  }
  return result;
}

/**
 * The Today view's flagged item list (DASH-01) — every application whose
 * staleness status is not `{ kind: "none" }`, sorted by `daysSince`
 * descending, ties broken by application id ascending (deterministic,
 * stable ordering per the plan's ordering must-have).
 */
export function getTodayItems(
  db: NodeSQLiteDatabase,
  now: Date = new Date(),
): TodayItem[] {
  const boardApplications = listBoardApplications(db);
  const latestConversationByApplication =
    getLatestConversationDateByApplication(db);

  const items: TodayItem[] = [];
  for (const application of boardApplications) {
    const lastActivityAt = computeLastActivityAt(
      application,
      latestConversationByApplication,
    );

    const status = getStalenessStatus(
      application.currentStageLabel,
      application.currentStageIsTerminal,
      lastActivityAt,
      now,
    );

    if (status.kind !== "none") {
      items.push({ application, status });
    }
  }

  return items.sort((a, b) => {
    if (a.status.kind === "none" || b.status.kind === "none") return 0; // unreachable — filtered above
    const byDaysSince = b.status.daysSince - a.status.daysSince;
    if (byDaysSince !== 0) return byDaysSince;
    return a.application.id - b.application.id;
  });
}
