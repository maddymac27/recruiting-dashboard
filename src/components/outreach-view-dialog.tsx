"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { OutreachRow } from "@/domain/outreach";

// OUT-05 (D-14) — read-full-body Dialog. Renders from an already-loaded
// OutreachRow prop with no fetch (props-only, per UI-SPEC Surface 3). Body/
// subject/outcome are rendered only as escaped JSX text (whitespace-pre-wrap
// for line breaks) — the raw-HTML injection prop is never used (T-06-07
// stored-XSS mitigation, mirrors ContactConversationForm's Notes field).

const CHANNEL_PILL_CLASSES: Record<string, string> = {
  LinkedIn: "bg-blue-100 text-blue-700",
  Email: "bg-cyan-100 text-cyan-700",
};

const PURPOSE_PILL_CLASSES: Record<string, string> = {
  "Referral ask": "bg-violet-100 text-violet-700",
  "Intro request": "bg-amber-100 text-amber-800",
  "Recruiter outreach": "bg-emerald-100 text-emerald-700",
  "Coffee chat": "bg-rose-100 text-rose-700",
  "Follow-up": "bg-slate-100 text-slate-600",
  Other: "bg-zinc-100 text-zinc-600",
};

const DEFAULT_PILL_CLASSES = "bg-zinc-100 text-zinc-600";

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface OutreachViewDialogProps {
  outreach: OutreachRow;
  trigger?: ReactNode;
}

export function OutreachViewDialog({
  outreach,
  trigger,
}: OutreachViewDialogProps) {
  const channelClass =
    CHANNEL_PILL_CLASSES[outreach.channel] ?? DEFAULT_PILL_CLASSES;
  const purposeClass =
    PURPOSE_PILL_CLASSES[outreach.purpose] ?? DEFAULT_PILL_CLASSES;
  const respondedClass = outreach.responded
    ? "bg-emerald-100 text-emerald-700"
    : "bg-secondary text-secondary-foreground";
  const respondedLabel = outreach.responded ? "Responded" : "No response yet";

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="text-[14px] font-medium text-primary hover:underline"
          >
            View
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {outreach.contactName} · {outreach.companyName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Pill className={channelClass}>{outreach.channel}</Pill>
          <Pill className={purposeClass}>{outreach.purpose}</Pill>
          <Pill className="bg-secondary text-secondary-foreground">
            {formatDate(outreach.sentDate)}
          </Pill>
          <Pill className={respondedClass}>{respondedLabel}</Pill>
        </div>

        {outreach.subject !== null && (
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
              Subject
            </span>
            <p className="text-[16px] leading-[1.5] font-normal text-foreground">
              {outreach.subject}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
            Body
          </span>
          <p className="whitespace-pre-wrap text-[16px] leading-[1.5] font-normal text-foreground">
            {outreach.body}
          </p>
        </div>

        {outreach.outcome !== null && (
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
              Outcome
            </span>
            <p className="text-[16px] leading-[1.5] font-normal text-foreground">
              {outreach.outcome}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
