"use client";

import { useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { PipelineSummary } from "@/domain/board";
import type {
  KpiWindowDays,
  KpiWindowDeltas,
} from "@/domain/analytics";

interface KpiRowProps {
  summary: PipelineSummary;
  deltasByWindow: Record<KpiWindowDays, KpiWindowDeltas>;
}

// Static category nouns — only the numeral changes. Restyled (şişe redesign) to
// the big-number card look with a change badge (#2): the big number stays the
// current all-time total; the badge reflects change over the selected window
// (this window's flow vs the prior equal-length window). Yellow ▲ up / red ▼ down.
const KPI_ITEMS: Array<{
  key: keyof PipelineSummary & keyof KpiWindowDeltas;
  label: string;
  accent: string;
}> = [
  { key: "applied", label: "Applied", accent: "bg-blue-500" },
  { key: "savedNotApplied", label: "Saved, not applied", accent: "bg-slate-400" },
  { key: "inProgress", label: "In progress", accent: "bg-emerald-500" },
  { key: "closed", label: "Closed", accent: "bg-rose-500" },
];

const WINDOW_OPTIONS: Array<{ value: KpiWindowDays; label: string }> = [
  { value: 90, label: "3 months" },
  { value: 30, label: "30 days" },
  { value: 7, label: "7 days" },
];

function ChangeBadge({ current, prior }: { current: number; prior: number }) {
  const change = current - prior;
  const pct = prior > 0 ? Math.round(((current - prior) / prior) * 100) : null;

  if (change === 0) {
    return (
      <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-[12px] font-semibold text-muted-foreground">
        —
      </span>
    );
  }

  const up = change > 0;
  const text =
    pct !== null
      ? `${up ? "+" : ""}${pct}%`
      : `${up ? "+" : ""}${change}`;

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${
        up ? "bg-lime-300 text-lime-950" : "bg-red-400 text-white"
      }`}
      title={`This window: ${current} · prior window: ${prior}`}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {text}
    </span>
  );
}

/** Client component — the four DASH-04 summary counts with a windowed change badge. */
export function KpiRow({ summary, deltasByWindow }: KpiRowProps) {
  const [windowDays, setWindowDays] = useState<KpiWindowDays>(90);
  const deltas = deltasByWindow[windowDays];

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex w-fit rounded-lg border border-border bg-secondary p-0.5">
        {WINDOW_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setWindowDays(opt.value)}
            className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors ${
              windowDays === opt.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {KPI_ITEMS.map((item) => (
          <div
            key={item.key}
            className="relative overflow-hidden rounded-xl border border-border bg-card px-5 py-4"
          >
            <span className={`absolute inset-y-0 left-0 w-1 ${item.accent}`} aria-hidden />
            <p className="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
              {item.label}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-[32px] leading-none font-bold text-foreground">
                {summary[item.key]}
              </p>
              <ChangeBadge
                current={deltas[item.key].current}
                prior={deltas[item.key].prior}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
