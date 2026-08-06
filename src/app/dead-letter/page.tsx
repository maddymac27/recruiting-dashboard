import Link from "next/link";
import { db } from "@/db/client";
import { listPendingDeadLetter, listResolvedDeadLetter } from "@/domain/dead-letter";
import type { DeadLetterEntry } from "@/db/schema";
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
import { DeadLetterItem, type DeadLetterRow } from "@/components/dead-letter-item";

// Dead-letter queue — the REL-02/D3-04 fail-loud surfacing slice (03-09):
// a Server Component list page reading listPendingDeadLetter/
// listResolvedDeadLetter (03-05), mirroring 03-08's /review page shape
// (Tabs + Table + URL-param pagination, no client pagination state). Rows
// thread down to the client DeadLetterItem for the "View raw email" dialog
// only — this page never renders the raw payload itself.

const PAGE_SIZE = 25;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
});

const DEAD_LETTER_TYPE_LABELS: Record<string, string> = {
  known_sender_failed: "Known sender failed to parse",
  unparseable: "Unparseable",
};

function toDeadLetterRow(entry: DeadLetterEntry): DeadLetterRow {
  return {
    id: entry.id,
    type: entry.type ?? "unparseable",
    sender: entry.sender,
    subject: entry.subject,
    dateLabel: dateFormatter.format(entry.createdAt),
    rawPayload: entry.rawPayload,
  };
}

interface DeadLetterPageData {
  pending: DeadLetterEntry[];
  resolved: DeadLetterEntry[];
}

function readDeadLetterData(): DeadLetterPageData | null {
  try {
    return {
      pending: listPendingDeadLetter(db),
      resolved: listResolvedDeadLetter(db),
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

function TypeBadge({ type }: { type: string }) {
  // D3-04: known_sender_failed is the destructive-red flag; unparseable
  // stays neutral (see 03-UI-SPEC Color section — Destructive reserved for
  // failure signals, first used this phase).
  const variant = type === "known_sender_failed" ? "destructive" : "secondary";
  return <Badge variant={variant}>{DEAD_LETTER_TYPE_LABELS[type] ?? type}</Badge>;
}

function RowCells({ row }: { row: DeadLetterRow }) {
  return (
    <>
      <TableCell>
        <TypeBadge type={row.type} />
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
      <TableCell className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
        {row.dateLabel}
      </TableCell>
    </>
  );
}

interface DeadLetterPageProps {
  // Next.js 16 delivers search params as a Promise, same as dynamic route
  // params — must be awaited, never destructured directly (matches
  // src/app/review/page.tsx).
  searchParams: Promise<{
    tab?: string;
    pendingLimit?: string;
    resolvedLimit?: string;
  }>;
}

export default async function DeadLetterPage({
  searchParams,
}: DeadLetterPageProps) {
  const params = await searchParams;
  const activeTab = params.tab === "resolved" ? "resolved" : "pending";
  const pendingLimit = parseLimit(params.pendingLimit);
  const resolvedLimit = parseLimit(params.resolvedLimit);

  const data = readDeadLetterData();

  if (!data) {
    return (
      <main className="flex flex-col gap-6 p-8">
        <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
          Dead-letter queue
        </h1>
        <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
          Couldn&apos;t load this page. Refresh to try again.
        </p>
      </main>
    );
  }

  const { pending, resolved } = data;
  const visiblePending = pending.slice(0, pendingLimit).map(toDeadLetterRow);
  const visibleResolved = resolved.slice(0, resolvedLimit).map(toDeadLetterRow);

  return (
    <main className="flex flex-col gap-6 p-8">
      <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
        Dead-letter queue
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
              heading="Nothing in the dead-letter queue"
              body="No unparseable mail or known-sender failures to show — that's a good sign."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Sender / Subject</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiblePending.map((row) => (
                    <TableRow key={row.id}>
                      <RowCells row={row} />
                      <TableCell>
                        <DeadLetterItem item={row} />
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
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleResolved.map((row) => (
                    <TableRow key={row.id}>
                      <RowCells row={row} />
                      <TableCell>
                        <DeadLetterItem item={row} />
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
