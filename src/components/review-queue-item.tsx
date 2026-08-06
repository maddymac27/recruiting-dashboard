"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import {
  attachReviewToApplicationAction,
  confirmReviewMatchAction,
  createFromReviewAction,
  logReviewAsConversationAction,
} from "@/app/review/actions";
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
import { Textarea } from "@/components/ui/textarea";
// Reuses the Phase 2 CAP-04 contact/conversation contract (03-08 key-link) —
// only the type, not the component instance, since ContactConversationForm's
// onSubmit is hardwired to job/[id]/actions.ts's two-step
// logContactAction/logConversationAction, while logReviewAsConversationAction
// composes contact-create-or-reuse + conversation + resolve as one action
// (Task 2). The field set/UX below mirrors contact-conversation-form.tsx
// exactly for consistency.
import type { ExistingContactOption } from "@/components/contact-conversation-form";

// Client dialog dispatching per-type review actions (REL-01, 03-08). Never
// imports the database client — data arrives as props from the Server
// Component page (src/app/review/page.tsx); mutations go only through
// src/app/review/actions.ts. Verbatim email content (bodyText) is only ever
// bound to a controlled Textarea `value` — rendered as escaped JSX text,
// never through React's dangerous innerHTML API (T-03-03).

const VALIDATION_ERROR =
  "Couldn't save this change. Check the fields below and try again.";

export interface ApplicationOption {
  id: number;
  companyId: number;
  label: string;
  contacts: ExistingContactOption[];
}

export interface ReviewRow {
  id: number;
  type: string;
  status: string;
  sender: string | null;
  subject: string | null;
  bodyText: string | null;
  parsedCompany: string | null;
  parsedRoleTitle: string | null;
  /** Formatted for display (e.g. "Jul 30, 2026"), or null if unparsed. */
  dateLabel: string | null;
  /** yyyy-MM-dd, for pre-filling a date input — never a raw Date crossing
   *  into this Client Component. */
  dateInputValue: string | null;
  candidateApplicationId: number | null;
}

interface ReviewQueueItemProps {
  item: ReviewRow;
  applications: ApplicationOption[];
}

export function ReviewQueueItem({ item, applications }: ReviewQueueItemProps) {
  if (item.type === "low_confidence_match") {
    return <LowConfidenceMatchActions item={item} applications={applications} />;
  }
  if (item.type === "unmatched_confirm_create") {
    return <UnmatchedActions item={item} applications={applications} />;
  }
  if (item.type === "label_mail") {
    return <LogConversationDialog item={item} applications={applications} />;
  }
  return (
    <span className="text-[14px] leading-[1.5] font-normal text-muted-foreground">
      —
    </span>
  );
}

function LowConfidenceMatchActions({
  item,
  applications,
}: {
  item: ReviewRow;
  applications: ApplicationOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const candidateLabel = applications.find(
    (app) => app.id === item.candidateApplicationId,
  )?.label;

  function handleConfirm() {
    if (!item.candidateApplicationId || isPending) return;

    startTransition(async () => {
      const result = await confirmReviewMatchAction(
        item.id,
        item.candidateApplicationId as number,
      );

      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      setError(null);
      toast.success("Match confirmed.");
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={isPending || !item.candidateApplicationId}
          title={candidateLabel}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Confirm match
        </Button>
        <AttachApplicationDialog
          reviewId={item.id}
          triggerLabel="Choose different application"
          applications={applications}
          excludeApplicationId={item.candidateApplicationId}
        />
      </div>
      {error && (
        <p className="text-[14px] leading-[1.5] font-normal text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function UnmatchedActions({
  item,
  applications,
}: {
  item: ReviewRow;
  applications: ApplicationOption[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CreateApplicationDialog item={item} />
      <AttachApplicationDialog
        reviewId={item.id}
        triggerLabel="Attach to existing"
        applications={applications}
      />
    </div>
  );
}

/** Shared "search/select" dialog — same dialog chrome as the Phase 2 add/edit
 *  dialog — used by both "Choose different application" (low_confidence_match)
 *  and "Attach to existing" (unmatched_confirm_create); both dispatch to the
 *  identical `attachReviewToApplicationAction`. */
function AttachApplicationDialog({
  reviewId,
  triggerLabel,
  applications,
  excludeApplicationId,
}: {
  reviewId: number;
  triggerLabel: string;
  applications: ApplicationOption[];
  excludeApplicationId?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [applicationId, setApplicationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setApplicationId("");
      setError(null);
    }
    setOpen(next);
  }

  const options = excludeApplicationId
    ? applications.filter((app) => app.id !== excludeApplicationId)
    : applications;

  function handleAttach() {
    if (!applicationId || isPending) return;

    startTransition(async () => {
      const result = await attachReviewToApplicationAction(
        reviewId,
        Number(applicationId),
      );

      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success("Attached to application.");
      setError(null);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach to an application</DialogTitle>
          <DialogDescription>
            Pick the application this email actually belongs to.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`attach-application-${reviewId}`}>
              Application
            </Label>
            <Select value={applicationId} onValueChange={setApplicationId}>
              <SelectTrigger
                id={`attach-application-${reviewId}`}
                className="w-full"
              >
                <SelectValue placeholder="Select an application" />
              </SelectTrigger>
              <SelectContent>
                {options.map((app) => (
                  <SelectItem
                    key={app.id}
                    value={String(app.id)}
                    className="whitespace-normal"
                  >
                    {app.label}
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
              type="button"
              onClick={handleAttach}
              disabled={!applicationId || isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Attach
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Create application" (unmatched_confirm_create) — quick-save-style
 *  dialog, prefilled from the item's parsed company/role/date but every
 *  field remains editable before save (UI-SPEC empty/dialogs rule). */
function CreateApplicationDialog({ item }: { item: ReviewRow }) {
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState(item.parsedCompany ?? "");
  const [roleTitle, setRoleTitle] = useState(item.parsedRoleTitle ?? "");
  const [dateApplied, setDateApplied] = useState(item.dateInputValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setCompanyName(item.parsedCompany ?? "");
      setRoleTitle(item.parsedRoleTitle ?? "");
      setDateApplied(item.dateInputValue ?? "");
      setError(null);
    }
    setOpen(next);
  }

  // Company + role required at save (UI-SPEC partial/create rule), even
  // though role title stays optional elsewhere (CAP-01 quick-save).
  const canSubmit =
    companyName.trim().length > 0 && roleTitle.trim().length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isPending) return;

    startTransition(async () => {
      const result = await createFromReviewAction(item.id, {
        companyName: companyName.trim(),
        roleTitle: roleTitle.trim(),
        dateApplied: dateApplied
          ? new Date(`${dateApplied}T00:00:00.000Z`)
          : undefined,
      });

      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success("Application created.");
      setError(null);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Create application
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create application</DialogTitle>
          <DialogDescription>
            Confirm the details parsed from this email — company and role are
            required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`create-company-${item.id}`}>Company</Label>
            <Input
              id={`create-company-${item.id}`}
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Company name"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`create-role-${item.id}`}>Role title</Label>
            <Input
              id={`create-role-${item.id}`}
              value={roleTitle}
              onChange={(event) => setRoleTitle(event.target.value)}
              placeholder="Role title"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`create-date-${item.id}`}>Date applied</Label>
            <Input
              id={`create-date-${item.id}`}
              type="date"
              value={dateApplied}
              onChange={(event) => setDateApplied(event.target.value)}
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

const NEW_CONTACT_VALUE = "__new__";

/** "Log as conversation" (label_mail) — same field set as
 *  contact-conversation-form.tsx (Contact select + new-contact fields +
 *  conversation date/channel/notes), prefilled with the email's date and
 *  verbatim body, but the user first picks the target application (UI-SPEC:
 *  "user picks the target application") and every save dispatches through
 *  `logReviewAsConversationAction` rather than the job-detail actions. */
function LogConversationDialog({
  item,
  applications,
}: {
  item: ReviewRow;
  applications: ApplicationOption[];
}) {
  const [open, setOpen] = useState(false);
  const [applicationId, setApplicationId] = useState("");
  const [contactSelection, setContactSelection] = useState(NEW_CONTACT_VALUE);
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [channel, setChannel] = useState("");
  const [relationshipType, setRelationshipType] = useState("");
  const [source, setSource] = useState("");
  const [email, setEmail] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [occurredAt, setOccurredAt] = useState(item.dateInputValue ?? "");
  const [conversationChannel, setConversationChannel] = useState("");
  const [notes, setNotes] = useState(item.bodyText ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setApplicationId("");
    setContactSelection(NEW_CONTACT_VALUE);
    setName("");
    setRoleTitle("");
    setChannel("");
    setRelationshipType("");
    setSource("");
    setEmail("");
    setLinkedinUrl("");
    setOccurredAt(item.dateInputValue ?? "");
    setConversationChannel("");
    setNotes(item.bodyText ?? "");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (next) reset();
    setOpen(next);
  }

  const selectedApplication = applications.find(
    (app) => String(app.id) === applicationId,
  );
  const isNewContact = contactSelection === NEW_CONTACT_VALUE;
  const canSubmit =
    applicationId.length > 0 &&
    occurredAt.trim().length > 0 &&
    (isNewContact ? name.trim().length > 0 : contactSelection.length > 0);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isPending) return;

    startTransition(async () => {
      const result = await logReviewAsConversationAction(
        item.id,
        Number(applicationId),
        {
          ...(isNewContact
            ? {
                newContact: {
                  name: name.trim(),
                  roleTitle: roleTitle.trim() || undefined,
                  channel: channel.trim() || undefined,
                  relationshipType: relationshipType.trim() || undefined,
                  source: source.trim() || undefined,
                  email: email.trim() || undefined,
                  linkedinUrl: linkedinUrl.trim() || undefined,
                },
              }
            : { contactId: Number(contactSelection) }),
          occurredAt: new Date(`${occurredAt}T00:00:00.000Z`),
          channel: conversationChannel.trim() || undefined,
          notes: notes || undefined,
        },
      );

      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success("Conversation logged.");
      setError(null);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Log as conversation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log as conversation</DialogTitle>
          <DialogDescription>
            Pick the application this belongs to, then confirm the contact and
            conversation details — the email text below is captured verbatim.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`log-application-${item.id}`}>Application</Label>
            <Select
              value={applicationId}
              onValueChange={(value) => {
                setApplicationId(value);
                setContactSelection(NEW_CONTACT_VALUE);
              }}
            >
              <SelectTrigger
                id={`log-application-${item.id}`}
                className="w-full"
              >
                <SelectValue placeholder="Select an application" />
              </SelectTrigger>
              <SelectContent>
                {applications.map((app) => (
                  <SelectItem
                    key={app.id}
                    value={String(app.id)}
                    className="whitespace-normal"
                  >
                    {app.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {applicationId && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`log-contact-${item.id}`}>Contact</Label>
              <Select value={contactSelection} onValueChange={setContactSelection}>
                <SelectTrigger
                  id={`log-contact-${item.id}`}
                  className="w-full"
                >
                  <SelectValue placeholder="Select a contact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_CONTACT_VALUE}>
                    + New contact
                  </SelectItem>
                  {(selectedApplication?.contacts ?? []).map((contact) => (
                    <SelectItem
                      key={contact.contactId}
                      value={String(contact.contactId)}
                      className="whitespace-normal"
                    >
                      {contact.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {applicationId && isNewContact && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`log-name-${item.id}`}>Name</Label>
                <Input
                  id={`log-name-${item.id}`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Contact name"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`log-role-${item.id}`}>Role title</Label>
                <Input
                  id={`log-role-${item.id}`}
                  value={roleTitle}
                  onChange={(event) => setRoleTitle(event.target.value)}
                  placeholder="e.g. Technical Recruiter"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`log-channel-${item.id}`}>
                  Primary channel
                </Label>
                <Input
                  id={`log-channel-${item.id}`}
                  value={channel}
                  onChange={(event) => setChannel(event.target.value)}
                  placeholder="Email, LinkedIn, phone…"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`log-relationship-${item.id}`}>
                  Relationship
                </Label>
                <Input
                  id={`log-relationship-${item.id}`}
                  value={relationshipType}
                  onChange={(event) =>
                    setRelationshipType(event.target.value)
                  }
                  placeholder="Recruiter, hiring manager, referral, peer…"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`log-source-${item.id}`}>How you met</Label>
                <Input
                  id={`log-source-${item.id}`}
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="Coffee chat, alumni, cold outreach…"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`log-email-${item.id}`}>Email</Label>
                <Input
                  id={`log-email-${item.id}`}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@company.com"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`log-linkedin-${item.id}`}>
                  LinkedIn URL
                </Label>
                <Input
                  id={`log-linkedin-${item.id}`}
                  type="url"
                  value={linkedinUrl}
                  onChange={(event) => setLinkedinUrl(event.target.value)}
                  placeholder="https://linkedin.com/in/…"
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor={`log-occurred-${item.id}`}>
              Conversation date
            </Label>
            <Input
              id={`log-occurred-${item.id}`}
              type="date"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`log-conversation-channel-${item.id}`}>
              Conversation channel
            </Label>
            <Input
              id={`log-conversation-channel-${item.id}`}
              value={conversationChannel}
              onChange={(event) => setConversationChannel(event.target.value)}
              placeholder="Email, call, LinkedIn…"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`log-notes-${item.id}`}>Notes</Label>
            {/* Verbatim email body — bound only as this Textarea's plain-text
                `value`, never interpolated as HTML (T-03-03). */}
            <Textarea
              id={`log-notes-${item.id}`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-32"
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
