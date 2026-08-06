import { drizzle } from "drizzle-orm/node-sqlite";
import type { NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { pathToFileURL } from "node:url";
import { roleTypes, sources, stages } from "./schema";
import { assertMode, resolveDbPath } from "./paths";
import { runMigrations } from "./migrate";
import { openSqliteFile } from "./open-sqlite";

// ---------------------------------------------------------------------------
// Canonical vocabularies (D-05/D-06/D-07) — seeded as DATA, not SQLite enums,
// so a new role type later is one INSERT, zero migrations (D-07). Terminal
// stages carry an outcome_label so outcome derivation (ApplicationDetail's
// `outcome` field, src/domain/applications.ts) has something to resolve to;
// non-terminal stages resolve to "Active" at read time via `?? "Active"`.
// ---------------------------------------------------------------------------

interface StageSeed {
  label: string;
  isTerminal: boolean;
  outcomeLabel: string | null;
}

const STAGES: StageSeed[] = [
  { label: "Saved", isTerminal: false, outcomeLabel: null },
  { label: "Applied", isTerminal: false, outcomeLabel: null },
  { label: "Screen", isTerminal: false, outcomeLabel: null },
  { label: "Interview", isTerminal: false, outcomeLabel: null },
  { label: "Offer", isTerminal: true, outcomeLabel: "Offer" },
  { label: "Rejected", isTerminal: true, outcomeLabel: "Rejected" },
  { label: "Ghosted", isTerminal: true, outcomeLabel: "Ghosted" },
  { label: "Withdrawn", isTerminal: true, outcomeLabel: "Withdrawn" },
];

const SOURCES = [
  "Handshake",
  "Company site / ATS",
  "Referral",
  "LinkedIn",
  "Job board / Other",
];

const ROLE_TYPES = ["Product Management", "Strategy", "Chief of Staff", "Other"];

/**
 * Inserts the locked vocabularies (D-05 stages, D-06 sources, D-07 role
 * types) as data, insert-or-ignore by the unique `label` column — running
 * this twice is a no-op (idempotent). This is the mechanism that keeps role
 * types (and the other vocabularies) extensible without a migration: adding
 * a new label later is one more INSERT, not a schema change. Used by both
 * the demo seed (src/demo/seed/seed.ts) and the real store's init path.
 */
export function seedLookups(db: NodeSQLiteDatabase): void {
  for (const stage of STAGES) {
    db.insert(stages)
      .values({
        label: stage.label,
        isTerminal: stage.isTerminal,
        outcomeLabel: stage.outcomeLabel,
      })
      .onConflictDoNothing({ target: stages.label })
      .run();
  }

  for (const label of SOURCES) {
    db.insert(sources)
      .values({ label })
      .onConflictDoNothing({ target: sources.label })
      .run();
  }

  for (const label of ROLE_TYPES) {
    db.insert(roleTypes)
      .values({ label })
      .onConflictDoNothing({ target: roleTypes.label })
      .run();
  }
}

function runCli() {
  const mode = process.env.DASHBOARD_MODE;
  assertMode(mode);
  const dbPath = resolveDbPath(mode);

  const sqlite = openSqliteFile(dbPath);
  const db = drizzle({ client: sqlite });
  runMigrations(db);
  seedLookups(db);
  console.log(`Lookup vocabularies seeded into ${dbPath}`);
}

const isDirectCliInvocation =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectCliInvocation) {
  runCli();
}
