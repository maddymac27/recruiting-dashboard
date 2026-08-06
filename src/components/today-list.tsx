import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import type { TodayItem } from "@/domain/today";
import {
  ContactConversationForm,
  type ExistingContactOption,
} from "@/components/contact-conversation-form";
import { StageChangeDialog, type LookupOption } from "@/components/stage-change-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface TodayListProps {
  items: TodayItem[];
  /** Which of the two Today-view sections this list renders — drives the
   *  urgency badge styling/copy and which inline actions appear (D5-05,
   *  UI-SPEC Surface 1). Every item passed in must already have a matching
   *  `status.kind` — the caller (src/app/page.tsx) is responsible for the
   *  section split. */
  kind: "gone-quiet" | "saved-nudge";
  stages: LookupOption[];
  /** Existing contacts per application, keyed by application id — only
   *  needed (and only populated by the caller) for gone-quiet rows, which
   *  render the "Log a follow-up" action. */
  existingContactsByApplication?: Map<number, ExistingContactOption[]>;
}

/**
 * Server Component — one Card per TodayItem for a single Today-view section
 * (Section A "Needs a follow-up" / Section B "Not yet applied", UI-SPEC
 * Surface 1). Company/role truncate-with-title mirrors
 * application-card.tsx. Row inline actions sit OUTSIDE the click-through
 * Link so neither also triggers navigation. No snooze/dismiss control
 * anywhere (D5-05, explicit exclusion) — rows clear only via the inline
 * actions (which reset the D5-01 clock) or by editing the application from
 * its detail page.
 */
export function TodayList({
  items,
  kind,
  stages,
  existingContactsByApplication,
}: TodayListProps) {
  return (
    <div className="flex flex-col gap-3">
      {items.map(({ application, status }) => {
        if (status.kind === "none") return null; // unreachable — getTodayItems already filters
        const roleLabel = application.roleTitle ?? "Untitled role";

        return (
          <Card
            key={application.id}
            className="gap-2 py-4 transition-colors hover:border-primary/40"
          >
            <CardContent className="flex flex-col gap-2 px-4">
              <Link href={`/job/${application.id}`} className="block">
                <p
                  className="truncate text-[20px] leading-[1.2] font-semibold text-foreground"
                  title={application.companyName}
                >
                  {application.companyName}
                </p>
                <p
                  className="truncate text-[16px] leading-[1.5] font-normal text-foreground"
                  title={roleLabel}
                >
                  {roleLabel}
                </p>
              </Link>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {application.currentStageLabel ?? "No stage yet"}
                </Badge>
                {kind === "gone-quiet" ? (
                  <Badge variant="destructive">
                    <AlertTriangle className="size-3" />
                    Gone quiet · {status.daysSince} days
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <Clock className="size-3" />
                    Saved · {status.daysSince} days ago
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                {kind === "gone-quiet" && (
                  <ContactConversationForm
                    applicationId={application.id}
                    companyId={application.companyId}
                    existingContacts={
                      existingContactsByApplication?.get(application.id) ?? []
                    }
                    trigger={
                      <Button type="button">Log a follow-up</Button>
                    }
                  />
                )}
                <StageChangeDialog
                  applicationId={application.id}
                  currentStageId={application.currentStageId}
                  stages={stages}
                  trigger={
                    <Button type="button" variant="outline">
                      Change stage
                    </Button>
                  }
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
