"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { changeStageAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// D2-06 — the explicit "change stage" control. NEVER drag-and-drop, NEVER an
// in-place overwrite: confirming here calls changeStageAction, which appends
// a dated status event via updateApplication (D-09). Receives the stage
// lookup as a prop (RESEARCH Pitfall 4) — this file never imports the
// database client.

export interface LookupOption {
  id: number;
  label: string;
}

interface StageChangeDialogProps {
  applicationId: number;
  currentStageId: number | null;
  stages: LookupOption[];
  /** Optional custom trigger element (Phase 5, Today-view labeled "Change
   *  stage" button — UI-SPEC E1). Defaults to the original icon-only
   *  trigger below when omitted, so every existing call site (board card)
   *  is unchanged. */
  trigger?: ReactNode;
}

export function StageChangeDialog({
  applicationId,
  currentStageId,
  stages,
  trigger,
}: StageChangeDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState(
    currentStageId ? String(currentStageId) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setSelectedStageId(currentStageId ? String(currentStageId) : "");
      setError(null);
    }
    setOpen(next);
  }

  function handleConfirm() {
    if (!selectedStageId || isPending) return;

    startTransition(async () => {
      try {
        const result = await changeStageAction(
          applicationId,
          Number(selectedStageId),
        );

        if (!result.ok) {
          setError(result.error);
          toast.error(result.error);
          return;
        }

        setError(null);
        setOpen(false);
      } catch {
        // An unexpected throw (network error, unhandled server exception)
        // rather than a typed { ok: false } result — still surface
        // something to the user instead of leaving the dialog silently
        // stuck (fail-loud constraint).
        setError("Something went wrong. Try again.");
        toast.error("Something went wrong. Try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          // 44px minimum hit target for an icon-only interactive control
          // (UI-SPEC Spacing Scale exception). stopPropagation keeps the
          // surrounding board card's Link from also navigating.
          <button
            type="button"
            aria-label="Change stage"
            title="Change stage"
            onClick={(event) => event.stopPropagation()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-input bg-background text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowRightLeft className="size-4" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Change stage</DialogTitle>
          <DialogDescription>
            Every stage change is recorded with today&apos;s date — history is
            never overwritten.
          </DialogDescription>
        </DialogHeader>

        <Select value={selectedStageId} onValueChange={setSelectedStageId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a stage" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((stage) => (
              <SelectItem
                key={stage.id}
                value={String(stage.id)}
                className="whitespace-normal"
              >
                {stage.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {error && (
          <p className="text-[14px] leading-[1.5] font-normal text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedStageId || isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
