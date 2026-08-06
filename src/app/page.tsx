import { db } from "@/db/client";
import { getTodayItems, type TodayItem } from "@/domain/today";
import { listStages } from "@/domain/lookups";
import { getContactSummariesForApplication } from "@/domain/contacts";
import { TodayList } from "@/components/today-list";
import type { ExistingContactOption } from "@/components/contact-conversation-form";
import type { LookupOption } from "@/components/stage-change-dialog";

// Today view — the new landing page at `/` (D5-04). Surfaces applications
// needing attention: gone-quiet (DASH-01/DASH-03, per-stage threshold,
// D5-01/D5-02) and saved-not-applied (a separate, lower-urgency nudge,
// D5-02). Reads only go through @/domain/* (domain-owns-SQL invariant) —
// this file never queries the database driver directly; the two inline row
// actions mutate via the existing changeStageAction/logConversationAction
// Server Actions, reused verbatim (D5-05). "Gone quiet" is a derived,
// non-destructive read-time overlay only — this page never writes
// (D5-06).

interface TodayData {
  goneQuietItems: TodayItem[];
  savedNudgeItems: TodayItem[];
  stageOptions: LookupOption[];
  existingContactsByApplication: Map<number, ExistingContactOption[]>;
}

function readTodayData(): TodayData | null {
  try {
    const items = getTodayItems(db);
    const goneQuietItems = items.filter(
      (item) => item.status.kind === "gone-quiet",
    );
    const savedNudgeItems = items.filter(
      (item) => item.status.kind === "saved-nudge",
    );

    const stageOptions = listStages(db).map((stage) => ({
      id: stage.id,
      label: stage.label,
    }));

    // Contact summaries are fetched only for gone-quiet rows (the ones that
    // render "Log a follow-up"), not the full board — bounded by the
    // already-filtered flagged-item count, not a per-board-card N+1
    // (RESEARCH Pitfall 3 concerns a cross-application aggregate needed for
    // EVERY card; this is the same single-application lookup the job-detail
    // page already makes, just scoped to a small flagged subset).
    const existingContactsByApplication = new Map<
      number,
      ExistingContactOption[]
    >();
    for (const item of goneQuietItems) {
      existingContactsByApplication.set(
        item.application.id,
        getContactSummariesForApplication(db, item.application.id),
      );
    }

    return {
      goneQuietItems,
      savedNudgeItems,
      stageOptions,
      existingContactsByApplication,
    };
  } catch (error) {
    // Fail-loud: log before surfacing the UI-SPEC error backstop copy so
    // the failure is visible in server logs rather than swallowed silently.
    console.error("Failed to load Today view data:", error);
    return null;
  }
}

export default function TodayPage() {
  const data = readTodayData();

  if (!data) {
    return (
      <main className="flex flex-col gap-6 p-8">
        <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
          Today
        </h1>
        <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
          Couldn&apos;t load this page. Refresh to try again.
        </p>
      </main>
    );
  }

  const {
    goneQuietItems,
    savedNudgeItems,
    stageOptions,
    existingContactsByApplication,
  } = data;

  if (goneQuietItems.length === 0 && savedNudgeItems.length === 0) {
    return (
      <main className="flex flex-col gap-6 p-8">
        <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
          Today
        </h1>
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-8">
          <p className="text-[20px] leading-[1.2] font-semibold text-foreground">
            You&apos;re all caught up
          </p>
          <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
            Nothing needs your attention right now — check back after your
            next sync.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
        Today
      </h1>

      {goneQuietItems.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[20px] leading-[1.2] font-semibold text-foreground">
            Needs a follow-up
          </h2>
          <TodayList
            items={goneQuietItems}
            kind="gone-quiet"
            stages={stageOptions}
            existingContactsByApplication={existingContactsByApplication}
          />
        </div>
      )}

      {savedNudgeItems.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[20px] leading-[1.2] font-semibold text-foreground">
            Not yet applied
          </h2>
          <TodayList
            items={savedNudgeItems}
            kind="saved-nudge"
            stages={stageOptions}
          />
        </div>
      )}
    </main>
  );
}
