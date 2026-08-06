import { db } from "@/db/client";
import { listContactsWithOutreach, type ContactOutreachRow } from "@/domain/contacts";
import { ContactsTable } from "@/components/contacts-table";

// Contact Database — the networking/outreach view (şişe redesign). Surfaces the
// contacts + conversations already captured via the job-detail "log a contact"
// flow as a filterable-looking table: who you've reached out to and how
// recently. Read-only for now; new touchpoints are still logged from a job's
// detail page. Reads only go through @/domain/* (domain-owns-SQL invariant).

function readContacts(): ContactOutreachRow[] | null {
  try {
    return listContactsWithOutreach(db);
  } catch (error) {
    console.error("Failed to load Contact Database:", error);
    return null;
  }
}

export default function ContactsPage() {
  const contacts = readContacts();

  if (contacts === null) {
    return (
      <main className="flex flex-col gap-6 p-8">
        <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
          Contact Database
        </h1>
        <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
          Couldn&apos;t load this page. Refresh to try again.
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[1.2] font-semibold text-foreground">
          Contact Database
        </h1>
        <p className="text-[14px] text-muted-foreground">
          Everyone you&apos;ve logged a networking touchpoint with, and how
          recently.
        </p>
      </div>

      {contacts.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border bg-card p-8">
          <p className="text-[20px] leading-[1.2] font-semibold text-foreground">
            No contacts yet
          </p>
          <p className="text-[16px] leading-[1.5] font-normal text-muted-foreground">
            Log a contact and conversation from any job&apos;s detail page and
            they&apos;ll show up here.
          </p>
        </div>
      ) : (
        <ContactsTable contacts={contacts} />
      )}
    </main>
  );
}
