"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { logOutreachAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { OUTREACH_CHANNELS, type OutreachChannel } from "@/db/validation";

// OUT-01 (D-12) — the manual cold-outreach logging Dialog. Mirrors
// ContactConversationForm's structure (recipient picker + progressive
// disclosure + submit/error handling) but the new-contact sub-form is
// deliberately trimmed to Name/Email/LinkedIn only (UI-SPEC Surface 2) to
// keep outreach logging low-friction. Body/Outcome are persisted verbatim
// and rendered only as escaped JSX text elsewhere (T-06-07 stored-XSS
// mitigation) — this form never uses dangerouslySetInnerHTML.

export interface ExistingOutreachContactOption {
  contactId: number;
  name: string;
}

interface OutreachLogFormProps {
  existingContacts: ExistingOutreachContactOption[];
}

const NEW_CONTACT_VALUE = "__new__";

const PURPOSE_OPTIONS = [
  "Referral ask",
  "Intro request",
  "Recruiter outreach",
  "Coffee chat",
  "Follow-up",
  "Other",
] as const;
const OTHER_PURPOSE = "Other";

function todayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface FormValues {
  contactSelection: string; // NEW_CONTACT_VALUE or String(contactId)
  name: string;
  email: string;
  linkedinUrl: string;
  companyName: string;
  channel: OutreachChannel | "";
  purpose: string; // one of PURPOSE_OPTIONS, or free text when purpose===Other
  purposeOther: string;
  subject: string;
  body: string;
  sentDate: string; // yyyy-MM-dd, defaults to today on open
  responded: boolean;
  outcome: string;
}

function emptyValues(): FormValues {
  return {
    contactSelection: NEW_CONTACT_VALUE,
    name: "",
    email: "",
    linkedinUrl: "",
    companyName: "",
    channel: "",
    purpose: "",
    purposeOther: "",
    subject: "",
    body: "",
    sentDate: todayDateInputValue(),
    responded: false,
    outcome: "",
  };
}

export function OutreachLogForm({ existingContacts }: OutreachLogFormProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setValues(emptyValues());
      setError(null);
    }
    setOpen(next);
  }

  const isNewContact = values.contactSelection === NEW_CONTACT_VALUE;
  const isOtherPurpose = values.purpose === OTHER_PURPOSE;
  const isLinkedIn = values.channel === "LinkedIn";

  const recipientResolved = isNewContact
    ? values.name.trim().length > 0
    : values.contactSelection.length > 0;

  const purposeResolved = isOtherPurpose
    ? values.purposeOther.trim().length > 0
    : values.purpose.trim().length > 0;

  const canSubmit =
    recipientResolved &&
    values.companyName.trim().length > 0 &&
    values.channel.length > 0 &&
    purposeResolved &&
    values.body.trim().length > 0 &&
    values.sentDate.trim().length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isPending) return;

    startTransition(async () => {
      try {
        // yyyy-MM-dd -> UTC midnight Date, same conversion convention as
        // ContactConversationForm's occurredAt field.
        const sentDate = new Date(`${values.sentDate}T00:00:00.000Z`);
        const purpose = isOtherPurpose
          ? values.purposeOther.trim()
          : values.purpose;

        const payload = {
          ...(isNewContact
            ? {
                recipient: {
                  name: values.name.trim(),
                  email: values.email.trim() || undefined,
                  linkedinUrl: values.linkedinUrl.trim() || undefined,
                },
              }
            : { contactId: Number(values.contactSelection) }),
          companyName: values.companyName.trim(),
          channel: values.channel,
          purpose,
          subject: values.subject.trim() || undefined,
          body: values.body,
          sentDate,
          responded: values.responded,
          outcome: values.responded
            ? values.outcome.trim() || undefined
            : undefined,
        };

        const result = await logOutreachAction(payload);

        if (!result.ok) {
          setError(result.error);
          toast.error(result.error);
          return;
        }

        setError(null);
        setOpen(false);
      } catch {
        // An unexpected throw (network error, unhandled server exception)
        // rather than a typed { ok: false } result — a save failure must
        // never be swallowed silently (fail-loud, core value).
        setError("Something went wrong. Try again.");
        toast.error("Something went wrong. Try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          + Log outreach
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log outreach</DialogTitle>
          <DialogDescription>
            Record a cold email or LinkedIn message — pick an existing
            contact or add a new one.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="outreach-log-recipient">Recipient</Label>
            <Select
              value={values.contactSelection}
              onValueChange={(value) =>
                setValues((prev) => ({ ...prev, contactSelection: value }))
              }
            >
              <SelectTrigger id="outreach-log-recipient" className="w-full">
                <SelectValue placeholder="Select a contact" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_CONTACT_VALUE}>
                  + New contact
                </SelectItem>
                {existingContacts.map((contact) => (
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

          {isNewContact && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="outreach-log-name">Name</Label>
                <Input
                  id="outreach-log-name"
                  value={values.name}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Recipient name"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="outreach-log-email">Email</Label>
                <Input
                  id="outreach-log-email"
                  type="email"
                  value={values.email}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, email: event.target.value }))
                  }
                  placeholder="name@company.com"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="outreach-log-linkedin">LinkedIn URL</Label>
                <Input
                  id="outreach-log-linkedin"
                  type="url"
                  value={values.linkedinUrl}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      linkedinUrl: event.target.value,
                    }))
                  }
                  placeholder="https://linkedin.com/in/…"
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="outreach-log-company">Company</Label>
            <Input
              id="outreach-log-company"
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
            <Label htmlFor="outreach-log-channel">Channel</Label>
            <Select
              value={values.channel}
              onValueChange={(value) =>
                setValues((prev) => ({
                  ...prev,
                  channel: value as OutreachChannel,
                  // Subject is disabled for LinkedIn (D-06) — clear any
                  // stale value entered before switching channels.
                  subject: value === "LinkedIn" ? "" : prev.subject,
                }))
              }
            >
              <SelectTrigger id="outreach-log-channel" className="w-full">
                <SelectValue placeholder="Select a channel" />
              </SelectTrigger>
              <SelectContent>
                {OUTREACH_CHANNELS.map((channel) => (
                  <SelectItem key={channel} value={channel}>
                    {channel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="outreach-log-purpose">Purpose</Label>
            <Select
              value={values.purpose}
              onValueChange={(value) =>
                setValues((prev) => ({ ...prev, purpose: value }))
              }
            >
              <SelectTrigger id="outreach-log-purpose" className="w-full">
                <SelectValue placeholder="Select a purpose" />
              </SelectTrigger>
              <SelectContent>
                {PURPOSE_OPTIONS.map((purpose) => (
                  <SelectItem key={purpose} value={purpose}>
                    {purpose}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isOtherPurpose && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="outreach-log-purpose-other">
                Describe purpose
              </Label>
              <Input
                id="outreach-log-purpose-other"
                value={values.purposeOther}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    purposeOther: event.target.value,
                  }))
                }
                placeholder="e.g. Alumni connection"
                required
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="outreach-log-subject">Subject</Label>
            <Input
              id="outreach-log-subject"
              value={values.subject}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, subject: event.target.value }))
              }
              placeholder="No subject (LinkedIn)"
              disabled={isLinkedIn}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="outreach-log-body">Body</Label>
            <Textarea
              id="outreach-log-body"
              value={values.body}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, body: event.target.value }))
              }
              placeholder="What you sent — pasted verbatim."
              className="min-h-32"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="outreach-log-sent-date">Sent date</Label>
            <Input
              id="outreach-log-sent-date"
              type="date"
              value={values.sentDate}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, sentDate: event.target.value }))
              }
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="outreach-log-responded"
              checked={values.responded}
              onCheckedChange={(checked) =>
                setValues((prev) => ({ ...prev, responded: checked === true }))
              }
            />
            <Label htmlFor="outreach-log-responded">Responded</Label>
          </div>

          {values.responded && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="outreach-log-outcome">Outcome</Label>
              <Input
                id="outreach-log-outcome"
                value={values.outcome}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    outcome: event.target.value,
                  }))
                }
                placeholder="What happened next"
              />
            </div>
          )}

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
