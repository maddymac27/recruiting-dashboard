"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { addApplicationAction, updateApplicationAction } from "@/app/actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// CAP-02 — full add/edit dialog. "Add" creates a new application via
// addApplicationAction; "edit" (embedded on an existing card) updates it via
// updateApplicationAction. Receives every lookup array as props from the
// Server Component that renders it (RESEARCH Pitfall 4) — this file never
// imports the database client.

export interface LookupOption {
  id: number;
  label: string;
}

/** Every field pre-filled as a display string — a stored `null` becomes ""
 *  here (in the Server Component that builds these props), so this dialog
 *  never has to special-case "null" vs "empty" itself (UI-SPEC partial/edit
 *  backstop: a field with no stored value renders as empty, never literal
 *  "null"/"undefined" text). */
export interface ApplicationFormEditValues {
  companyName: string;
  roleTitle: string;
  roleTypeId: string;
  sourceId: string;
  /** yyyy-MM-dd, or "" if unset — a Server-Component-computed, timezone-fixed
   *  string (never a raw Date crossing into this Client Component). */
  dateApplied: string;
  postingUrl: string;
  /** "" if the application has no current stage yet. */
  stageId: string;
}

const EMPTY_VALUES: ApplicationFormEditValues = {
  companyName: "",
  roleTitle: "",
  roleTypeId: "",
  sourceId: "",
  dateApplied: "",
  postingUrl: "",
  stageId: "",
};

const NONE_VALUE = "none";

interface ApplicationFormDialogProps {
  mode: "add" | "edit";
  stages: LookupOption[];
  roleTypes: LookupOption[];
  sources: LookupOption[];
  /** Required when mode === "edit". */
  applicationId?: number;
  /** Required when mode === "edit". */
  initialValues?: ApplicationFormEditValues;
  /** Literal CTA copy, supplied by the caller (UI-SPEC Copywriting
   *  Contract) — only rendered in "add" mode; "edit" always uses an
   *  icon-only trigger. */
  triggerLabel?: string;
  /** Optional extra classes for the "add" trigger button (e.g. sidebar
   *  full-width + green primary color in the şişe redesign). */
  triggerClassName?: string;
}

export function ApplicationFormDialog({
  mode,
  stages,
  roleTypes,
  sources,
  applicationId,
  initialValues,
  triggerLabel = "Add Application",
  triggerClassName,
}: ApplicationFormDialogProps) {
  const startingValues =
    mode === "edit" && initialValues ? initialValues : EMPTY_VALUES;

  const [open, setOpen] = useState(false);
  const [values, setValues] =
    useState<ApplicationFormEditValues>(startingValues);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setValues(startingValues);
      setError(null);
    }
    setOpen(next);
  }

  const canSubmit =
    values.companyName.trim().length > 0 && values.roleTitle.trim().length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isPending) return;

    startTransition(async () => {
      const dateApplied = values.dateApplied
        ? new Date(`${values.dateApplied}T00:00:00.000Z`)
        : null;
      const roleTypeId = values.roleTypeId ? Number(values.roleTypeId) : null;
      const sourceId = values.sourceId ? Number(values.sourceId) : null;
      const postingUrl = values.postingUrl.trim() || null;

      const result =
        mode === "add"
          ? await addApplicationAction({
              companyName: values.companyName.trim(),
              roleTitle: values.roleTitle.trim(),
              postingUrl: postingUrl ?? undefined,
              roleTypeId: roleTypeId ?? undefined,
              sourceId: sourceId ?? undefined,
              dateApplied: dateApplied ?? undefined,
              stageId: values.stageId ? Number(values.stageId) : undefined,
            })
          : await updateApplicationAction(applicationId as number, {
              companyName: values.companyName.trim(),
              roleTitle: values.roleTitle.trim() || null,
              roleTypeId,
              sourceId,
              dateApplied,
              postingUrl,
              // Only include stageId if the user actually changed it —
              // appendStatusEventTx has no "same stage, skip" dedup, so
              // always sending it would append a spurious duplicate event
              // on every unrelated field edit.
              ...(values.stageId &&
              values.stageId !== (initialValues?.stageId ?? "")
                ? { stageId: Number(values.stageId) }
                : {}),
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
        {mode === "add" ? (
          <Button type="button" className={triggerClassName}>
            {triggerLabel}
          </Button>
        ) : (
          <button
            type="button"
            aria-label="Edit application"
            title="Edit application"
            onClick={(event) => event.stopPropagation()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-input bg-background text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add Application" : "Edit application"}
          </DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Company and role are required — every other field is optional."
              : "Update any field below."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`application-company-${mode}`}>Company</Label>
            <Input
              id={`application-company-${mode}`}
              value={values.companyName}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  companyName: event.target.value,
                }))
              }
              placeholder="Company name"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`application-role-${mode}`}>Role title</Label>
            <Input
              id={`application-role-${mode}`}
              value={values.roleTitle}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, roleTitle: event.target.value }))
              }
              placeholder="Role title"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`application-role-type-${mode}`}>Role type</Label>
            <Select
              value={values.roleTypeId || NONE_VALUE}
              onValueChange={(value) =>
                setValues((prev) => ({
                  ...prev,
                  roleTypeId: value === NONE_VALUE ? "" : value,
                }))
              }
            >
              <SelectTrigger id={`application-role-type-${mode}`} className="w-full">
                <SelectValue placeholder="Select a role type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>None</SelectItem>
                {roleTypes.map((roleType) => (
                  <SelectItem
                    key={roleType.id}
                    value={String(roleType.id)}
                    className="whitespace-normal"
                  >
                    {roleType.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`application-source-${mode}`}>Source</Label>
            <Select
              value={values.sourceId || NONE_VALUE}
              onValueChange={(value) =>
                setValues((prev) => ({
                  ...prev,
                  sourceId: value === NONE_VALUE ? "" : value,
                }))
              }
            >
              <SelectTrigger id={`application-source-${mode}`} className="w-full">
                <SelectValue placeholder="Select a source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>None</SelectItem>
                {sources.map((source) => (
                  <SelectItem
                    key={source.id}
                    value={String(source.id)}
                    className="whitespace-normal"
                  >
                    {source.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`application-date-applied-${mode}`}>
              Date applied
            </Label>
            <Input
              id={`application-date-applied-${mode}`}
              type="date"
              value={values.dateApplied}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  dateApplied: event.target.value,
                }))
              }
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`application-posting-url-${mode}`}>
              Posting URL
            </Label>
            <Input
              id={`application-posting-url-${mode}`}
              type="url"
              value={values.postingUrl}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  postingUrl: event.target.value,
                }))
              }
              placeholder="https://…"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`application-stage-${mode}`}>Stage</Label>
            <Select
              value={values.stageId || NONE_VALUE}
              onValueChange={(value) =>
                setValues((prev) => ({
                  ...prev,
                  stageId: value === NONE_VALUE ? "" : value,
                }))
              }
            >
              <SelectTrigger id={`application-stage-${mode}`} className="w-full">
                <SelectValue placeholder="Select a stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>None</SelectItem>
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
              {mode === "add" ? "Add Application" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
