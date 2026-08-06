import { BoardColumn } from "@/components/board-column";
import type { LookupOption } from "@/components/application-form-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { BoardApplication } from "@/domain/board";
import type { Stage } from "@/db/schema";
import type { StalenessStatus } from "@/lib/application-staleness";

interface PipelineBoardProps {
  stages: Stage[];
  grouped: Map<number, BoardApplication[]>;
  roleTypes: LookupOption[];
  sources: LookupOption[];
  /** Pre-computed by src/app/board/page.tsx via the 05-01
   *  getStalenessByApplication(db) read model (D5-08) — threaded straight
   *  through to BoardColumn/ApplicationCard, never recomputed here. */
  stalenessByApplication: Map<number, StalenessStatus>;
}

/**
 * Server component — one column per stage, read from the `stages` lookup
 * in canonical order (D2-05), never a hard-coded list. Also threads the
 * stage/roleType/source lookups down to every card's edit + change-stage
 * dialogs (02-05).
 */
export function PipelineBoard({
  stages,
  grouped,
  roleTypes,
  sources,
  stalenessByApplication,
}: PipelineBoardProps) {
  const stageOptions: LookupOption[] = stages.map((stage) => ({
    id: stage.id,
    label: stage.label,
  }));

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => (
        <BoardColumn
          key={stage.id}
          stageLabel={stage.label}
          applications={grouped.get(stage.id) ?? []}
          stages={stageOptions}
          roleTypes={roleTypes}
          sources={sources}
          stalenessByApplication={stalenessByApplication}
        />
      ))}
    </div>
  );
}

/**
 * Card-shaped Skeleton placeholders for the loading fallback (UI-SPEC
 * loading/board backstop) — no spinner. Mirrors the real board's column
 * shape at a fixed count so layout doesn't shift once real data lands.
 */
export function PipelineBoardSkeleton() {
  const columnPlaceholders = Array.from({ length: 8 });
  const cardPlaceholders = Array.from({ length: 3 });

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columnPlaceholders.map((_, columnIndex) => (
        <div
          key={columnIndex}
          className="flex w-72 shrink-0 flex-col gap-3 rounded-lg bg-secondary p-4"
        >
          <Skeleton className="h-5 w-24" />
          {cardPlaceholders.map((_, cardIndex) => (
            <Skeleton key={cardIndex} className="h-24 rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}
