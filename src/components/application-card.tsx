import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  ApplicationFormDialog,
  type ApplicationFormEditValues,
  type LookupOption,
} from "@/components/application-form-dialog";
import { StageChangeDialog } from "@/components/stage-change-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { StalenessStatus } from "@/lib/application-staleness";

interface ApplicationCardProps {
  id: number;
  companyName: string;
  roleTitle: string | null;
  roleTypeId: number | null;
  sourceId: number | null;
  postingUrl: string | null;
  /** Raw Date — formatted here (server component), never passed to a client
   *  component (RESEARCH Pitfall 5). Explicit Intl formatter (not a
   *  locale-implicit shorthand) to avoid locale/timezone-dependent output. */
  dateApplied: Date | null;
  currentStageId: number | null;
  stages: LookupOption[];
  roleTypes: LookupOption[];
  sources: LookupOption[];
  /** Pre-computed by src/app/board/page.tsx via the D5-01
   *  getStalenessByApplication(db) read model (05-01) — this component
   *  never derives staleness itself. Only "gone-quiet" renders a badge here;
   *  "saved-nudge" is Today-view-only (UI-SPEC Surface 3) and "none"/absent
   *  render nothing. */
  stalenessStatus?: StalenessStatus;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** Deterministic yyyy-MM-dd (fixed `toISOString`-based conversion, not a
 *  locale-implicit shorthand) — safe to hand to an `<input type="date">`
 *  inside a Client Component with no hydration-mismatch risk. */
function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/**
 * Server component — one board card. Company/role truncate with an
 * ellipsis and carry a `title` attribute for the full value (UI-SPEC
 * long-text/form backstop). The card body links to the job detail route;
 * the edit + change-stage triggers sit below it, outside the `<Link>`, so
 * neither icon-only control also triggers navigation.
 */
export function ApplicationCard({
  id,
  companyName,
  roleTitle,
  roleTypeId,
  sourceId,
  postingUrl,
  dateApplied,
  currentStageId,
  stages,
  roleTypes,
  sources,
  stalenessStatus,
}: ApplicationCardProps) {
  const roleLabel = roleTitle ?? "Untitled role";
  const dateLabel = dateApplied ? dateFormatter.format(dateApplied) : "Saved";

  const editValues: ApplicationFormEditValues = {
    companyName,
    roleTitle: roleTitle ?? "",
    roleTypeId: roleTypeId ? String(roleTypeId) : "",
    sourceId: sourceId ? String(sourceId) : "",
    dateApplied: toDateInputValue(dateApplied),
    postingUrl: postingUrl ?? "",
    stageId: currentStageId ? String(currentStageId) : "",
  };

  return (
    <Card className="gap-2 py-4 transition-colors hover:border-primary/40">
      <CardContent className="flex flex-col gap-2 px-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/job/${id}`} className="block min-w-0 flex-1">
            <p
              className="truncate text-[20px] leading-[1.2] font-semibold text-foreground"
              title={companyName}
            >
              {companyName}
            </p>
            <p
              className="truncate text-[16px] leading-[1.5] font-normal text-foreground"
              title={roleLabel}
            >
              {roleLabel}
            </p>
            <p className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
              {dateLabel}
            </p>
          </Link>
          {stalenessStatus?.kind === "gone-quiet" && (
            <Badge variant="destructive" className="shrink-0">
              <AlertTriangle className="size-3" />
              Gone quiet · {stalenessStatus.daysSince} days
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <ApplicationFormDialog
            mode="edit"
            applicationId={id}
            initialValues={editValues}
            stages={stages}
            roleTypes={roleTypes}
            sources={sources}
          />
          <StageChangeDialog
            applicationId={id}
            currentStageId={currentStageId}
            stages={stages}
          />
        </div>
      </CardContent>
    </Card>
  );
}
