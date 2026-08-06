import { describe, expect, it } from "vitest";

import { dispatchParser } from "@/gmail/parsers/index";
import {
  classifyStatus,
  extractCompany,
  parseSmartRecruiters,
} from "@/gmail/parsers/smartrecruiters";
import type { ParsedMessage } from "@/gmail/types";

// ---------------------------------------------------------------------------
// D3-02 FOLLOW-UP (+ D3-05 DATE POLICY REVISION): these fixtures are
// REDACTED versions of real SmartRecruiters dead-letter rows pulled from
// `data/real.sqlite` (real company names replaced with placeholders;
// structural shape preserved). See smartrecruiters.ts's module header for
// the full rationale. Every "real shape" fixture below intentionally has NO
// explicit date in the body, matching every one of the 8 real SmartRecruiters
// rows sampled — under the revised D3-05 policy, `parseSmartRecruiters` now
// resolves these to a transition using the message's received time
// (`msg.date`) as the event date, rather than dead-lettering for want of a
// date.
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    messageId: "msg-sr-1",
    from: '"Acme Corp" <no-reply@smartrecruiters.com>',
    subject: "Acme Corp - Thanks for Your Application!",
    date: new Date("2026-07-15T17:00:00.000Z"),
    text: "",
    ...overrides,
  };
}

// Real shape: applied confirmation says "job at <Company>", not "position
// at <Company>".
const REAL_SHAPE_APPLIED_BODY = [
  "Hi Maddy,",
  "",
  "Thank you for your interest in the Product Manager job at Acme Corp. We're",
  "looking for unique individuals who want to join a creative and",
  "collaborative global team. We will review your application and will be in",
  "touch with any applicable next steps.",
  "",
  "Best regards,",
  "",
  "Acme Corp Talent Team",
].join("\n");

// Real shape: rejection body never names the company at all — company only
// appears in the subject line / sender display name.
const REAL_SHAPE_REJECTION_NO_BODY_COMPANY_SUBJECT = "Thank you for your interest in Globex Corp";
const REAL_SHAPE_REJECTION_NO_BODY_COMPANY_BODY = [
  "Dear Maddy,",
  "",
  "Thank you for your interest in the Sr. Product Manager, Platform position.",
  "We've reviewed your background and experience and unfortunately, we have",
  "decided to move ahead with other candidates. We appreciate the time you",
  "took to apply.",
  "",
  "Good luck to you in your search.",
  "",
  "Best,",
  "",
  "Globex Corp Talent Acquisition",
].join("\n");

// Real shape: "<Company> has received your application" confirmation.
const REAL_SHAPE_RECEIVED_SUBJECT = "Initech has received your application";
const REAL_SHAPE_RECEIVED_BODY = [
  "Dear Maddy,",
  "",
  "Thank you for your interest in the Product Manager job at Initech! We look",
  "forward to reviewing your application and will contact you shortly with",
  "any next steps.",
  "",
  "Best regards,",
  "",
  "Initech Talent Acquisition",
].join("\n");

describe("extractCompany (real-shape unit tests)", () => {
  it("extracts company + role from the 'interest in the X job at Y' opening sentence", () => {
    const result = extractCompany(
      REAL_SHAPE_APPLIED_BODY,
      "Acme Corp - Thanks for Your Application!",
      '"Acme Corp" <no-reply@smartrecruiters.com>',
    );
    expect(result?.company).toBe("Acme Corp");
    expect(result?.roleTitle).toBe("Product Manager");
  });

  it("falls back to the subject line's 'interest in Y' when the body never names the company", () => {
    const result = extractCompany(
      REAL_SHAPE_REJECTION_NO_BODY_COMPANY_BODY,
      REAL_SHAPE_REJECTION_NO_BODY_COMPANY_SUBJECT,
      '"Jordan Lee from Globex Corp" <notifications@smartrecruiters.com>',
    );
    expect(result?.company).toBe("Globex Corp");
  });

  it("falls back to the sender's 'from <Company>' display name when body/subject don't help", () => {
    const result = extractCompany(
      "Thank you for your interest. We'll be in touch.",
      "Update on your application",
      '"Jordan Lee from Globex Corp" <notifications@smartrecruiters.com>',
    );
    expect(result?.company).toBe("Globex Corp");
  });

  it("returns null for the generic 'SmartRecruiters' OTP sender (never a company)", () => {
    const result = extractCompany(
      "Your one-time-passcode\n\n123456",
      "Your one-time-passcode",
      '"SmartRecruiters" <notifications@smartrecruiters.com>',
    );
    expect(result).toBeNull();
  });
});

describe("classifyStatus (real-shape unit tests)", () => {
  it("classifies the real rejection body (no explicit date) as Rejected", () => {
    expect(classifyStatus(REAL_SHAPE_REJECTION_NO_BODY_COMPANY_BODY)).toBe("Rejected");
  });

  it("classifies the real 'has received your application' body as Applied", () => {
    expect(classifyStatus(REAL_SHAPE_RECEIVED_BODY)).toBe("Applied");
  });
});

describe("parseSmartRecruiters against real-shaped fixtures with no explicit date — resolves via received-time (D3-05 revised)", () => {
  it("resolves the real applied-confirmation shape to an Applied transition, using msg.date as occurredAt", () => {
    const msg = makeMessage({ text: REAL_SHAPE_APPLIED_BODY });

    const result = parseSmartRecruiters(msg);

    expect(result).not.toBeNull();
    expect(result?.company).toBe("Acme Corp");
    expect(result?.stageLabel).toBe("Applied");
    expect(result?.occurredAt).toEqual(msg.date);
  });

  it("resolves the real rejection shape (subject-derived company) to a Rejected transition using received-time", () => {
    const msg = makeMessage({
      text: REAL_SHAPE_REJECTION_NO_BODY_COMPANY_BODY,
      subject: REAL_SHAPE_REJECTION_NO_BODY_COMPANY_SUBJECT,
      from: '"Jordan Lee from Globex Corp" <notifications@smartrecruiters.com>',
    });

    const result = parseSmartRecruiters(msg);

    expect(result).not.toBeNull();
    expect(result?.company).toBe("Globex Corp");
    expect(result?.stageLabel).toBe("Rejected");
    expect(result?.occurredAt).toEqual(msg.date);
  });

  it("resolves the '<Company> has received your application' shape to an Applied transition using received-time", () => {
    const msg = makeMessage({
      text: REAL_SHAPE_RECEIVED_BODY,
      subject: REAL_SHAPE_RECEIVED_SUBJECT,
      from: '"Initech" <notification@smartrecruiters.com>',
    });

    const result = parseSmartRecruiters(msg);

    expect(result).not.toBeNull();
    expect(result?.company).toBe("Initech");
    expect(result?.stageLabel).toBe("Applied");
    expect(result?.occurredAt).toEqual(msg.date);
  });
});

describe("parseSmartRecruiters: an explicit date, when present, still wins over received-time", () => {
  it("application received -> Applied with the EXPLICIT event date, not received-time", () => {
    const msg = makeMessage({
      text: [
        REAL_SHAPE_APPLIED_BODY,
        "",
        "We have received your application on July 15, 2026 and it is being reviewed.",
      ].join("\n"),
      date: new Date("2026-09-01T00:00:00.000Z"), // received-time — must lose to the explicit date
    });

    const result = parseSmartRecruiters(msg);

    expect(result).not.toBeNull();
    expect(result?.company).toBe("Acme Corp");
    expect(result?.stageLabel).toBe("Applied");
    expect(result?.occurredAt).toEqual(new Date("July 15, 2026"));
    expect(result?.occurredAt).not.toEqual(msg.date);
    expect(result?.sourceMessageId).toBe("msg-sr-1");
  });

  it("rejection with an explicit decision date -> Rejected with the explicit event date", () => {
    const msg = makeMessage({
      text: [
        REAL_SHAPE_REJECTION_NO_BODY_COMPANY_BODY,
        "",
        "This decision was finalized on July 20, 2026.",
      ].join("\n"),
      subject: REAL_SHAPE_REJECTION_NO_BODY_COMPANY_SUBJECT,
      from: '"Jordan Lee from Globex Corp" <notifications@smartrecruiters.com>',
      date: new Date("2026-09-01T00:00:00.000Z"),
    });

    const result = parseSmartRecruiters(msg);

    expect(result).not.toBeNull();
    expect(result?.company).toBe("Globex Corp");
    expect(result?.stageLabel).toBe("Rejected");
    expect(result?.occurredAt).toEqual(new Date("July 20, 2026"));
    expect(result?.occurredAt).not.toEqual(msg.date);
  });

  it("interview invite with an explicit date -> Interview with the explicit event date", () => {
    const msg = makeMessage({
      text: [
        "Thank you for your interest in the Product Manager job at Acme Corp.",
        "",
        "We are pleased to invite you to interview for this role. Your interview is",
        "confirmed for July 25, 2026.",
      ].join("\n"),
      date: new Date("2026-09-01T00:00:00.000Z"),
    });

    const result = parseSmartRecruiters(msg);

    expect(result).not.toBeNull();
    expect(result?.stageLabel).toBe("Interview");
    expect(result?.occurredAt).toEqual(new Date("July 25, 2026"));
    expect(result?.occurredAt).not.toEqual(msg.date);
  });
});

describe("dispatchParser (SmartRecruiters)", () => {
  it("routes a smartrecruiters.com From address to parseSmartRecruiters", () => {
    const parser = dispatchParser('"Acme Corp" <no-reply@smartrecruiters.com>');
    expect(parser).toBe(parseSmartRecruiters);
  });

  it("returns null for an unknown sender", () => {
    expect(dispatchParser("someone@example.com")).toBeNull();
  });
});
