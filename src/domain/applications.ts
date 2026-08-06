import { eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import {
  applications,
  companies,
  roleTypes,
  sources,
  stages,
} from "@/db/schema";
import {
  newApplicationInput,
  quickSaveApplicationInput,
  updateApplicationInput,
  type NewApplicationInput,
  type QuickSaveApplicationInput,
  type UpdateApplicationInput,
} from "@/db/validation";
import { createCompany, resolveCompany } from "./companies";
import { appendStatusEventTx } from "./events";
import { getMergedField } from "./overrides";

export interface ApplicationDetail {
  id: number;
  companyId: number;
  companyName: string;
  roleTitle: string | null;
  roleTypeId: number | null;
  roleTypeLabel: string | null;
  sourceId: number | null;
  sourceLabel: string | null;
  dateApplied: Date | null;
  currentStageId: number | null;
  currentStageLabel: string | null;
  currentStageSince: Date | null;
  /**
   * Derived read-time from the current stage's outcome_label — NEVER a
   * stored column (DATA-01). Stages with no outcome_label (e.g. Interview)
   * resolve to "Active"; terminal stages resolve to their own label
   * (Offer/Rejected/Withdrawn/Ghosted).
   */
  outcome: string;
}

/**
 * Persists one applications row capturing every analysis dimension
 * (company, role title, role type, source, date applied) in a single record
 * (DATA-01). Validates input against `newApplicationInput` before it
 * reaches Drizzle. Returns the new application's id.
 */
export function createApplication(
  db: NodeSQLiteDatabase,
  input: NewApplicationInput,
): number {
  const validated = newApplicationInput.parse(input);

  const result = db.insert(applications).values(validated).run();

  return Number(result.lastInsertRowid);
}

/**
 * Reads an application joined to its company, role type, source, and
 * current stage. `outcome` is computed here from the current stage's
 * `outcome_label` — it is never read from (or written to) a stored
 * `outcome` column, because no such column exists in the schema.
 *
 * Every one of the six `OVERRIDABLE_FIELDS` display values is passed
 * through `getMergedField` before being returned (CAP-03 / DATA-07): a
 * stored override always wins over the derived/joined value, and — because
 * `getMergedField` is the single place override precedence is enforced —
 * that correction survives any later re-sync/re-parse that rewrites the
 * underlying columns. This function only calls `getMergedField`; it never
 * reads the `overrides` table directly and never re-implements precedence.
 */
export function getApplicationDetail(
  db: NodeSQLiteDatabase,
  id: number,
): ApplicationDetail | undefined {
  const row = db
    .select({
      id: applications.id,
      companyId: applications.companyId,
      companyName: companies.canonicalName,
      roleTitle: applications.roleTitle,
      roleTypeId: applications.roleTypeId,
      roleTypeLabel: roleTypes.label,
      sourceId: applications.sourceId,
      sourceLabel: sources.label,
      dateApplied: applications.dateApplied,
      currentStageId: applications.currentStageId,
      currentStageLabel: stages.label,
      currentStageSince: applications.currentStageSince,
      outcomeLabel: stages.outcomeLabel,
    })
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .leftJoin(roleTypes, eq(applications.roleTypeId, roleTypes.id))
    .leftJoin(sources, eq(applications.sourceId, sources.id))
    .leftJoin(stages, eq(applications.currentStageId, stages.id))
    .where(eq(applications.id, id))
    .get();

  if (!row) return undefined;

  const { outcomeLabel, ...rest } = row;

  const companyName = getMergedField(db, id, "company", rest.companyName);
  const roleTitle = getMergedField(db, id, "role_title", rest.roleTitle);
  const roleTypeLabel = getMergedField(
    db,
    id,
    "role_type",
    rest.roleTypeLabel,
  );
  const sourceLabel = getMergedField(db, id, "source", rest.sourceLabel);
  const currentStageLabel = getMergedField(
    db,
    id,
    "current_stage",
    rest.currentStageLabel,
  );

  const derivedDateAppliedIso = rest.dateApplied?.toISOString() ?? null;
  const mergedDateAppliedIso = getMergedField(
    db,
    id,
    "date_applied",
    derivedDateAppliedIso,
  );
  const dateApplied =
    mergedDateAppliedIso !== null
      ? new Date(mergedDateAppliedIso)
      : rest.dateApplied;

  return {
    ...rest,
    // companyName is non-nullable on ApplicationDetail; getMergedField only
    // returns null when the derived value passed in was itself null, which
    // never happens here since companies is an inner join.
    companyName: companyName ?? rest.companyName,
    roleTitle,
    roleTypeLabel,
    sourceLabel,
    dateApplied,
    currentStageLabel,
    outcome: outcomeLabel ?? "Active",
  };
}

/**
 * Quick-save (CAP-01): resolves/creates the company, creates the
 * application (including `postingUrl`), and appends exactly one `Saved`
 * status event — all inside a single `db.transaction`, so a company or
 * application row can never survive without its Saved event if any step
 * throws (RESEARCH Pattern 2). `savedStageId` is resolved once by the
 * caller (via `listStages`) rather than looked up per call.
 *
 * Inserts directly against `applications` (rather than delegating to
 * `createApplication`) because `createApplication` validates against
 * `newApplicationInput`, which has no `postingUrl` field and would silently
 * strip it — this insert instead uses the already-`quickSaveApplicationInput`-
 * validated shape, which does carry `postingUrl` (02-02 schema column).
 *
 * The transaction callback is deliberately synchronous (no async/await) —
 * node:sqlite's driver commits immediately after the callback returns
 * (same constraint documented on `appendStatusEvent`/`appendStatusEventTx`).
 */
export function quickSaveApplication(
  db: NodeSQLiteDatabase,
  savedStageId: number,
  input: QuickSaveApplicationInput,
): number {
  const validated = quickSaveApplicationInput.parse(input);

  return db.transaction((tx) => {
    const companyId =
      resolveCompany(tx, validated.companyName) ??
      createCompany(tx, validated.companyName);

    const inserted = tx
      .insert(applications)
      .values({
        companyId,
        roleTitle: validated.roleTitle,
        postingUrl: validated.postingUrl,
      })
      .run();
    const applicationId = Number(inserted.lastInsertRowid);

    appendStatusEventTx(tx, {
      applicationId,
      stageId: savedStageId,
      occurredAt: new Date(),
    });

    return applicationId;
  });
}

/**
 * Add/edit (CAP-02): writes direct-field changes and/or appends a stage
 * change, atomically. `stageId` is never written directly to
 * `applications.currentStageId` (D-09) — its presence instead triggers
 * `appendStatusEventTx`, which appends a dated event and recomputes the
 * projection. Both the direct-field update and the event append happen
 * inside the same outer `db.transaction`, so a combined field-edit +
 * stage-change commits as one atomic unit (RESEARCH Pattern 3 / Pitfall 2 —
 * `appendStatusEventTx` opens no transaction of its own, so this never hits
 * SQLite's no-nested-transaction limit).
 */
export function updateApplication(
  db: NodeSQLiteDatabase,
  applicationId: number,
  input: UpdateApplicationInput,
): void {
  const validated = updateApplicationInput.parse(input);
  const { stageId, ...directFields } = validated;

  db.transaction((tx) => {
    if (Object.keys(directFields).length > 0) {
      tx.update(applications)
        .set(directFields)
        .where(eq(applications.id, applicationId))
        .run();
    }

    if (stageId !== undefined) {
      appendStatusEventTx(tx, {
        applicationId,
        stageId,
        occurredAt: new Date(),
      });
    }
  });
}
