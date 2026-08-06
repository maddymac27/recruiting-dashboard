import { drizzle, type NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { pathToFileURL } from "node:url";
import { assertMode, resolveDbPath } from "./paths";
import { openSqliteFile } from "./open-sqlite";

/**
 * Applies all pending migrations from ./drizzle to the given Drizzle client.
 * Reused by the test helper (tests/helpers/db.ts), the demo seed script, and
 * app startup — this is the single migration entry point (see 01-01-PLAN.md
 * key_links).
 */
export function runMigrations(db: NodeSQLiteDatabase) {
  migrate(db, { migrationsFolder: "./drizzle" });
}

function runCli() {
  const mode = process.env.DASHBOARD_MODE;
  assertMode(mode);
  const dbPath = resolveDbPath(mode);

  const sqlite = openSqliteFile(dbPath);
  const db = drizzle({ client: sqlite });
  runMigrations(db);
  console.log(`Migrations applied to ${dbPath}`);
}

const isDirectCliInvocation =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectCliInvocation) {
  runCli();
}
