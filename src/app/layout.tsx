import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";

import { db, dashboardMode } from "@/db/client";
import { hasStoredToken } from "@/gmail/oauth";
import {
  getDeadLetterCount,
  getLatestSuccessfulSyncRun,
  getLatestSyncRun,
  getReviewCount,
} from "@/domain/sync-state";
import { listRoleTypes, listSources, listStages } from "@/domain/lookups";
import { NavShell } from "@/components/nav-shell";
import type { SyncHealth } from "@/components/ingestion-health";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// layout.tsx is the ONLY place that imports dashboardMode/db — NavShell and
// IngestionHealth (both client components) receive everything derived from
// them only as props (single-DASHBOARD_MODE-reader invariant, RESEARCH
// Pitfall 4 / PROJECT.md D-13 / T-03-02). hasStoredToken() is safe to call
// unconditionally — it no-ops (returns false) in demo mode rather than
// touching .secrets/ (T-03-05). In demo mode the sync-health reads below
// still run (reviewQueue/deadLetter/syncRuns are ordinary tables that exist
// in the demo store too), but IngestionHealth's demo branch never renders
// them (03-03) — only aggregate counts/status cross to the client, never
// token or raw content (T-03-02).

// şişe-style redesign font. Plus Jakarta Sans is a close free match for the
// reference screenshot's clean geometric sans; swappable to any Google Font by
// changing this import. Keeps the `--font-geist-sans` CSS var name so globals
// need no change.
const appFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata = {
  title: "Recruiting Dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const isConnected = hasStoredToken();

  const latestRun = getLatestSyncRun(db);
  // D4-03: lastSuccessAt (distinct from lastSyncAt, which may reflect a
  // LATER failed/running attempt) feeds the staleness banner in
  // IngestionHealth — a stale success is a worse signal than a single
  // recent failure and must be computed from the last SUCCESS specifically.
  const lastSuccess = getLatestSuccessfulSyncRun(db);
  const syncHealth: SyncHealth = {
    lastSyncAt: latestRun
      ? (latestRun.finishedAt ?? latestRun.startedAt ?? null)
      : null,
    lastSyncStatus: (latestRun?.status ?? null) as SyncHealth["lastSyncStatus"],
    reviewCount: getReviewCount(db),
    deadLetterCount: getDeadLetterCount(db),
    hasEverSynced: latestRun !== undefined,
    lastSuccessAt: lastSuccess?.finishedAt ?? null,
  };

  // Lookups for the sidebar's "Add job application" dialog (moved here from the
  // pipeline page in the şişe redesign). Cheap reads; layout stays the single
  // db reader (D-13).
  const stages = listStages(db).map((s) => ({ id: s.id, label: s.label }));
  const roleTypes = listRoleTypes(db).map((r) => ({ id: r.id, label: r.label }));
  const sources = listSources(db).map((s) => ({ id: s.id, label: s.label }));

  return (
    <html lang="en" className={appFont.variable}>
      <body className="font-sans antialiased">
        <TooltipProvider>
          <NavShell
            dashboardMode={dashboardMode}
            isConnected={isConnected}
            syncHealth={syncHealth}
            stages={stages}
            roleTypes={roleTypes}
            sources={sources}
          >
            {children}
          </NavShell>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
