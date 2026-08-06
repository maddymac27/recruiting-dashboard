import { describe, expect, it } from "vitest";
import {
  newOutreachInput,
  overrideInput,
  OVERRIDABLE_FIELDS,
  type NewOutreachInput,
} from "@/db/validation";

describe("overrideInput", () => {
  it("rejects a field_name outside the correctable-field allow-list", () => {
    const result = overrideInput.safeParse({
      applicationId: 1,
      fieldName: "not_allowed",
      value: "x",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a field_name from the allow-list", () => {
    const [allowed] = OVERRIDABLE_FIELDS;
    const result = overrideInput.safeParse({
      applicationId: 1,
      fieldName: allowed,
      value: "x",
    });
    expect(result.success).toBe(true);
  });
});

describe("newOutreachInput", () => {
  it("accepts an existing-contact submission", () => {
    const result = newOutreachInput.safeParse({
      contactId: 5,
      companyName: "Acme",
      channel: "Email",
      purpose: "Referral ask",
      body: "hi",
      sentDate: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("accepts a new-recipient submission with optional fields", () => {
    const result = newOutreachInput.safeParse({
      recipient: { name: "Jo" },
      companyName: "Acme",
      channel: "LinkedIn",
      purpose: "Other",
      body: "hi",
      sentDate: new Date(),
      responded: true,
      outcome: "call booked",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a channel outside OUTREACH_CHANNELS", () => {
    const result = newOutreachInput.safeParse({
      contactId: 5,
      companyName: "Acme",
      channel: "Slack",
      purpose: "Referral ask",
      body: "hi",
      sentDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects when neither contactId nor recipient is present", () => {
    const result = newOutreachInput.safeParse({
      companyName: "Acme",
      channel: "Email",
      purpose: "Referral ask",
      body: "hi",
      sentDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty body", () => {
    const result = newOutreachInput.safeParse({
      contactId: 5,
      companyName: "Acme",
      channel: "Email",
      purpose: "Referral ask",
      body: "",
      sentDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty companyName", () => {
    const result = newOutreachInput.safeParse({
      contactId: 5,
      companyName: "",
      channel: "Email",
      purpose: "Referral ask",
      body: "hi",
      sentDate: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("type-level: NewOutreachInput has no source/sourceMessageId member", () => {
    const value: NewOutreachInput = {
      contactId: 5,
      companyName: "Acme",
      channel: "Email",
      purpose: "Referral ask",
      body: "hi",
      sentDate: new Date(),
    };
    // @ts-expect-error - source is intentionally not part of NewOutreachInput
    value.source = "manual";
    // @ts-expect-error - sourceMessageId is intentionally not part of NewOutreachInput
    value.sourceMessageId = null;
    expect(value).toBeDefined();
  });
});
