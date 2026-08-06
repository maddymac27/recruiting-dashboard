import Link from "next/link";
import type { ContactOutreachRow } from "@/domain/contacts";

// Excel-style Contact Database table (şişe redesign) — mirrors the pipeline
// table's row format but for networking contacts: who you've talked to, where,
// and how recently. Server Component: receives the already-aggregated rows.

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const HEADERS = [
  "Name",
  "Company",
  "Role",
  "Relationship",
  "Last outreach",
  "Touchpoints",
  "Outreach",
  "Channel",
];

export function ContactsTable({ contacts }: { contacts: ContactOutreachRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-b border-border">
            {HEADERS.map((h, i) => (
              <th
                key={i}
                className="px-4 py-3 text-[12px] font-medium tracking-wide text-muted-foreground uppercase whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr
              key={c.id}
              className="border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5 font-medium text-foreground">
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-md text-[13px] font-semibold ${avatarColor(
                      c.name,
                    )}`}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate" title={c.name}>
                    {c.name}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {c.company ?? "—"}
              </td>
              <td className="px-4 py-3 text-foreground">
                <span className="line-clamp-1" title={c.roleTitle ?? undefined}>
                  {c.roleTitle ?? "—"}
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {c.relationshipType ?? "—"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {formatDate(c.latestOutreachAt)}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-secondary px-2 py-0.5 text-[13px] font-medium text-secondary-foreground">
                  {c.touchpoints}
                </span>
              </td>
              <td className="px-4 py-3">
                {c.outreachCount > 0 ? (
                  <Link href={`/outreach?contactId=${c.id}`}>
                    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-secondary px-2 py-0.5 text-[13px] font-medium text-secondary-foreground">
                      {c.outreachCount}
                    </span>
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {c.channel ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
