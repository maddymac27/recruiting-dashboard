import { db } from "@/db/client";
import { getAnalyticsSummary, getFunnelCounts, type AnalyticsSummary, type FunnelBucket } from "@/domain/analytics";
import { FunnelChart } from "@/components/funnel-chart";

// Analytics view (`/analytics`, DASH-06) — a summary-metrics row plus a
// funnel bar chart computed over the accumulated status-event history.
// Reads only go through @/domain/* (domain-owns-SQL invariant); this file
// never queries the database driver directly and never bypasses the
// DASHBOARD_MODE-resolved `db` handle (T-05-05). All-time only — no
// date-range control (D5-07).

interface AnalyticsData {
  summary: AnalyticsSummary;
  funnel: FunnelBucket[];
}

function readAnalyticsData(): AnalyticsData | null {
  try {
    return {
      summary: getAnalyticsSummary(db),
      funnel: getFunnelCounts(db),
    };
  } catch (error) {
    // Fail-loud: log before surfacing the UI-SPEC error backstop copy so
    // the failure is visible in server logs rather than swallowed silently.
    console.error("Failed to load Analytics data:", error);
    return null;
  }
}

// Static category tiles (UI-SPEC Block A) — only the numeral changes, never
// the label, so a zero-value bucket still renders "0" (never blank/hidden).
function summaryTiles(summary: AnalyticsSummary) {
  return [
    { label: "Total applications", value: String(summary.totalApplications) },
    { label: "Response rate", value: `${summary.responseRatePct}%` },
    { label: "Active", value: String(summary.active) },
    { label: "Closed", value: String(summary.closed) },
    { label: "Offers", value: String(summary.offers) },
    { label: "Rejected", value: String(summary.rejected) },
    { label: "Ghosted", value: String(summary.ghosted) },
  ];
}

export default function AnalyticsPage() {
  const data = readAnalyticsData();

  if (!data) {
    return (
      <main className="flex flex-col gap-6 p-8">
        <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
          Analytics
        </h1>
        <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
          Couldn&apos;t load this page. Refresh to try again.
        </p>
      </main>
    );
  }

  const { summary, funnel } = data;

  if (summary.totalApplications === 0) {
    return (
      <main className="flex flex-col gap-6 p-8">
        <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
          Analytics
        </h1>
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-8">
          <p className="text-[20px] leading-[1.2] font-semibold text-foreground">
            No data yet
          </p>
          <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
            Analytics will populate once you start tracking applications.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-8 p-8">
      <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
        Analytics
      </h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {summaryTiles(summary).map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg border border-border bg-secondary px-4 py-3"
          >
            <p className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
              {tile.label}
            </p>
            <p className="text-[28px] leading-[1.2] font-semibold text-foreground">
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-[20px] leading-[1.2] font-semibold text-foreground">
          Applications by stage reached
        </h2>
        <FunnelChart data={funnel} />
      </div>
    </main>
  );
}
