import { describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../helpers/db";
import { getMergedField, setOverride } from "@/domain/overrides";
import { applications, companies, overrides } from "@/db/schema";

function seedApplication(db: TestDb["db"]) {
  const companyId = Number(
    db
      .insert(companies)
      .values({ canonicalName: "Acme Corp", normalizedKey: "acme corp" })
      .run().lastInsertRowid,
  );

  const applicationId = Number(
    db.insert(applications).values({ companyId }).run().lastInsertRowid,
  );

  return { companyId, applicationId };
}

describe("setOverride / getMergedField", () => {
  it("override precedence: override wins over a different derived value", () => {
    const { db, close } = createTestDb();
    try {
      const { applicationId } = seedApplication(db);

      setOverride(db, applicationId, "role_title", "Staff PM");

      expect(
        getMergedField(db, applicationId, "role_title", "Some Other Title"),
      ).toBe("Staff PM");
    } finally {
      close();
    }
  });

  it("survives re-derive: override row is untouched by a simulated parser re-run", () => {
    const { db, close } = createTestDb();
    try {
      const { applicationId } = seedApplication(db);

      setOverride(db, applicationId, "role_title", "Staff PM");

      // Simulate a parser re-run producing yet another derived value.
      expect(
        getMergedField(db, applicationId, "role_title", "Yet Another Title"),
      ).toBe("Staff PM");

      // And again, with a third derived value — override still wins.
      expect(
        getMergedField(db, applicationId, "role_title", "Third Derived Value"),
      ).toBe("Staff PM");
    } finally {
      close();
    }
  });

  it("allow-list: rejects a field_name outside the allow-list", () => {
    const { db, close } = createTestDb();
    try {
      const { applicationId } = seedApplication(db);

      expect(() =>
        setOverride(
          db,
          applicationId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "not_a_real_field" as any,
          "value",
        ),
      ).toThrow();
    } finally {
      close();
    }
  });

  it("single row per field: setting the same field twice updates in place", () => {
    const { db, close } = createTestDb();
    try {
      const { applicationId } = seedApplication(db);

      setOverride(db, applicationId, "role_title", "First Value");
      setOverride(db, applicationId, "role_title", "Second Value");

      const rows = db
        .select()
        .from(overrides)
        .all()
        .filter(
          (row) =>
            row.applicationId === applicationId &&
            row.fieldName === "role_title",
        );

      expect(rows).toHaveLength(1);
      expect(rows[0].valueText).toBe("Second Value");
    } finally {
      close();
    }
  });

  it("returns the derived value when no override exists", () => {
    const { db, close } = createTestDb();
    try {
      const { applicationId } = seedApplication(db);

      expect(
        getMergedField(db, applicationId, "role_title", "Derived Value"),
      ).toBe("Derived Value");
    } finally {
      close();
    }
  });
});
