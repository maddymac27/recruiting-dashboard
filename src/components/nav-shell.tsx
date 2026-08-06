"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { IngestionHealth, type SyncHealth } from "@/components/ingestion-health";
import { ApplicationFormDialog } from "@/components/application-form-dialog";
import { QuickSaveDialog } from "@/components/quick-save-dialog";
import { cn } from "@/lib/utils";

type LookupOption = { id: number; label: string };

// Client chrome only — receives `dashboardMode` + lookups as props from the
// root Server Component (src/app/layout.tsx). This file must never directly
// import the db client module (single-DASHBOARD_MODE-reader invariant,
// RESEARCH Pitfall 4 / PROJECT.md D-13).
interface NavShellProps {
  dashboardMode: "demo" | "real";
  isConnected: boolean;
  syncHealth: SyncHealth;
  stages: LookupOption[];
  roleTypes: LookupOption[];
  sources: LookupOption[];
  children: ReactNode;
}

const NAV_ITEMS: Array<{ href: string; label: string; match: (p: string) => boolean }> = [
  { href: "/", label: "Today", match: (p) => p === "/" },
  { href: "/board", label: "Pipeline", match: (p) => p.startsWith("/board") },
  { href: "/analytics", label: "Analytics", match: (p) => p.startsWith("/analytics") },
  { href: "/contacts", label: "Contact Database", match: (p) => p.startsWith("/contacts") },
  { href: "/outreach", label: "Outreach", match: (p) => p.startsWith("/outreach") },
  { href: "/review", label: "Review", match: (p) => p.startsWith("/review") },
  { href: "/dead-letter", label: "Dead-letter", match: (p) => p.startsWith("/dead-letter") },
];

export function NavShell({
  dashboardMode,
  isConnected,
  syncHealth,
  stages,
  roleTypes,
  sources,
  children,
}: NavShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col gap-6 border-r border-border bg-card px-4 py-6">
        <div className="flex items-center justify-between px-2">
          <span className="text-lg font-semibold text-foreground">
            Recruiting Dashboard
          </span>
        </div>

        {dashboardMode === "demo" && (
          <div className="px-2">
            <Badge>DEMO</Badge>
          </div>
        )}

        {/* Capture actions — moved here from the pipeline page (şişe redesign)
            and stacked above the sync/health section. Two distinct theme
            colors: Add = green primary, Quick-save = neutral gray. */}
        <div className="flex flex-col gap-2">
          <ApplicationFormDialog
            mode="add"
            triggerLabel="+ Add job application"
            stages={stages}
            roleTypes={roleTypes}
            sources={sources}
            triggerClassName="w-full justify-center"
          />
          <QuickSaveDialog
            triggerLabel="Quick-save job"
            triggerClassName="w-full justify-center"
          />
        </div>

        <IngestionHealth
          dashboardMode={dashboardMode}
          isConnected={isConnected}
          syncHealth={syncHealth}
        />

        <nav className="flex flex-col gap-1" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-black/5",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 bg-background">{children}</main>
    </div>
  );
}
