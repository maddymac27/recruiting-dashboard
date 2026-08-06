"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

// Read-only "View raw email" viewer for a dead-letter row (REL-02/D3-04,
// 03-09). Never imports the database client — data arrives as a prop from
// the Server Component page (src/app/dead-letter/page.tsx). The raw email
// payload is the most-untrusted content in the app (a message that already
// failed to parse), so it is rendered as escaped plain text inside a <pre>
// element only — never through React's dangerous innerHTML API, regardless
// of whether the source MIME was HTML or plain text (T-03-03). There is no
// resolve/delete/dismiss control here: dead-letter items are resolved only
// by a later successful re-parse of the same message id (domain concern,
// T-03-14) — this dialog is strictly read-only diagnostics.

export interface DeadLetterRow {
  id: number;
  type: string;
  sender: string | null;
  subject: string | null;
  dateLabel: string;
  rawPayload: string | null;
}

interface DeadLetterItemProps {
  item: DeadLetterRow;
}

export function DeadLetterItem({ item }: DeadLetterItemProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" aria-label="View raw email">
          View raw email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Raw email</DialogTitle>
          <DialogDescription>
            {item.sender ?? "Unknown sender"}
            {item.subject ? ` — ${item.subject}` : ""} · {item.dateLabel}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] rounded-md border border-border">
          {item.rawPayload ? (
            // Escaped plain text only — a plain JSX text node inside <pre>,
            // never dangerouslySetInnerHTML. No truncation: diagnostic
            // fidelity over compact layout (03-UI-SPEC overflow rule).
            <pre className="whitespace-pre-wrap break-words p-4 text-[16px] leading-[1.5] font-normal text-foreground">
              {item.rawPayload}
            </pre>
          ) : (
            <p className="p-4 text-[16px] leading-[1.5] font-normal text-muted-foreground">
              Raw payload unavailable.
            </p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
