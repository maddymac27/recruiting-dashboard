"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

// Client chrome only — receives a plain, already-aggregated array of
// {stageLabel, count} as a prop from the root Server Component
// (src/app/analytics/page.tsx). This file must never directly import the db
// client module (server->client boundary, RESEARCH Pattern 4 / T-05-06) —
// only serializable numbers/strings ever cross into this component.
interface FunnelChartProps {
  data: Array<{ stageLabel: string; count: number }>;
}

// Single accent fill (the theme --primary), no per-stage colors — UI-SPEC's
// explicit "basic" funnel scope guardrail against ANLYT-01/02/03 richer-analytics
// creep, and RESEARCH's documented anti-pattern (native recharts <Funnel>
// is deliberately NOT used; this is a horizontal BarChart instead). Referencing
// the theme token (not a literal hex) keeps the bar in sync with the palette.
const chartConfig = {
  count: { label: "Applications", color: "var(--primary)" },
} satisfies ChartConfig;

export function FunnelChart({ data }: FunnelChartProps) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[240px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="stageLabel"
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
