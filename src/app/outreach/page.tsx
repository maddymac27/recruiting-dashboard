import Link from "next/link";
import { db } from "@/db/client";
import { listOutreach, type OutreachRow } from "@/domain/outreach";
import { listContactsWithOutreach } from "@/domain/contacts";
import { OutreachTable } from "@/components/outreach-table";
import {
  OutreachLogForm,
  type ExistingOutreachContactOption,
} from "@/components/outreach-log-form";

// Outreach tab (OUT-03/04/06, D-10) — mirrors src/app/contacts/page.tsx's
// try/catch -> null -> error-copy -> empty-state -> populated-table
// structure. Supports /outreach?contactId={id} (the 06-05 cross-link
// destination), which pre-filters the read server-side via listOutreach's
// contactId option (T-06-14: a non-numeric contactId yields undefined —
// unfiltered — rather than a thrown error).

interface OutreachPageProps {
  searchParams: Promise<{ contactId?: string }>;
}

function readOutreach(contactId?: number): OutreachRow[] | null {
  try {
    return listOutreach(db, { contactId });
  } catch (error) {
    console.error("Failed to load Outreach:", error);
    return null;
  }
}

export default async function OutreachPage({ searchParams }: OutreachPageProps) {
  const params = await searchParams;
  const parsedContactId =
    params.contactId !== undefined ? Number(params.contactId) : undefined;
  const contactId =
    parsedContactId !== undefined && Number.isFinite(parsedContactId)
      ? parsedContactId
      : undefined;

  const rows = readOutreach(contactId);

  if (rows === null) {
    return (
      <main className="flex flex-col gap-6 p-8">
        <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
          Outreach
        </h1>
        <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
          Couldn&apos;t load outreach. Refresh to try again.
        </p>
      </main>
    );
  }

  // The full contacts list feeds the log form's recipient picker (D-12) and
  // resolves the deep-link chip's contact name — a contact filtered to 0
  // outreach rows still needs its name for the "Filtered by {name}" chip.
  const contacts = listContactsWithOutreach(db);
  const existingContacts: ExistingOutreachContactOption[] = contacts.map((c) => ({
    contactId: c.id,
    name: c.name,
  }));

  const filteredContact =
    contactId !== undefined ? contacts.find((c) => c.id === contactId) : undefined;

  const filterChip = filteredContact ? (
    <div>
      <Link
        href="/outreach"
        className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-[13px] font-medium text-secondary-foreground hover:bg-secondary/80"
      >
        Filtered by {filteredContact.name}
        <span aria-hidden="true">✕</span>
      </Link>
    </div>
  ) : undefined;

  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
            Outreach
          </h1>
          <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
            Cold outreach you&apos;ve sent — see what&apos;s working.
          </p>
        </div>
        <OutreachLogForm existingContacts={existingContacts} />
      </div>

      {rows.length === 0 ? (
        <>
          {filterChip}
          <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border bg-card p-8">
            <p className="text-[20px] leading-[1.2] font-semibold text-foreground">
              No outreach logged yet
            </p>
            <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
              Log a cold email or LinkedIn message and it&apos;ll show up here
              — track who you reached out to and what worked.
            </p>
          </div>
        </>
      ) : (
        <OutreachTable rows={rows} filterChip={filterChip} />
      )}
    </main>
  );
}
