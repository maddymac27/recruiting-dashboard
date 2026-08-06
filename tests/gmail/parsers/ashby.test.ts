import { describe, expect, it } from "vitest";

import { dispatchParser } from "@/gmail/parsers/index";
import { classifyStatus, extractCompany, parseAshby } from "@/gmail/parsers/ashby";
import type { ParsedMessage } from "@/gmail/types";

// ---------------------------------------------------------------------------
// D3-02 FOLLOW-UP (+ D3-05 DATE POLICY REVISION): the "real shape" fixture
// below is a REDACTED version of the one real Ashby dead-letter row pulled
// from `data/real.sqlite` (real company name replaced with a placeholder;
// structural shape preserved). See ashby.ts's module header for the full
// rationale — real Ashby mail says "Thank you for applying for the X role
// at Y!", not "Thanks for your interest in the X role at Y!" as the
// synthetic fixture assumed. Only one real Ashby message has been observed,
// so rejection/interview shapes below remain the unvalidated
// synthetic-derived fallback. Under the revised D3-05 policy, `parseAshby`
// now resolves the real applied-confirmation shape to a transition using
// the message's received time (`msg.date`) as the event date, rather than
// dead-lettering for want of a date.
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    messageId: "msg-ashby-1",
    from: '"Widgetco" <no-reply@ashbyhq.com>',
    subject: "Thank you for applying to Widgetco",
    date: new Date("2026-07-15T17:00:00.000Z"),
    text: "",
    ...overrides,
  };
}

// Real shape (the one real Ashby row observed): "applying for the X role at
// Y!", no explicit date anywhere in the body.
const REAL_SHAPE_APPLIED_BODY = [
  "Hi Maddy,",
  " ",
  "Thank you for applying for the Growth PM, Core App role at Widgetco! We",
  "appreciate your interest in joining the team. We will review your",
  "application and let you know if there are next steps.",
  " ",
  "All the best,",
  " ",
  "Talent @ Widgetco",
].join("\n");

describe("extractCompany (real-shape unit test)", () => {
  it("extracts company + role from the real 'applying for the X role at Y!' sentence", () => {
    const result = extractCompany(REAL_SHAPE_APPLIED_BODY);
    expect(result?.company).toBe("Widgetco");
    expect(result?.roleTitle).toBe("Growth PM, Core App");
  });

  it("still matches the synthetic-derived 'interest in the X role at Y!' shape as a fallback", () => {
    const result = extractCompany(
      "Thanks for your interest in the Growth PM role at Widgetco! We'll be in touch.",
    );
    expect(result?.company).toBe("Widgetco");
    expect(result?.roleTitle).toBe("Growth PM");
  });
});

describe("classifyStatus (real-shape unit test)", () => {
  it("classifies the real applied-confirmation body (no explicit date) as Applied", () => {
    expect(classifyStatus(REAL_SHAPE_APPLIED_BODY)).toBe("Applied");
  });
});

describe("parseAshby against the real-shaped fixture with no explicit date — resolves via received-time (D3-05 revised)", () => {
  it("resolves to an Applied transition, using msg.date as occurredAt since no explicit date exists in the real template", () => {
    const msg = makeMessage({ text: REAL_SHAPE_APPLIED_BODY });

    const result = parseAshby(msg);

    expect(result).not.toBeNull();
    expect(result?.company).toBe("Widgetco");
    expect(result?.stageLabel).toBe("Applied");
    expect(result?.occurredAt).toEqual(msg.date);
  });
});

describe("parseAshby: an explicit date, when present, still wins over received-time", () => {
  it("application submitted -> Applied with the EXPLICIT event date, not received-time", () => {
    const msg = makeMessage({
      text: [
        REAL_SHAPE_APPLIED_BODY,
        "",
        "Your application was submitted on July 15, 2026 and our team is reviewing it.",
      ].join("\n"),
      date: new Date("2026-09-01T00:00:00.000Z"), // received-time — must lose to the explicit date
    });

    const result = parseAshby(msg);

    expect(result).not.toBeNull();
    expect(result?.company).toBe("Widgetco");
    expect(result?.stageLabel).toBe("Applied");
    expect(result?.occurredAt).toEqual(new Date("July 15, 2026"));
    expect(result?.occurredAt).not.toEqual(msg.date);
    expect(result?.sourceMessageId).toBe("msg-ashby-1");
  });

  it("rejection with an explicit decision date -> Rejected with the explicit event date", () => {
    const msg = makeMessage({
      text: [
        "Thanks for your interest in the Growth PM role at Widgetco!",
        "",
        "After reviewing your application, we've decided not to move forward at this",
        "time. This was decided on July 20, 2026.",
      ].join("\n"),
      date: new Date("2026-09-01T00:00:00.000Z"),
    });

    const result = parseAshby(msg);

    expect(result).not.toBeNull();
    expect(result?.company).toBe("Widgetco");
    expect(result?.stageLabel).toBe("Rejected");
    expect(result?.occurredAt).toEqual(new Date("July 20, 2026"));
    expect(result?.occurredAt).not.toEqual(msg.date);
  });

  it("interview invite with an explicit date -> Interview with the explicit event date", () => {
    const msg = makeMessage({
      text: [
        "Thanks for your interest in the Growth PM role at Widgetco!",
        "",
        "We'd like to schedule an interview with you. Your interview is set for",
        "July 25, 2026.",
      ].join("\n"),
      date: new Date("2026-09-01T00:00:00.000Z"),
    });

    const result = parseAshby(msg);

    expect(result).not.toBeNull();
    expect(result?.stageLabel).toBe("Interview");
    expect(result?.occurredAt).toEqual(new Date("July 25, 2026"));
    expect(result?.occurredAt).not.toEqual(msg.date);
  });
});

describe("dispatchParser (Ashby)", () => {
  it("routes an ashbyhq.com From address to parseAshby", () => {
    const parser = dispatchParser('"Widgetco" <no-reply@ashbyhq.com>');
    expect(parser).toBe(parseAshby);
  });

  it("returns null for an unknown sender", () => {
    expect(dispatchParser("someone@example.com")).toBeNull();
  });
});
