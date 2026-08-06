// Per-stage pastel status pill — the "different color for each stage" from the
// şişe-style redesign. Pure presentational helper shared by the pipeline table
// and any other surface that renders a stage as a chip. Colors are matched by
// stage label (case-insensitive) with a neutral fallback so a new/unknown stage
// never crashes — it just renders in the default gray.

const STAGE_PILL_CLASSES: Record<string, string> = {
  saved: "bg-slate-100 text-slate-600",
  "saved-not-applied": "bg-slate-100 text-slate-600",
  applied: "bg-blue-100 text-blue-700",
  screen: "bg-violet-100 text-violet-700",
  screening: "bg-violet-100 text-violet-700",
  interview: "bg-emerald-100 text-emerald-700",
  offer: "bg-amber-100 text-amber-800",
  rejected: "bg-rose-100 text-rose-700",
  "no response": "bg-orange-100 text-orange-700",
  "no response / ghosted": "bg-orange-100 text-orange-700",
  ghosted: "bg-orange-100 text-orange-700",
  withdrawn: "bg-zinc-100 text-zinc-600",
};

const DEFAULT_PILL = "bg-secondary text-secondary-foreground";

export function stagePillClasses(label: string | null | undefined): string {
  if (!label) return DEFAULT_PILL;
  return STAGE_PILL_CLASSES[label.trim().toLowerCase()] ?? DEFAULT_PILL;
}

export function StagePill({ label }: { label: string | null | undefined }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-medium ${stagePillClasses(
        label,
      )}`}
    >
      {label ?? "No stage"}
    </span>
  );
}
