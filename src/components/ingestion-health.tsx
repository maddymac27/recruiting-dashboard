"use client";

import Link from "next/link";
import { useTransition, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { connectGmailAction, syncGmailAction } from "@/app/actions";
import { isSyncStale } from "@/lib/staleness";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Sidebar Ingestion Health block (Surface 1 + Surface 5, 03-UI-SPEC).
// Client component — receives dashboardMode/isConnected/syncHealth as props
// from the root Server Component; never directly imports the db client
// module or the server-only Gmail oauth/client modules (single-
// DASHBOARD_MODE-reader invariant, RESEARCH Pitfall 4 / T-03-02). The only
// server touchpoints are connectGmailAction and syncGmailAction. This plan
// (03-10) completes the block: last-sync success/failure line (persistent
// destructive state on failure, REL-03), Review/Dead-letter count badges
// linking to their queues (dead-letter turns destructive red at > 0,
// REL-03), and the non-dismissible neutral REL-04 risk note — which renders
// whenever the shell renders, in demo mode too, since it discloses a fixed
// property of the pipeline's design rather than any live sync state (never
// applied to real token/content, T-03-02).

// The last-sync status a sync_runs row can be in — mirrors
// src/db/validation.ts's SYNC_RUN_STATUSES without importing the
// server-only validation module into a client component.
export type SyncRunStatus = "running" | "success" | "failed";

export interface SyncHealth {
  lastSyncAt: Date | null;
  lastSyncStatus: SyncRunStatus | null;
  reviewCount: number;
  deadLetterCount: number;
  hasEverSynced: boolean;
  // D4-03: last SUCCESSFUL sync time, independent of any later failed run —
  // drives the stale-banner escalation below, computed in layout.tsx via
  // getLatestSuccessfulSyncRun.
  lastSuccessAt: Date | null;
}

interface IngestionHealthProps {
  dashboardMode: "demo" | "real";
  isConnected: boolean;
  syncHealth: SyncHealth;
}

const OAUTH_CONNECT_FAILURE =
  "Couldn't connect your Gmail account. Check your credentials and try again.";

const REL_04_RISK_NOTE =
  "Targeted sender search can miss mail from senders not on the list — this won't show up here at all. Review your inbox periodically for anything the dashboard may have missed.";

// Fixed division ladder for Intl.RelativeTimeFormat — no new dependency.
const RELATIVE_TIME_DIVISIONS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

function formatRelativeTime(date: Date): string {
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  for (const [unit, secondsInUnit] of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return rtf.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }

  return rtf.format(diffSeconds, "second");
}

// Persistent, non-dismissible risk note (REL-04) — neutral/muted, never
// destructive, since it discloses a known limitation rather than an active
// failure (must not visually compete with a real sync failure, 03-UI-SPEC
// Color rules).
function RiskNote() {
  return (
    <Alert>
      <AlertDescription>{REL_04_RISK_NOTE}</AlertDescription>
    </Alert>
  );
}

export function IngestionHealth({
  dashboardMode,
  isConnected,
  syncHealth,
}: IngestionHealthProps) {
  const [isConnectPending, startConnectTransition] = useTransition();
  const [isSyncPending, startSyncTransition] = useTransition();

  // Demo mode never touches Gmail or shows real sync state — but the REL-04
  // disclosure is fixed copy about the pipeline's design, not live data, so
  // it still renders here (task instruction: "renders whenever the shell
  // renders").
  if (dashboardMode !== "real") {
    return (
      <div className="flex flex-col gap-2 px-2">
        <p className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
          Gmail sync is unavailable in demo mode.
        </p>
        <RiskNote />
      </div>
    );
  }

  function handleConnect() {
    startConnectTransition(async () => {
      const result = await connectGmailAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.url) {
        window.location.href = result.url;
      }
      // Otherwise ok:true with no url — already connected, nothing to do.
    });
  }

  function handleSync() {
    startSyncTransition(async () => {
      const result = await syncGmailAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Sync complete — ${result.newCount} new, ${result.reviewCount} to review.`,
      );
    });
  }

  const {
    lastSyncAt,
    lastSyncStatus,
    reviewCount,
    deadLetterCount,
    hasEverSynced,
    lastSuccessAt,
  } = syncHealth;

  let lastSyncLine: ReactNode;
  if (!isConnected) {
    lastSyncLine = (
      <p className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
        Gmail not connected yet.
      </p>
    );
  } else if (isConnected && isSyncStale(lastSuccessAt)) {
    // D4-03: evaluated BEFORE the failed-run branch below — a stale
    // success is a worse signal than a single recent failure and must
    // surface first (fail-loud backstop for the catch-up-only model).
    lastSyncLine = (
      <p className="text-[14px] leading-[1.5] font-semibold text-destructive">
        {`⚠ Sync is stale — last success ${formatRelativeTime(lastSuccessAt!)}`}
      </p>
    );
  } else if (lastSyncStatus === "failed") {
    // Persists until the next successful sync — driven by the stored
    // sync_runs status, not a transient toast (REL-03 at-a-glance
    // requirement).
    lastSyncLine = (
      <p className="text-[14px] leading-[1.5] font-normal text-destructive">
        {lastSyncAt
          ? `Last sync failed — ${formatRelativeTime(lastSyncAt)}`
          : "Last sync failed"}
      </p>
    );
  } else if (lastSyncStatus === "success" && lastSyncAt) {
    lastSyncLine = (
      <p className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
        {`Last synced ${formatRelativeTime(lastSyncAt)}`}
      </p>
    );
  } else if (lastSyncStatus === "running") {
    lastSyncLine = (
      <p className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
        Syncing…
      </p>
    );
  } else {
    // Covers !hasEverSynced (no sync_runs row yet) and any other
    // not-yet-successful state — falls back to the empty state rather than
    // ever rendering a raw "undefined"/"null" (03-UI-SPEC empty coverage).
    lastSyncLine = (
      <p className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
        Never synced
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-2">
      {lastSyncLine}

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/review">
          <Badge variant="secondary">Review ({reviewCount})</Badge>
        </Link>
        <Link href="/dead-letter">
          <Badge variant={deadLetterCount > 0 ? "destructive" : "secondary"}>
            Dead-letter ({deadLetterCount})
          </Badge>
        </Link>
      </div>

      {!isConnected && (
        <Button
          type="button"
          onClick={handleConnect}
          disabled={isConnectPending}
          className="w-full"
        >
          {isConnectPending ? "Connecting…" : "Connect Gmail"}
        </Button>
      )}

      {isConnected ? (
        <Button
          type="button"
          onClick={handleSync}
          disabled={isSyncPending}
          className="w-full"
        >
          {isSyncPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Syncing…
            </>
          ) : (
            "Sync now"
          )}
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="w-full">
              <Button type="button" disabled className="w-full">
                Sync now
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Connect Gmail to enable sync</TooltipContent>
        </Tooltip>
      )}

      <RiskNote />
    </div>
  );
}
