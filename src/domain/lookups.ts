import { asc, eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { roleTypes, sources, stages } from "@/db/schema";

/**
 * Ordered by id ASC — this preserves seed-lookups.ts's canonical D-05
 * insertion order (Saved, Applied, Screen, Interview, Offer, Rejected,
 * Ghosted, Withdrawn) without a separate sort-order column. Board columns
 * are read from this, never hard-coded (D2-05).
 */
export function listStages(db: NodeSQLiteDatabase) {
  return db.select().from(stages).orderBy(asc(stages.id)).all();
}

/** Only active role types (isActive), ordered by id ASC (D-06). */
export function listRoleTypes(db: NodeSQLiteDatabase) {
  return db
    .select()
    .from(roleTypes)
    .where(eq(roleTypes.isActive, true))
    .orderBy(asc(roleTypes.id))
    .all();
}

/** All sources, ordered by id ASC (D-07). */
export function listSources(db: NodeSQLiteDatabase) {
  return db.select().from(sources).orderBy(asc(sources.id)).all();
}
