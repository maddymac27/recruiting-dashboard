import { and, eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { overrides } from "@/db/schema";
import { overrideInput, type OverridableField } from "@/db/validation";

/**
 * Validates the input against the `overrideInput` allow-list (rejecting any
 * field_name outside `OVERRIDABLE_FIELDS` — DATA-07, V5, T-01-14), then runs
 * an explicit read-then-write transaction: read the existing `overrides` row
 * for (applicationId, fieldName) and UPDATE it if present, else INSERT a new
 * row. This deliberately never uses `onConflictDoUpdate` on the composite
 * (application_id, field_name) unique index — `[CITED:
 * github.com/drizzle-team/drizzle-orm issue #2998]` documents that pattern
 * behaving unreliably on SQLite composite keys (RESEARCH Pattern 3, Pitfall
 * 2, T-01-15).
 *
 * The ingestion/derive path never calls this function and never reads
 * overrides before writing its own derived value — only the read path
 * (`getMergedField`) enforces precedence, so a re-sync structurally cannot
 * touch an override (DATA-07, T-01-13).
 */
export function setOverride(
  db: NodeSQLiteDatabase,
  applicationId: number,
  fieldName: OverridableField,
  value: string | null,
): void {
  const validated = overrideInput.parse({ applicationId, fieldName, value });

  db.transaction((tx) => {
    const existing = tx
      .select()
      .from(overrides)
      .where(
        and(
          eq(overrides.applicationId, validated.applicationId),
          eq(overrides.fieldName, validated.fieldName),
        ),
      )
      .get();

    if (existing) {
      tx.update(overrides)
        .set({ valueText: validated.value, setByUserAt: new Date() })
        .where(eq(overrides.id, existing.id))
        .run();
    } else {
      tx.insert(overrides)
        .values({
          applicationId: validated.applicationId,
          fieldName: validated.fieldName,
          valueText: validated.value,
        })
        .run();
    }
  });
}

/**
 * Returns the stored override value for (applicationId, fieldName) if one
 * exists, otherwise the caller-supplied derived value. The override always
 * wins when present (DATA-07) — this is the ONLY place override precedence
 * is enforced; the ingestion/derive write path never consults this table.
 */
export function getMergedField(
  db: NodeSQLiteDatabase,
  applicationId: number,
  fieldName: OverridableField,
  derivedValue: string | null,
): string | null {
  const existing = db
    .select()
    .from(overrides)
    .where(
      and(
        eq(overrides.applicationId, applicationId),
        eq(overrides.fieldName, fieldName),
      ),
    )
    .get();

  return existing ? existing.valueText : derivedValue;
}
