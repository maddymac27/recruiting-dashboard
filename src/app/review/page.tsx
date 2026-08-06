import Link from "next/link";
import { db } from "@/db/client";
import { listBoardApplications } from "@/domain/board";
import { getContactSummariesForApplication } from "@/domain/contacts";
import {
  listPendingReviewItems,
  listResolvedReviewItems,
} from "@/domain/review-queue";
import type { ReviewQueueEntry } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ReviewQueueItem,
  type ApplicationOption,
  type ReviewRow,
} from "@/components/review-queue-item";

// Review Queue — the REL-01 vertical slice (03-08): a Server Component list
// page reading listPendingReviewItems/listResolvedReviewItems (03-05) plus
// the application/contact lookup data every row's dialog needs, threaded
// down as props so review-queue-item.tsx (client) never imports the
// database client (board-column.tsx prop-threading convention). Pagination
// is a "simple count-based reveal" via the ?pendingLimit/?resolvedLimit
// query params (D3-06 large one-time backfill) rather than client-side
// pagination state, keeping this page a pure Server Component.

const PAGE_SIZE = 25;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
});

const REVIEW_TYPE_LABELS: Record<string, string> = {
  low_confidence_match: "Possible match",
  unmatched_confirm_create: "Unmatched",
  label_mail: "Label mail",
};

const RESOLUTION_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  reassigned: "Reassigned",
  rejected: "Rejected",
};

/** Deterministic yyyy-MM-dd — safe to hand to a Client Component's
 *  `<input type="date">` without a hydration-mismatch risk (matches
 *  application-card.tsx's toDateInputValue helper). */
function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toReviewRow(entry: ReviewQueueEntry): ReviewRow {
  return {
    id: entry.id,
    type: entry.type ?? "label_mail",
    status: entry.status,
    sender: entry.sender,
    subject: entry.subject,
    bodyText: entry.bodyText,
    parsedCompany: entry.parsedCompany,
    parsedRoleTitle: entry.parsedRoleTitle,
    dateLabel: entry.parsedEventDate
      ? dateFormatter.format(entry.parsedEventDate)
      : null,
    dateInputValue: entry.parsedEventDate
      ? toDateInputValue(entry.parsedEventDate)
      : null,
    candidateApplicationId: entry.candidateApplicationId,
  };
}

interface ReviewPageData {
  pending: ReviewQueueEntry[];
  resolved: ReviewQueueEntry[];
  applications: ApplicationOption[];
}

function readReviewData(): ReviewPageData | null {
  try {
    const applications: ApplicationOption[] = listBoardApplications(db).map(
      (app) => ({
        id: app.id,
        companyId: app.companyId,
        label: app.roleTitle
          ? `${app.companyName} — ${app.roleTitle}`
          : app.companyName,
        contacts: getContactSummariesForApplication(db, app.id).map(
          (contact) => ({ contactId: contact.contactId, name: contact.name }),
        ),
      }),
    );

    return {
      pending: listPendingReviewItems(db),
      resolved: listResolvedReviewItems(db),
      applications,
    };
  } catch {
    // A read-fetch failure surfaces the UI-SPEC error/list-fetch backstop
    // copy rather than an unhandled crash or a blank page.
    return null;
  }
}

function parseLimit(raw: string | undefined): number {
  const parsed = raw ? Number(raw) : PAGE_SIZE;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : PAGE_SIZE;
}

function EmptyState({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-8">
      <p className="text-[20px] leading-[1.2] font-semibold text-foreground">
        {heading}
      </p>
      <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function RowCells({ row }: { row: ReviewRow }) {
  return (
    <>
      <TableCell>
        <Badge variant="secondary">
          {REVIEW_TYPE_LABELS[row.type] ?? row.type}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex max-w-64 flex-col gap-0.5">
          <span
            className="truncate text-[16px] leading-[1.5] font-normal text-foreground"
            title={row.sender ?? undefined}
          >
            {row.sender ?? "—"}
          </span>
          <span
            className="truncate text-[14px] leading-[1.5] font-normal text-muted-foreground"
            title={row.subject ?? undefined}
          >
            {row.subject ?? "—"}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="text-[16px] leading-[1.5] font-normal text-foreground">
            {row.parsedCompany ?? "—"}
          </span>
          <span className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
            {row.parsedRoleTitle ?? "—"}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
        {row.dateLabel ?? "—"}
      </TableCell>
    </>
  );
}

interface ReviewPageProps {
  // Next.js 16 delivers search params as a Promise, same as dynamic route
  // params — must be awaited, never destructured directly.
  searchParams: Promise<{
    tab?: string;
    pendingLimit?: string;
    resolvedLimit?: string;
  }>;
}

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const params = await searchParams;
  const activeTab = params.tab === "resolved" ? "resolved" : "pending";
  const pendingLimit = parseLimit(params.pendingLimit);
  const resolvedLimit = parseLimit(params.resolvedLimit);

  const data = readReviewData();

  if (!data) {
    return (
      <main className="flex flex-col gap-6 p-8">
        <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
          Review queue
        </h1>
        <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
          Couldn&apos;t load this page. Refresh to try again.
        </p>
      </main>
    );
  }

  const { pending, resolved, applications } = data;
  const visiblePending = pending.slice(0, pendingLimit).map(toReviewRow);
  const visibleResolved = resolved.slice(0, resolvedLimit).map(toReviewRow);

  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
        Review queue
      </h1>

      <Tabs defaultValue={activeTab} className="w-full">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="resolved">
            Resolved ({resolved.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="flex flex-col gap-4">
          {pending.length === 0 ? (
            <EmptyState
              heading="Review queue is empty"
              body="Every recent email matched cleanly — nothing needs your review right now."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Sender / Subject</TableHead>
                    <TableHead>Company / Role</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiblePending.map((row) => (
                    <TableRow key={row.id}>
                      <RowCells row={row} />
                      <TableCell>
                        <ReviewQueueItem item={row} applications={applications} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {pending.length > pendingLimit && (
                <div className="flex justify-center pt-2">
                  <Button asChild variant="secondary">
                    <Link
                      href={`?tab=pending&pendingLimit=${pendingLimit + PAGE_SIZE}&resolvedLimit=${resolvedLimit}`}
                    >
                      Load more
                    </Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="resolved" className="flex flex-col gap-4">
          {resolved.length === 0 ? (
            <EmptyState
              heading="Nothing resolved yet"
              body="Items you confirm, create, or attach will show up here."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Sender / Subject</TableHead>
                    <TableHead>Company / Role</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleResolved.map((row) => (
                    <TableRow key={row.id}>
                      <RowCells row={row} />
                      <TableCell>
                        <Badge variant="secondary">
                          {RESOLUTION_LABELS[row.status] ?? row.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {resolved.length > resolvedLimit && (
                <div className="flex justify-center pt-2">
                  <Button asChild variant="secondary">
                    <Link
                      href={`?tab=resolved&pendingLimit=${pendingLimit}&resolvedLimit=${resolvedLimit + PAGE_SIZE}`}
                    >
                      Load more
                    </Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
