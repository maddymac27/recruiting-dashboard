"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { quickSaveAction } from "@/app/actions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// CAP-01 — minimal quick-save dialog: paste a URL + type company + role.
// Optimized for speed (D2-08). No lookups needed (no db/domain import) —
// mutates only via quickSaveAction.

interface QuickSaveDialogProps {
  /** Literal CTA copy, supplied by the caller (UI-SPEC Copywriting
   *  Contract) so the exact string also lives in the Server Component that
   *  renders this trigger. */
  triggerLabel: string;
  /** Optional extra classes for the trigger button (e.g. sidebar full-width
   *  + distinct color in the şişe redesign). */
  triggerClassName?: string;
}

export function QuickSaveDialog({
  triggerLabel,
  triggerClassName,
}: QuickSaveDialogProps) {
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [postingUrl, setPostingUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      // Quick-save always opens blank — no pre-filled defaults (UI-SPEC
      // empty/quick-save covered).
      setCompanyName("");
      setRoleTitle("");
      setPostingUrl("");
      setError(null);
    }
    setOpen(next);
  }

  // Company + role required; a pasted URL is a convenience, not a gate
  // (UI-SPEC partial/quick-save covered).
  const canSubmit =
    companyName.trim().length > 0 && roleTitle.trim().length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isPending) return;

    startTransition(async () => {
      const result = await quickSaveAction({
        companyName: companyName.trim(),
        roleTitle: roleTitle.trim(),
        postingUrl: postingUrl.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      setError(null);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick-Save Job</DialogTitle>
          <DialogDescription>
            Paste the posting URL if you have it — company and role are the
            only required fields.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="quick-save-company">Company</Label>
            <Input
              id="quick-save-company"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Company name"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="quick-save-role">Role</Label>
            <Input
              id="quick-save-role"
              value={roleTitle}
              onChange={(event) => setRoleTitle(event.target.value)}
              placeholder="Role title"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="quick-save-url">Posting URL (optional)</Label>
            <Input
              id="quick-save-url"
              type="url"
              value={postingUrl}
              onChange={(event) => setPostingUrl(event.target.value)}
              placeholder="https://…"
            />
          </div>

          {error && (
            <p className="text-[14px] leading-[1.5] font-normal text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="submit"
              disabled={!canSubmit || isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
