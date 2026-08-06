import { ApplicationCard } from "@/components/application-card";
import type { LookupOption } from "@/components/application-form-dialog";
import type { BoardApplication } from "@/domain/board";
import type { StalenessStatus } from "@/lib/application-staleness";

interface BoardColumnProps {
  stageLabel: string;
  applications: BoardApplication[];
  stages: LookupOption[];
  roleTypes: LookupOption[];
  sources: LookupOption[];
  /** Pre-computed by src/app/board/page.tsx via the 05-01
   *  getStalenessByApplication(db) read model (D5-08) — looked up per card
   *  by application id, never recomputed here. */
  stalenessByApplication: Map<number, StalenessStatus>;
}

/**
 * Server component — one stage column: header + cards, or the per-column
 * empty state when the stage has zero applications. The card list scrolls
 * independently of other columns (UI-SPEC overflow/board backstop) —
 * cards never truncate their column, only their own text content does.
 * `stages`/`roleTypes`/`sources` are threaded straight through to each card
 * so its embedded edit + change-stage dialogs (02-05) never import the
 * database client themselves.
 */
export function BoardColumn({
  stageLabel,
  applications,
  stages,
  roleTypes,
  sources,
  stalenessByApplication,
}: BoardColumnProps) {
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-secondary">
      <div className="shrink-0 px-4 py-3">
        <h2 className="text-[20px] leading-[1.2] font-semibold text-foreground">
          {stageLabel}
        </h2>
        <span className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
          {applications.length}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 pb-4"
        style={{ maxHeight: "calc(100vh - 320px)" }}
      >
        {applications.length === 0 ? (
          <div className="flex flex-col gap-1 rounded-md border border-dashed border-border p-4 text-center">
            <p className="text-[20px] leading-[1.2] font-semibold text-foreground">
              Nothing here yet
            </p>
            <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
              Applications will show up here as they move through this stage.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {applications.map((application) => (
              <ApplicationCard
                key={application.id}
                id={application.id}
                companyName={application.companyName}
                roleTitle={application.roleTitle}
                roleTypeId={application.roleTypeId}
                sourceId={application.sourceId}
                postingUrl={application.postingUrl}
                dateApplied={application.dateApplied}
                currentStageId={application.currentStageId}
                stages={stages}
                roleTypes={roleTypes}
                sources={sources}
                stalenessStatus={stalenessByApplication.get(application.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
