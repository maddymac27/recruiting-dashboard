import { eq } from "drizzle-orm";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { companies, companyAliases } from "@/db/schema";

/**
 * Lowercases, trims, collapses internal whitespace, and strips punctuation
 * to produce a stable lookup key (used for both `companies.normalized_key`
 * and `company_aliases.normalized_alias`). This is a defensive lookup
 * helper only — the alias table, not fuzzy normalization, is the mechanism
 * that resolves name variants (RESEARCH Pattern 4, Don't Hand-Roll).
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Creates a new canonical company row, computing and storing
 * `normalized_key` from the canonical name. Returns the new company's id.
 */
export function createCompany(
  db: NodeSQLiteDatabase,
  canonicalName: string,
): number {
  const result = db
    .insert(companies)
    .values({
      canonicalName,
      normalizedKey: normalizeCompanyName(canonicalName),
    })
    .run();

  return Number(result.lastInsertRowid);
}

/**
 * Adds an alias pointing at an existing company. Enforces the app-level
 * invariant that an alias must never collide with another company's
 * canonical name/normalized_key — SQLite cannot express a cross-table
 * UNIQUE without a trigger, so this is validated in code (RESEARCH Pattern
 * 4, Don't Hand-Roll, T-01-16).
 */
export function addAlias(
  db: NodeSQLiteDatabase,
  companyId: number,
  alias: string,
): number {
  const normalizedAlias = normalizeCompanyName(alias);

  const collidingCompany = db
    .select()
    .from(companies)
    .where(eq(companies.normalizedKey, normalizedAlias))
    .get();

  if (collidingCompany) {
    throw new Error(
      `Alias "${alias}" collides with existing company "${collidingCompany.canonicalName}"`,
    );
  }

  const result = db
    .insert(companyAliases)
    .values({ companyId, alias, normalizedAlias })
    .run();

  return Number(result.lastInsertRowid);
}

/**
 * Resolves an incoming company name to a canonical company id. Lookup
 * order: normalize -> match `companies.normalized_key` -> else match
 * `company_aliases.normalized_alias` -> else null (a genuinely new
 * company; creation/routing is the caller's concern). No fuzzy matching
 * (Levenshtein/Jaro-Winkler) is performed — alias table only (RESEARCH
 * Don't Hand-Roll, DATA-04).
 */
export function resolveCompany(
  db: NodeSQLiteDatabase,
  name: string,
): number | null {
  const normalized = normalizeCompanyName(name);

  const byCanonical = db
    .select()
    .from(companies)
    .where(eq(companies.normalizedKey, normalized))
    .get();

  if (byCanonical) return byCanonical.id;

  const byAlias = db
    .select()
    .from(companyAliases)
    .where(eq(companyAliases.normalizedAlias, normalized))
    .get();

  return byAlias ? byAlias.companyId : null;
}
