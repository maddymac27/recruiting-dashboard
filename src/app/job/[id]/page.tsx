import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getApplicationDetail, type ApplicationDetail } from "@/domain/applications";
import { getJobTimeline, type TimelineEntry } from "@/domain/timeline";
import { getContactSummariesForApplication } from "@/domain/contacts";
import { Badge } from "@/components/ui/badge";
import { Timeline, type FormattedTimelineEntry } from "@/components/timeline";
import {
  ContactConversationForm,
  type ExistingContactOption,
} from "@/components/contact-conversation-form";

// Job detail — the DASH-05 read slice (header + unified chronological
// timeline, status transitions + conversations interleaved most-recent-
// first, D2-09) plus the CAP-04/D2-10 inline contact + conversation logging
// write slice (02-06). Reads only go through @/domain/* (domain-owns-SQL
// invariant) — this file never queries the database driver directly; the
// write path goes through Server Actions in ./actions.ts via the
// ContactConversationForm client component.

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
});

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

interface JobDetailPageProps {
  // Next.js 16 delivers dynamic route params as a Promise (RESEARCH
  // Pitfall 6) — this page must `await` it, never destructure it directly.
  params: Promise<{ id: string }>;
}

interface JobDetailData {
  detail: ApplicationDetail | undefined;
  timeline: TimelineEntry[];
  contacts: ExistingContactOption[];
}

function readJobDetailData(applicationId: number): JobDetailData | null {
  try {
    return {
      detail: getApplicationDetail(db, applicationId),
      timeline: getJobTimeline(db, applicationId),
      contacts: getContactSummariesForApplication(db, applicationId),
    };
  } catch {
    // A read-fetch failure surfaces the UI-SPEC error/timeline backstop
    // copy rather than an unhandled crash or a blank page.
    return null;
  }
}

function formatTimelineEntries(
  timeline: TimelineEntry[],
): FormattedTimelineEntry[] {
  return timeline.map((entry, index) => ({
    key: `${entry.kind}-${index}-${entry.occurredAt.getTime()}`,
    kind: entry.kind,
    dateLabel: timestampFormatter.format(entry.occurredAt),
    stageLabel: entry.stageLabel,
    contactName: entry.contactName,
    channel: entry.channel,
    notes: entry.notes,
  }));
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { id } = await params;
  const applicationId = Number(id);

  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    notFound();
  }

  const data = readJobDetailData(applicationId);

  if (!data) {
    return (
      <main className="flex flex-col gap-6 p-8">
        <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
          Couldn&apos;t load this page. Refresh to try again.
        </p>
      </main>
    );
  }

  const { detail, timeline, contacts } = data;

  if (!detail) {
    notFound();
  }

  const dateAppliedLabel = detail.dateApplied
    ? dateFormatter.format(detail.dateApplied)
    : "Saved, not applied yet";
  const entries = formatTimelineEntries(timeline);

  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <p
          className="text-[20px] leading-[1.2] font-semibold text-foreground"
          title={detail.companyName}
        >
          {detail.companyName}
        </p>
        <p className="text-[16px] leading-[1.5] font-normal text-foreground">
          {detail.roleTitle ?? "Untitled role"}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">
            {detail.currentStageLabel ?? "No stage yet"}
          </Badge>
          <span className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
            {dateAppliedLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[20px] leading-[1.2] font-semibold text-foreground">
            Contacts
          </p>
          <ContactConversationForm
            applicationId={detail.id}
            companyId={detail.companyId}
            existingContacts={contacts}
          />
        </div>

        {contacts.length === 0 ? (
          <div className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-border p-6">
            <p className="text-[16px] leading-[1.5] font-normal text-foreground">
              No contacts yet
            </p>
            <p className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
              Log a contact to keep track of who you&apos;ve spoken with.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {contacts.map((contact) => (
              <li
                key={contact.contactId}
                className="rounded-lg border border-border bg-secondary px-4 py-2 text-[16px] leading-[1.5] font-normal text-foreground"
              >
                {contact.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Timeline entries={entries} />
    </main>
  );
}
