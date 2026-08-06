import { describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/db";
import {
  addAlias,
  createCompany,
  normalizeCompanyName,
  resolveCompany,
} from "@/domain/companies";

describe("normalizeCompanyName", () => {
  it("lowercases, trims, collapses whitespace, and strips punctuation", () => {
    expect(normalizeCompanyName("  Meta, Inc.  ")).toBe("meta inc");
    expect(normalizeCompanyName("Acme  Corp")).toBe("acme corp");
  });
});

describe("createCompany / addAlias / resolveCompany", () => {
  it("alias resolves: two name variants resolve to one canonical company (DATA-04)", () => {
    const { db, close } = createTestDb();
    try {
      const metaId = createCompany(db, "Meta");
      addAlias(db, metaId, "Facebook");

      expect(resolveCompany(db, "Facebook")).toBe(metaId);
      expect(resolveCompany(db, "meta")).toBe(metaId);
      expect(resolveCompany(db, "  META  ")).toBe(metaId);
    } finally {
      close();
    }
  });

  it("returns null for a genuinely new company name", () => {
    const { db, close } = createTestDb();
    try {
      createCompany(db, "Meta");

      expect(resolveCompany(db, "Some Unknown Company")).toBeNull();
    } finally {
      close();
    }
  });

  it("rejects an alias colliding with another company's canonical name", () => {
    const { db, close } = createTestDb();
    try {
      const metaId = createCompany(db, "Meta");
      createCompany(db, "Netflix");

      expect(() => addAlias(db, metaId, "Netflix")).toThrow();
    } finally {
      close();
    }
  });
});
