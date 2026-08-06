import { describe, expect, it } from "vitest";

import { dispatchParser } from "@/gmail/parsers/index";
import { classifyStatus, extractCompany, parseWorkday } from "@/gmail/parsers/workday";
import type { ParsedMessage } from "@/gmail/types";

// ---------------------------------------------------------------------------
// D3-02 FOLLOW-UP (+ D3-05 DATE POLICY REVISION): these fixtures are
// REDACTED versions of real Workday dead-letter rows pulled from
// `data/real.sqlite` (real company names replaced with placeholders;
// structural shape — wrapping, sign-off, tracking-pixel lines — preserved).
// See workday.ts's module header for the full rationale. Every "real shape"
// fixture below intentionally has NO explicit date in the body, matching
// every one of the 24 real Workday rows sampled — under the revised D3-05
// policy, `parseWorkday` now resolves these to a transition using the
// message's received time (`msg.date`) as the event date, rather than
// dead-lettering for want of a date.
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    messageId: "msg-1",
    from: '"Meridian Bank People Team" <meridianbank@myworkday.com>',
    subject: "Meridian Bank - Application Update",
    date: new Date("2026-07-15T17:00:00.000Z"),
    text: "",
    ...overrides,
  };
}

const REAL_SHAPE_REJECTION_BODY = [
  "Dear Maddy,",
  "",
  "Thank you for your interest in the Product Manager position at Meridian",
  "Bank. We appreciate the time and effort you invested in your application",
  "and in learning more about our organization.",
  "",
  "After careful consideration, we have decided to move forward with other",
  "candidates whose skills and experience more closely align with the needs",
  "of this role at this time.",
  "",
  "We encourage you to explore other opportunities on our careers site.",
  "",
  "Best regards,",
  "",
  "Meridian Bank Talent Acquisition",
  "",
  "This email was intended for user@example.com",
].join("\n");

// Real subject-only-company rejection shape: NO "position at <Company>" sentence in the
// body at all — company only appears in the subject line.
const REAL_SHAPE_REJECTION_NO_BODY_COMPANY_SUBJECT =
  "R0999999 Lead Product Manager - Widgets - Thanks for your interest in career opportunities at Globex Corp";
const REAL_SHAPE_REJECTION_NO_BODY_COMPANY_BODY = [
  "Hello Maddy McEnery ,",
  "",
  "We really appreciate the time and effort you took to connect with us and",
  "apply for the position: R0999999 Lead Product Manager - Widgets",
  "position. We are no",
  "longer hiring for this role, though we encourage you to apply for other",
  "opportunities that match your background and skills.",
  "",
  "This email was intended for user@example.com",
].join("\n");

// Real "employment opportunities at" rejection shape: company appears only via "employment
// opportunities at <Company>." — a different opening sentence entirely.
const REAL_SHAPE_EMPLOYMENT_OPPORTUNITIES_BODY = [
  "Hi Maddy,",
  "",
  "Thank you for your time and interest in employment opportunities at Initech.",
  "We appreciate the time and effort you put into submitting your application.",
  "",
  "After carefully reviewing the information you provided, you were not",
  "selected at this time for our Program Manager opening.",
  "",
  "All the best,",
  "Initech Talent Acquisition",
].join("\n");

// Real "Thank You For Applying!" shape: generic confirmation, zero company
// mention anywhere in the body or subject.
const REAL_SHAPE_APPLIED_BODY = [
  "Dear Maddy,",
  "",
  "Thank you so much for applying! Your application will be taken into",
  "careful consideration and you will hear back from us after we review",
  "your application.",
  "",
  "Thank you",
].join("\n");

describe("extractCompany (real-shape unit tests)", () => {
  it("extracts company + role from the 'interest in the X position at Y.' opening sentence", () => {
    const result = extractCompany(
      REAL_SHAPE_REJECTION_BODY,
      "Meridian Bank - Application Update",
      '"Meridian Bank People Team" <meridianbank@myworkday.com>',
    );
    expect(result?.company).toBe("Meridian Bank");
    expect(result?.roleTitle).toBe("Product Manager");
  });

  it("falls back to the subject line's 'career opportunities at Y' when the body never names the company", () => {
    const result = extractCompany(
      REAL_SHAPE_REJECTION_NO_BODY_COMPANY_BODY,
      REAL_SHAPE_REJECTION_NO_BODY_COMPANY_SUBJECT,
      '"workday.do-not-reply globex" <globex@myworkday.com>',
    );
    expect(result?.company).toBe("Globex Corp");
  });

  it("extracts company from the 'employment opportunities at Y' opening sentence", () => {
    const result = extractCompany(
      REAL_SHAPE_EMPLOYMENT_OPPORTUNITIES_BODY,
      "Regarding your Initech Application",
      "initechgroup@myworkday.com",
    );
    expect(result?.company).toBe("Initech");
  });

  it("returns null when no company signal exists anywhere (generic confirmation, no company in body/subject/sender)", () => {
    const result = extractCompany(
      REAL_SHAPE_APPLIED_BODY,
      "Thank You For Applying!",
      '"Workday Notification – Action May Be Required" <initechgroup@myworkday.com>',
    );
    expect(result).toBeNull();
  });
});

describe("classifyStatus (real-shape unit tests)", () => {
  it("classifies a real rejection body as Rejected even when it word-wraps mid-phrase", () => {
    // "no\nlonger hiring for this role" — the wrap breaks the literal phrase
    // across a newline, exactly as observed in the real subject-only-company mail.
    expect(classifyStatus(REAL_SHAPE_REJECTION_NO_BODY_COMPANY_BODY)).toBe("Rejected");
  });

  it("classifies the 'employment opportunities at' rejection body as Rejected", () => {
    expect(classifyStatus(REAL_SHAPE_EMPLOYMENT_OPPORTUNITIES_BODY)).toBe("Rejected");
  });

  it("classifies the generic 'Thank You For Applying!' body as Applied", () => {
    expect(classifyStatus(REAL_SHAPE_APPLIED_BODY)).toBe("Applied");
  });
});

describe("parseWorkday against real-shaped fixtures with no explicit date — resolves via received-time (D3-05 revised)", () => {
  it("resolves the real rejection shape to a Rejected transition, using msg.date as occurredAt since no explicit date exists in the real template", () => {
    const msg = makeMessage({ text: REAL_SHAPE_REJECTION_BODY });

    const result = parseWorkday(msg);

    expect(result).not.toBeNull();
    expect(result?.company).toBe("Meridian Bank");
    expect(result?.stageLabel).toBe("Rejected");
    expect(result?.occurredAt).toEqual(msg.date);
  });

  it("resolves the real subject-only-company rejection (subject-derived company) to a Rejected transition using received-time", () => {
    const msg = makeMessage({
      text: REAL_SHAPE_REJECTION_NO_BODY_COMPANY_BODY,
      subject: REAL_SHAPE_REJECTION_NO_BODY_COMPANY_SUBJECT,
      from: '"workday.do-not-reply globex" <globex@myworkday.com>',
    });

    const result = parseWorkday(msg);

    expect(result).not.toBeNull();
    expect(result?.company).toBe("Globex Corp");
    expect(result?.stageLabel).toBe("Rejected");
    expect(result?.occurredAt).toEqual(msg.date);
  });

  it("still returns null for the real 'Thank You For Applying!' shape — no company signal at all, unrelated to the date policy", () => {
    const msg = makeMessage({
      text: REAL_SHAPE_APPLIED_BODY,
      subject: "Thank You For Applying!",
      from: '"Workday Notification – Action May Be Required" <initechgroup@myworkday.com>',
    });
    expect(parseWorkday(msg)).toBeNull();
  });
});

describe("parseWorkday: an explicit date, when present, still wins over received-time", () => {
  it("application submitted/received -> Applied with the EXPLICIT event date, not received-time", () => {
    const msg = makeMessage({
      text: [
        REAL_SHAPE_APPLIED_BODY,
        "",
        "We have received your application on July 15, 2026 and it is currently under review.",
      ].join("\n"),
      subject: "Meridian Bank - Application Update",
      from: '"Meridian Bank People Team" <meridianbank@myworkday.com>',
      date: new Date("2026-09-01T00:00:00.000Z"), // received-time — must lose to the explicit date
    });

    const result = parseWorkday(msg);

    expect(result).not.toBeNull();
    expect(result?.stageLabel).toBe("Applied");
    expect(result?.occurredAt).toEqual(new Date("July 15, 2026"));
    expect(result?.occurredAt).not.toEqual(msg.date);
    expect(result?.sourceMessageId).toBe("msg-1");
  });

  it("rejection with an explicit decision date -> Rejected with the explicit event date", () => {
    const msg = makeMessage({
      text: [
        REAL_SHAPE_REJECTION_BODY,
        "",
        "This decision was made on July 20, 2026.",
      ].join("\n"),
      date: new Date("2026-09-01T00:00:00.000Z"),
    });

    const result = parseWorkday(msg);

    expect(result).not.toBeNull();
    expect(result?.company).toBe("Meridian Bank");
    expect(result?.stageLabel).toBe("Rejected");
    expect(result?.occurredAt).toEqual(new Date("July 20, 2026"));
    expect(result?.occurredAt).not.toEqual(msg.date);
  });

  it("interview invite with an explicit date -> Interview with the explicit event date", () => {
    const msg = makeMessage({
      text: [
        "Thank you for your interest in the Product Manager position at Meridian Bank.",
        "",
        "We would like to invite you to an interview for this role. Your interview has",
        "been scheduled for July 25, 2026.",
      ].join("\n"),
      date: new Date("2026-09-01T00:00:00.000Z"),
    });

    const result = parseWorkday(msg);

    expect(result).not.toBeNull();
    expect(result?.stageLabel).toBe("Interview");
    expect(result?.occurredAt).toEqual(new Date("July 25, 2026"));
    expect(result?.occurredAt).not.toEqual(msg.date);
  });
});

describe("dispatchParser", () => {
  it("routes a myworkday.com From address to parseWorkday", () => {
    const parser = dispatchParser('"Visa" <visa@myworkday.com>');
    expect(parser).toBe(parseWorkday);
  });

  it("routes a different Workday tenant's local-part to parseWorkday too (multi-tenant match)", () => {
    const parser = dispatchParser("initech@myworkday.com");
    expect(parser).toBe(parseWorkday);
  });

  it("returns null for an unknown sender", () => {
    expect(dispatchParser("someone@example.com")).toBeNull();
  });

  it("returns null for Handshake — never routed to any parser (DROPPED per 03-03)", () => {
    expect(dispatchParser("notifications@notifications.joinhandshake.com")).toBeNull();
  });
});
