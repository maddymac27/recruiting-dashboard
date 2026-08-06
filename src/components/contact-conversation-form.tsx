"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { logContactAction, logConversationAction } from "@/app/job/[id]/actions";
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

// CAP-04 — inline contact + conversation logging on the job detail page
// (D2-10). Receives applicationId/companyId as props (RESEARCH Pitfall 4) —
// this file never imports the database client or a server-only @/domain
// module; it mutates only via logContactAction/logConversationAction. The
// notes Textarea has no maxLength cap — it is the free-text self-forwarded
// LinkedIn-note paste path (CAP-04), persisted verbatim and rendered only
// as escaped JSX text in the timeline (T-02-16 stored-XSS mitigation).

export interface ExistingContactOption {
  contactId: number;
  name: string;
}

interface ContactConversationFormProps {
  applicationId: number;
  companyId: number;
  existingContacts: ExistingContactOption[];
  /** Optional custom trigger element (Phase 5, Today-view "Log a follow-up"
   *  button — RESEARCH Open Question 1 / UI-SPEC E1). Defaults to the
   *  original "Log Contact" trigger below when omitted, so the Phase 2
   *  job-detail-page call site is unchanged. */
  trigger?: ReactNode;
}

const NEW_CONTACT_VALUE = "__new__";

interface FormValues {
  contactSelection: string; // NEW_CONTACT_VALUE or String(contactId)
  name: string;
  roleTitle: string;
  channel: string;
  relationshipType: string;
  source: string;
  email: string;
  linkedinUrl: string;
  occurredAt: string; // yyyy-MM-dd, user-entered — never a formatted display date
  conversationChannel: string;
  notes: string;
}

// Opens blank every time — no pre-filled defaults (UI-SPEC empty/form
// covered).
const EMPTY_VALUES: FormValues = {
  contactSelection: NEW_CONTACT_VALUE,
  name: "",
  roleTitle: "",
  channel: "",
  relationshipType: "",
  source: "",
  email: "",
  linkedinUrl: "",
  occurredAt: "",
  conversationChannel: "",
  notes: "",
};

export function ContactConversationForm({
  applicationId,
  companyId,
  existingContacts,
  trigger,
}: ContactConversationFormProps) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setValues(EMPTY_VALUES);
      setError(null);
    }
    setOpen(next);
  }

  const isNewContact = values.contactSelection === NEW_CONTACT_VALUE;
  const canSubmit =
    values.occurredAt.trim().length > 0 &&
    (isNewContact
      ? values.name.trim().length > 0
      : values.contactSelection.length > 0);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isPending) return;

    startTransition(async () => {
      try {
        let contactId: number;

        if (isNewContact) {
          const contactResult = await logContactAction(
            applicationId,
            companyId,
            {
              name: values.name.trim(),
              roleTitle: values.roleTitle.trim() || undefined,
              channel: values.channel.trim() || undefined,
              relationshipType: values.relationshipType.trim() || undefined,
              source: values.source.trim() || undefined,
              email: values.email.trim() || undefined,
              linkedinUrl: values.linkedinUrl.trim() || undefined,
            },
          );

          if (!contactResult.ok) {
            setError(contactResult.error);
            toast.error(contactResult.error);
            return;
          }

          contactId = contactResult.contactId as number;
        } else {
          contactId = Number(values.contactSelection);
        }

        // yyyy-MM-dd -> UTC midnight Date, same conversion convention as
        // application-form-dialog.tsx's dateApplied field — this is parsing
        // user input, not formatting a stored date for display (Pitfall 5
        // only forbids the latter inside a client component).
        const occurredAt = new Date(`${values.occurredAt}T00:00:00.000Z`);

        const conversationResult = await logConversationAction(applicationId, {
          contactId,
          occurredAt,
          channel: values.conversationChannel.trim() || undefined,
          // Persisted verbatim — no trim/cap on the free-text paste path.
          notes: values.notes || undefined,
        });

        if (!conversationResult.ok) {
          setError(conversationResult.error);
          toast.error(conversationResult.error);
          return;
        }

        setError(null);
        setOpen(false);
      } catch {
        // An unexpected throw from either Server Action (network error,
        // unhandled server exception) rather than a typed { ok: false }
        // result — still surface something to the user instead of leaving
        // the dialog silently stuck (fail-loud constraint).
        setError("Something went wrong. Try again.");
        toast.error("Something went wrong. Try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="secondary">
            Log Contact
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log a contact + conversation</DialogTitle>
          <DialogDescription>
            Link an existing contact or add a new one, then record a dated
            conversation — paste a self-forwarded LinkedIn note into Notes to
            capture it in full.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-conversation-contact">Contact</Label>
            <Select
              value={values.contactSelection}
              onValueChange={(value) =>
                setValues((prev) => ({ ...prev, contactSelection: value }))
              }
            >
              <SelectTrigger
                id="contact-conversation-contact"
                className="w-full"
              >
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
                <Label htmlFor="contact-conversation-name">Name</Label>
                <Input
                  id="contact-conversation-name"
                  value={values.name}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Contact name"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-conversation-role-title">
                  Role title
                </Label>
                <Input
                  id="contact-conversation-role-title"
                  value={values.roleTitle}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      roleTitle: event.target.value,
                    }))
                  }
                  placeholder="e.g. Technical Recruiter"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-conversation-channel">
                  Primary channel
                </Label>
                <Input
                  id="contact-conversation-channel"
                  value={values.channel}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      channel: event.target.value,
                    }))
                  }
                  placeholder="Email, LinkedIn, phone…"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-conversation-relationship-type">
                  Relationship
                </Label>
                <Input
                  id="contact-conversation-relationship-type"
                  value={values.relationshipType}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      relationshipType: event.target.value,
                    }))
                  }
                  placeholder="Recruiter, hiring manager, referral, peer…"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-conversation-source">
                  How you met
                </Label>
                <Input
                  id="contact-conversation-source"
                  value={values.source}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      source: event.target.value,
                    }))
                  }
                  placeholder="Coffee chat, alumni, cold outreach…"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-conversation-email">Email</Label>
                <Input
                  id="contact-conversation-email"
                  type="email"
                  value={values.email}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      email: event.target.value,
                    }))
                  }
                  placeholder="name@company.com"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-conversation-linkedin">
                  LinkedIn URL
                </Label>
                <Input
                  id="contact-conversation-linkedin"
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
            <Label htmlFor="contact-conversation-occurred-at">
              Conversation date
            </Label>
            <Input
              id="contact-conversation-occurred-at"
              type="date"
              value={values.occurredAt}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  occurredAt: event.target.value,
                }))
              }
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-conversation-conversation-channel">
              Conversation channel
            </Label>
            <Input
              id="contact-conversation-conversation-channel"
              value={values.conversationChannel}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  conversationChannel: event.target.value,
                }))
              }
              placeholder="Email, call, LinkedIn…"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-conversation-notes">Notes</Label>
            <Textarea
              id="contact-conversation-notes"
              value={values.notes}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, notes: event.target.value }))
              }
              placeholder="What was said — paste a self-forwarded LinkedIn note here if that's how this touchpoint happened."
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
