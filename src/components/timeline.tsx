import { Skeleton } from "@/components/ui/skeleton";

/**
 * Display-ready timeline entry — dates are already formatted to strings by
 * the parent Server Component (RESEARCH Pitfall 5: date formatting happens
 * once, server-side, before crossing into any presentational component).
 */
export interface FormattedTimelineEntry {
  key: string;
  kind: "status_event" | "conversation";
  dateLabel: string;
  // status_event fields
  stageLabel?: string | null;
  // conversation fields
  contactName?: string;
  channel?: string | null;
  notes?: string | null;
}

interface TimelineProps {
  entries: FormattedTimelineEntry[];
}

/**
 * Server component — renders the DASH-05/D2-09 unified chronological
 * timeline. Every free-text value (conversation notes, contact name,
 * channel) renders as a plain escaped JSX text node — never through
 * React's raw-HTML injection escape hatch (stored-XSS mitigation, threat
 * T-02-09). Notes wrap fully with no truncation or character limit
 * (UI-SPEC long-text/timeline backstop) — no `truncate`, `line-clamp`, or
 * fixed-height/overflow-hidden class is applied to notes text. The
 * timeline scrolls with the page; no pagination this phase.
 */
export function Timeline({ entries }: TimelineProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-8">
        <p className="text-[20px] leading-[1.2] font-semibold text-foreground">
          No history yet
        </p>
        <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
          Status changes and conversations will show up here as you log
          them.
        </p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-4">
      {entries.map((entry) => (
        <li
          key={entry.key}
          className="flex flex-col gap-1 rounded-lg border border-border bg-secondary p-4"
        >
          <p className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
            {entry.dateLabel}
          </p>

          {entry.kind === "status_event" ? (
            <p className="text-[16px] leading-[1.5] font-normal text-foreground">
              Status changed to{" "}
              <span className="font-semibold">
                {entry.stageLabel ?? "Unknown stage"}
              </span>
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
                {entry.contactName ?? "Unknown contact"}
                {entry.channel ? ` · ${entry.channel}` : ""}
              </p>
              <p className="whitespace-pre-wrap break-words text-[16px] leading-[1.5] font-normal text-foreground">
                {entry.notes ?? "No notes recorded."}
              </p>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * Row-shaped Skeleton placeholders for the loading fallback (UI-SPEC
 * loading/timeline backstop) — no spinner. Wired into
 * src/app/job/[id]/loading.tsx.
 */
export function TimelineSkeleton() {
  const rowPlaceholders = Array.from({ length: 4 });

  return (
    <div className="flex flex-col gap-4">
      {rowPlaceholders.map((_, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-lg border border-border bg-secondary p-4"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
