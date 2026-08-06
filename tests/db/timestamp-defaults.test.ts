import { describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/db";
import { createCompany } from "@/domain/companies";
import { companies } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Regression test for CR-01: `.defaultNow()` on a `mode: "timestamp"`
 * column emits an epoch-MILLISECOND SQL default, but the column's own
 * read-path decodes stored integers as epoch SECONDS (`new Date(value *
 * 1000)`). Before the fix, a row inserted without an explicit `createdAt`
 * (which is how every domain write path in this codebase inserts) would
 * round-trip through a Date roughly 1000x too far in the future (e.g. a
 * "now" timestamp read back in the year ~58543) instead of throwing —
 * silent corruption of exactly the kind the project's fail-loud constraint
 * exists to prevent.
 *
 * This test pins the fix: it inserts via the real domain write path
 * (`createCompany`, which never supplies `createdAt`) and asserts the
 * SQL-level default round-trips to a sane, current Date.
 */
describe("default timestamps round-trip correctly (CR-01)", () => {
  it("createdAt on a company inserted without an explicit timestamp reads back as a Date near now", () => {
    const { db, close } = createTestDb();
    try {
      const before = Date.now();
      const companyId = createCompany(db, "Acme Corp");
      const after = Date.now();

      const row = db
        .select({ createdAt: companies.createdAt })
        .from(companies)
        .where(eq(companies.id, companyId))
        .get();

      expect(row).toBeDefined();
      expect(row!.createdAt).toBeInstanceOf(Date);

      const createdAtMs = row!.createdAt.getTime();

      // The unit-mismatch bug (ms default read back as seconds -> Date
      // multiplied by 1000 again) produces a timestamp roughly 1000x too
      // far in the future — a difference of years, not milliseconds. A
      // correct round-trip lands within the insert window (SQLite's
      // unixepoch() has 1-second resolution, so allow a few seconds of
      // slack on each side rather than requiring millisecond precision).
      expect(createdAtMs).toBeGreaterThanOrEqual(before - 2000);
      expect(createdAtMs).toBeLessThanOrEqual(after + 2000);

      // Belt-and-suspenders: pin the exact failure mode described in
      // CR-01 (year ~58543) so a regression is unambiguous even if the
      // window assertion above is ever loosened.
      expect(row!.createdAt.getUTCFullYear()).toBe(new Date().getUTCFullYear());
    } finally {
      close();
    }
  });
});
