"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { BoardApplication } from "@/domain/board";
import type { StalenessStatus } from "@/lib/application-staleness";
import { StageChangeDialog, type LookupOption } from "@/components/stage-change-dialog";
import { StagePill } from "@/components/stage-pill";
import { Button } from "@/components/ui/button";

// Excel-style pipeline table (şişe redesign) — client component so columns are
// sortable (click a header) and the rows are filterable (search box + Status
// dropdown). Read-only over the flat BoardApplication model; the only inline
// action is "Change stage".

interface ApplicationTableProps {
  applications: BoardApplication[];
  stages: LookupOption[];
  sources: LookupOption[];
  stalenessByApplication: Map<number, StalenessStatus>;
}

type SortKey =
  | "company"
  | "role"
  | "dateApplied"
  | "status"
  | "lastUpdate"
  | "method";
type SortDir = "asc" | "desc";

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const COLUMNS: Array<{ key: SortKey | null; label: string }> = [
  { key: "company", label: "Company" },
  { key: "role", label: "Role" },
  { key: "dateApplied", label: "Date applied" },
  { key: "status", label: "Status" },
  { key: "lastUpdate", label: "Last update" },
  { key: null, label: "Email thread" },
  { key: "method", label: "Application method" },
  { key: null, label: "" },
];

export function ApplicationTable({
  applications,
  stages,
  sources,
  stalenessByApplication,
}: ApplicationTableProps) {
  const sourceLabelById = useMemo(
    () => new Map(sources.map((s) => [s.id, s.label])),
    [sources],
  );

  const [sortKey, setSortKey] = useState<SortKey>("dateApplied");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sourceLabel = (app: BoardApplication) =>
    app.sourceId != null ? (sourceLabelById.get(app.sourceId) ?? "") : "";

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = applications.filter((app) => {
      if (stageFilter !== "all" && (app.currentStageLabel ?? "") !== stageFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        app.companyName ?? "",
        app.roleTitle ?? "",
        app.currentStageLabel ?? "",
        sourceLabel(app),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const cmpStr = (a: string, b: string) => a.localeCompare(b) * dir;
    const cmpDate = (a: Date | null, b: Date | null) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1; // nulls always last, regardless of dir
      if (b === null) return -1;
      return (a.getTime() - b.getTime()) * dir;
    };

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "company":
          return cmpStr(a.companyName ?? "", b.companyName ?? "");
        case "role":
          return cmpStr(a.roleTitle ?? "", b.roleTitle ?? "");
        case "status":
          return cmpStr(a.currentStageLabel ?? "", b.currentStageLabel ?? "");
        case "method":
          return cmpStr(sourceLabel(a), sourceLabel(b));
        case "dateApplied":
          return cmpDate(a.dateApplied, b.dateApplied);
        case "lastUpdate":
          return cmpDate(a.currentStageSince, b.currentStageSince);
        default:
          return 0;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications, query, stageFilter, sortKey, sortDir]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search company, role, method…"
          className="h-9 w-64 rounded-md border border-border bg-card px-3 text-[14px] outline-none focus:ring-2 focus:ring-ring/40"
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-card px-3 text-[14px] outline-none focus:ring-2 focus:ring-ring/40"
        >
          <option value="all">All stages</option>
          {stages.map((s) => (
            <option key={s.id} value={s.label}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="text-[13px] text-muted-foreground">
          {rows.length} of {applications.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b border-border">
              {COLUMNS.map((col, i) => (
                <th
                  key={i}
                  className="px-4 py-3 text-[12px] font-medium tracking-wide text-muted-foreground uppercase whitespace-nowrap"
                >
                  {col.key ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key as SortKey)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {col.label}
                      {sortKey === col.key ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((app) => {
              const staleness = stalenessByApplication.get(app.id);
              const initial = (app.companyName ?? "?").charAt(0).toUpperCase();

              return (
                <tr
                  key={app.id}
                  className="border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/job/${app.id}`}
                      className="flex items-center gap-2.5 font-medium text-foreground hover:text-primary"
                    >
                      <span
                        className={`flex size-7 shrink-0 items-center justify-center rounded-md text-[13px] font-semibold ${avatarColor(
                          app.companyName ?? "?",
                        )}`}
                      >
                        {initial}
                      </span>
                      <span className="truncate" title={app.companyName ?? undefined}>
                        {app.companyName ?? "Unknown company"}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <span title={app.roleTitle ?? undefined}>
                      {app.roleTitle ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {formatDate(app.dateApplied)}
                  </td>
                  <td className="px-4 py-3">
                    <StagePill label={app.currentStageLabel} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {formatDate(app.currentStageSince)}
                    {staleness && staleness.kind === "gone-quiet" ? (
                      <span className="ml-1 text-[12px] font-medium text-destructive">
                        · quiet {staleness.daysSince}d
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/job/${app.id}`}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Link
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {app.sourceId != null ? (sourceLabelById.get(app.sourceId) ?? "—") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <StageChangeDialog
                      applicationId={app.id}
                      currentStageId={app.currentStageId}
                      stages={stages}
                      trigger={
                        <Button type="button" variant="ghost" size="sm">
                          Change stage
                        </Button>
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
