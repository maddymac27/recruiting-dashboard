import { db } from "@/db/client";
import {
  getPipelineSummary,
  listBoardApplications,
  type BoardApplication,
  type PipelineSummary,
} from "@/domain/board";
import { listSources, listStages } from "@/domain/lookups";
import { getStalenessByApplication } from "@/domain/today";
import {
  getKpiDeltasByWindow,
  type KpiWindowDays,
  type KpiWindowDeltas,
} from "@/domain/analytics";
import { ApplicationTable } from "@/components/application-table";
import { KpiRow } from "@/components/kpi-row";
import type { Source, Stage } from "@/db/schema";
import type { StalenessStatus } from "@/lib/application-staleness";

// Pipeline page — the DASH-02/DASH-04 read slice, redesigned (şişe style) from
// a kanban board into an Excel-style table. Reads only go through @/domain/*
// (domain-owns-SQL invariant). The Quick-Save / Add-Application capture actions
// now live in the sidebar (NavShell), so this page is read-focused; per-row
// "Change stage" and the click-through to the detail page cover row actions.

interface PipelineData {
  stages: Stage[];
  sources: Source[];
  boardApplications: BoardApplication[];
  summary: PipelineSummary;
  kpiDeltas: Record<KpiWindowDays, KpiWindowDeltas>;
  stalenessByApplication: Map<number, StalenessStatus>;
}

function readPipelineData(): PipelineData | null {
  try {
    return {
      stages: listStages(db),
      sources: listSources(db),
      boardApplications: listBoardApplications(db),
      summary: getPipelineSummary(db),
      kpiDeltas: getKpiDeltasByWindow(db),
      // Reuses the exact 05-01 predicate/clock (D5-08) — no second staleness
      // computation is introduced here.
      stalenessByApplication: getStalenessByApplication(db),
    };
  } catch (error) {
    // Fail-loud: log before surfacing the error copy so the failure is visible
    // in server logs rather than swallowed silently.
    console.error("Failed to load Pipeline data:", error);
    return null;
  }
}

/** Deterministic row order: dateApplied desc, nulls last, then id asc. */
function compareApplications(a: BoardApplication, b: BoardApplication): number {
  if (a.dateApplied === null && b.dateApplied === null) return a.id - b.id;
  if (a.dateApplied === null) return 1;
  if (b.dateApplied === null) return -1;
  const byDate = b.dateApplied.getTime() - a.dateApplied.getTime();
  if (byDate !== 0) return byDate;
  return a.id - b.id;
}

export default function BoardPage() {
  const data = readPipelineData();

  if (!data) {
    return (
      <main className="flex flex-col gap-6 p-8">
        <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
          Pipeline
        </h1>
        <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
          Couldn&apos;t load this page. Refresh to try again.
        </p>
      </main>
    );
  }

  const {
    stages,
    sources,
    boardApplications,
    summary,
    kpiDeltas,
    stalenessByApplication,
  } = data;

  const stageOptions = stages.map((stage) => ({
    id: stage.id,
    label: stage.label,
  }));
  const sourceOptions = sources.map((source) => ({
    id: source.id,
    label: source.label,
  }));

  if (boardApplications.length === 0) {
    return (
      <main className="flex flex-col gap-6 p-8">
        <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
          Pipeline
        </h1>
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border bg-card p-8">
          <p className="text-[20px] leading-[1.2] font-semibold text-foreground">
            No applications yet
          </p>
          <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
            Use “Add job application” or “Quick-save job” in the sidebar to get
            started.
          </p>
        </div>
      </main>
    );
  }

  const rows = [...boardApplications].sort(compareApplications);

  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
        Pipeline
      </h1>
      <KpiRow summary={summary} deltasByWindow={kpiDeltas} />
      <ApplicationTable
        applications={rows}
        stages={stageOptions}
        sources={sourceOptions}
        stalenessByApplication={stalenessByApplication}
      />
    </main>
  );
}
