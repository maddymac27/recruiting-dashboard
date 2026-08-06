import { drizzle, type NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { pathToFileURL } from "node:url";
import { assertMode, resolveDbPath } from "@/db/paths";
import { openSqliteFile } from "@/db/open-sqlite";
import { runGmailSync } from "@/domain/ingestion";
import {
  finishSyncRun,
  getLatestSuccessfulSyncRun,
  startSyncRun,
} from "@/domain/sync-state";

// scripts/sync.ts — Windows Task Scheduler entrypoint (ING-05, D4-05).
// Reuses the EXACT runGmailSync + startSyncRun/finishSyncRun lifecycle
// src/app/actions.ts's syncGmailAction uses — one code path, no fork, so
// incremental/dedup/fail-loud behavior is provably identical whether the
// sync is manual or scheduled. Bootstraps its own DB connection via
// assertMode/resolveDbPath/openSqliteFile/drizzle({ client }), mirroring
// src/db/migrate.ts's CLI shape (04-PATTERNS.md), rather than importing the
// `import "server-only"`-guarded src/db/client.ts singleton — that
// singleton (and src/gmail/client.ts / src/gmail/oauth.ts, both also
// `import "server-only"`) throws under a plain `tsx` process, since
// `server-only`'s conditional-exports map only no-ops under Next.js's own
// "react-server" bundler resolution condition (confirmed empirically during
// 04-03 execution). See the dynamic-import comment in runScheduledSync
// below and scripts/register-task.ps1's `--conditions=react-server` flag.

export const AT_LOGON_THROTTLE_MS = 4 * 60 * 60 * 1000; // D4-A1 (RESEARCH A1, D4-02)

/**
 * Pure throttle predicate (D4-02/D4-A1) — no DB, no I/O, unit-tested in
 * tests/scripts/sync-throttle.test.ts. True only when a prior SUCCESSFUL
 * sync finished strictly within AT_LOGON_THROTTLE_MS of `now`. Windows
 * Task Scheduler has no built-in "skip if a different trigger ran recently"
 * condition (RESEARCH Pattern 4) — this app-level check is the real gate
 * for the at-logon trigger (Pitfall 5: lock/unlock can fire -AtLogOn often).
 */
export function shouldThrottle(
  lastSuccess: { finishedAt: Date | null } | undefined,
  now: Date,
): boolean {
  if (!lastSuccess?.finishedAt) return false;
  return now.getTime() - lastSuccess.finishedAt.getTime() < AT_LOGON_THROTTLE_MS;
}

async function runScheduledSync(): Promise<void> {
  const mode = process.env.DASHBOARD_MODE;
  assertMode(mode); // fail loud: throws if unset/misspelled (D-13) — same as migrate.ts

  if (mode !== "real") {
    console.error(
      "scripts/sync.ts is real-mode only — refusing to run under DASHBOARD_MODE=demo (D4-05).",
    );
    process.exit(1);
  }

  // Deferred to runtime (never at module top-level): merely IMPORTING this
  // file for shouldThrottle/AT_LOGON_THROTTLE_MS (the throttle test) must
  // never load src/gmail/client.ts or src/gmail/oauth.ts — both carry
  // `import "server-only"`, which throws unless this process was started
  // with `--conditions=react-server` (scripts/register-task.ps1 always
  // passes this flag). Loading them only here keeps the test import safe.
  const { getGmailClient } = await import("@/gmail/client");
  const { hasStoredToken } = await import("@/gmail/oauth");

  if (!hasStoredToken()) {
    console.error(
      "Gmail is not connected — no refresh token stored. Connect Gmail via the app first.",
    );
    process.exit(1);
  }

  const dbPath = resolveDbPath(mode);
  const sqlite = openSqliteFile(dbPath);
  const db: NodeSQLiteDatabase = drizzle({ client: sqlite });

  // D4-05: both lastSync AND the historyId cursor are derived from the last
  // SUCCESSFUL run, not merely the latest run — a failed intervening run
  // neither narrows the fallback window nor loses the last-good cursor.
  const lastSuccess = getLatestSuccessfulSyncRun(db);
  const now = new Date();

  if (shouldThrottle(lastSuccess, now)) {
    console.log(
      `Skipping sync — last success was ${lastSuccess?.finishedAt?.toISOString() ?? "unknown"}, ` +
        `within the ${AT_LOGON_THROTTLE_MS / 3_600_000}h at-logon throttle window (D4-02).`,
    );
    process.exit(0);
  }

  const lastSync = lastSuccess?.finishedAt ?? null;
  const historyId = lastSuccess?.historyId ?? null;

  // Fail-loud (D4-03 requirement 1): every attempt — daily or at-logon,
  // once past the throttle check — records a sync_runs row, exactly like
  // syncGmailAction. No revalidatePath calls here (no Next.js request
  // context in a standalone script).
  const runId = startSyncRun(db);

  try {
    const counts = await runGmailSync(db, getGmailClient(), { lastSync, historyId });

    finishSyncRun(db, runId, {
      status: "success",
      newCount: counts.newCount,
      reviewCount: counts.reviewCount,
      deadLetterCount: counts.deadLetterCount,
      historyId: counts.newHistoryId,
      usedFallback: counts.usedFallback,
    });

    // Ids/counts/status only — never email subject/body/token (D3-01, T-04-09).
    console.log(
      `Sync complete — ${counts.newCount} new, ${counts.reviewCount} to review, ` +
        `${counts.deadLetterCount} dead-letter, usedFallback=${counts.usedFallback}.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Gmail sync failed:", message);
    finishSyncRun(db, runId, { status: "failed", errorMessage: message });
    process.exitCode = 1;
  }
}

const isDirectCliInvocation =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectCliInvocation) {
  void runScheduledSync();
}
