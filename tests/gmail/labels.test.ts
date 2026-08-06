import { describe, expect, it } from "vitest";

import { resolveJobSearchLabelId } from "@/gmail/query";
import { makeFakeGmailClient } from "../helpers/gmail";

describe("resolveJobSearchLabelId", () => {
  it("resolves the confirmed top-level 'Job Search' label id (Label_11, per 03-03)", async () => {
    const client = makeFakeGmailClient({
      labels: [
        { id: "Label_1", name: "Inbox" },
        { id: "Label_11", name: "Job Search" },
        // Sibling sublabel — must NOT be treated as a match.
        { id: "Label_12", name: "Job Search/Email Templates" },
      ],
    });

    await expect(resolveJobSearchLabelId(client)).resolves.toBe("Label_11");
  });

  it("resolves a nested '<Parent>/Job Search' label name", async () => {
    const client = makeFakeGmailClient({
      labels: [
        { id: "Label_1", name: "Inbox" },
        { id: "Label_7", name: "Personal/Job Search" },
      ],
    });

    await expect(resolveJobSearchLabelId(client)).resolves.toBe("Label_7");
  });

  it("throws loudly (never returns null/undefined) when the label is missing", async () => {
    const client = makeFakeGmailClient({
      labels: [{ id: "Label_1", name: "Inbox" }],
    });

    await expect(resolveJobSearchLabelId(client)).rejects.toThrow(/Job Search/);
  });
});
