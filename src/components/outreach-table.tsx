"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { OutreachRow } from "@/domain/outreach";
import { OUTREACH_CHANNELS } from "@/db/validation";
import { OutreachViewDialog } from "@/components/outreach-view-dialog";
import { Button } from "@/components/ui/button";

// Excel-style outreach table (structural clone of application-table.tsx, per
// UI-SPEC Surface 1 / 06-PATTERNS.md). Client component so columns are
// sortable (click a header) and rows are filterable (search box + Channel +
// Responded dropdowns). Recipient is deliberately PLAIN TEXT, not a Link —
// no /contacts/[id] route exists (RESEARCH Pitfall 5, T-06-15).

interface OutreachTableProps {
  rows: OutreachRow[];
  filterChip?: ReactNode;
}

type SortKey = "company" | "channel" | "sentDate" | "responded";
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

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Pill classes — mirrors outreach-view-dialog.tsx's Color map verbatim
// (06-UI-SPEC.md "Color").
const CHANNEL_PILL_CLASSES: Record<string, string> = {
  LinkedIn: "bg-blue-100 text-blue-700",
  Email: "bg-cyan-100 text-cyan-700",
};

const PURPOSE_PILL_CLASSES: Record<string, string> = {
  "Referral ask": "bg-violet-100 text-violet-700",
  "Intro request": "bg-amber-100 text-amber-800",
  "Recruiter outreach": "bg-emerald-100 text-emerald-700",
  "Coffee chat": "bg-rose-100 text-rose-700",
  "Follow-up": "bg-slate-100 text-slate-600",
  Other: "bg-zinc-100 text-zinc-600",
};

const DEFAULT_PILL_CLASSES = "bg-zinc-100 text-zinc-600";

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

const COLUMNS: Array<{ key: SortKey | null; label: string }> = [
  { key: null, label: "Recipient" },
  { key: "company", label: "Company" },
  { key: "channel", label: "Channel" },
  { key: null, label: "Purpose" },
  { key: null, label: "Subject" },
  { key: "sentDate", label: "Sent date" },
  { key: "responded", label: "Responded" },
  { key: null, label: "Outcome" },
  { key: null, label: "" },
];

export function OutreachTable({ rows, filterChip }: OutreachTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("sentDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [respondedFilter, setRespondedFilter] = useState<string>("all");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = rows.filter((row) => {
      if (channelFilter !== "all" && row.channel !== channelFilter) return false;
      if (respondedFilter === "responded" && !row.responded) return false;
      if (respondedFilter === "no" && row.responded) return false;
      if (!q) return true;
      const haystack = [row.contactName, row.companyName, row.subject ?? "", row.outcome ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const cmpStr = (a: string, b: string) => a.localeCompare(b) * dir;
    const cmpDate = (a: Date, b: Date) => (a.getTime() - b.getTime()) * dir;
    const cmpBool = (a: boolean, b: boolean) => (Number(a) - Number(b)) * dir;

    return [...filtered].sort((a, b) => {
      let primary = 0;
      switch (sortKey) {
        case "company":
          primary = cmpStr(a.companyName, b.companyName);
          break;
        case "channel":
          primary = cmpStr(a.channel, b.channel);
          break;
        case "sentDate":
          primary = cmpDate(a.sentDate, b.sentDate);
          break;
        case "responded":
          primary = cmpBool(a.responded, b.responded);
          break;
      }
      // Stable tiebreak by id ascending (independent of sortDir) — equal
      // primary keys never reorder between renders (OUT-03/04 ordering +
      // adjacency edges).
      return primary !== 0 ? primary : a.id - b.id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, channelFilter, respondedFilter, sortKey, sortDir]);

  return (
    <div className="flex flex-col gap-3">
      {filterChip}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipient, company, subject…"
          className="h-9 w-64 rounded-md border border-border bg-card px-3 text-[14px] outline-none focus:ring-2 focus:ring-ring/40"
        />
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-card px-3 text-[14px] outline-none focus:ring-2 focus:ring-ring/40"
        >
          <option value="all">All channels</option>
          {OUTREACH_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {channel}
            </option>
          ))}
        </select>
        <select
          value={respondedFilter}
          onChange={(e) => setRespondedFilter(e.target.value)}
          className="h-9 rounded-md border border-border bg-card px-3 text-[14px] outline-none focus:ring-2 focus:ring-ring/40"
        >
          <option value="all">All</option>
          <option value="responded">Responded</option>
          <option value="no">No response yet</option>
        </select>
        <span className="text-[13px] text-muted-foreground">
          {sortedRows.length} of {rows.length}
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
            {sortedRows.map((row) => {
              const channelClass = CHANNEL_PILL_CLASSES[row.channel] ?? DEFAULT_PILL_CLASSES;
              const purposeClass = PURPOSE_PILL_CLASSES[row.purpose] ?? DEFAULT_PILL_CLASSES;
              const respondedClass = row.responded
                ? "bg-emerald-100 text-emerald-700"
                : "bg-secondary text-secondary-foreground";
              const respondedLabel = row.responded ? "Responded" : "No response yet";

              return (
                <tr
                  key={row.id}
                  className="border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5 font-medium text-foreground">
                      <span
                        className={`flex size-7 shrink-0 items-center justify-center rounded-md text-[13px] font-semibold ${avatarColor(
                          row.contactName,
                        )}`}
                      >
                        {row.contactName.charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate" title={row.contactName}>
                        {row.contactName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {row.companyName}
                  </td>
                  <td className="px-4 py-3">
                    <Pill className={channelClass}>{row.channel}</Pill>
                  </td>
                  <td className="px-4 py-3">
                    <Pill className={purposeClass}>{row.purpose}</Pill>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <span className="truncate" title={row.subject ?? undefined}>
                      {row.subject ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {formatDate(row.sentDate)}
                  </td>
                  <td className="px-4 py-3">
                    <Pill className={respondedClass}>{respondedLabel}</Pill>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <span className="truncate" title={row.outcome ?? undefined}>
                      {row.outcome ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <OutreachViewDialog
                      outreach={row}
                      trigger={
                        <Button type="button" variant="ghost" size="sm">
                          View
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
