import "server-only";
import { drizzle } from "drizzle-orm/node-sqlite";
import { assertMode, resolveDbPath, type DashboardMode } from "./paths";
import { openSqliteFile } from "./open-sqlite";

// This is the ONLY module that reads DASHBOARD_MODE or constructs a database
// connection (D-13). Every other module — pages, routes, domain functions —
// imports `db`/`dashboardMode` from here; nothing else may touch
// process.env.DASHBOARD_MODE or open its own node:sqlite handle.
// `import "server-only"` above guarantees this module (and therefore the
// SQLite driver it wraps) can never be pulled into a client-side bundle
// (T-01-06).

// Intentionally inferred (not `: NodeSQLiteDatabase`) — the `drizzle({ client })`
// call form returns `NodeSQLiteDatabase & { $client: DatabaseSync }`; an
// explicit narrower annotation would drop `$client` (used by tests to close
// the underlying handle) from the exported type.
type DashboardDb = ReturnType<typeof createClient>;

declare global {
  // eslint-disable-next-line no-var
  var __dashboardMode: DashboardMode | undefined;
  // eslint-disable-next-line no-var
  var __dashboardDb: DashboardDb | undefined;
}

function resolveMode(): DashboardMode {
  const value = process.env.DASHBOARD_MODE;
  assertMode(value); // fail loud: throws if unset or not 'demo'/'real' — no default (D-13, T-01-08)
  return value;
}

function createClient(mode: DashboardMode) {
  const dbPath = resolveDbPath(mode);
  const sqlite = openSqliteFile(dbPath);

  return drizzle({ client: sqlite });
}

// Resolved once and cached on globalThis (D-13) — the health route and the
// liveness page need to label their output with the active mode, but must
// NOT read process.env.DASHBOARD_MODE themselves (must-have: only this
// module reads it). Exported as a plain resolved value, not a per-query
// switch — nothing downstream can pass a different mode through it.
export const dashboardMode: DashboardMode =
  globalThis.__dashboardMode ?? (globalThis.__dashboardMode = resolveMode());

// globalThis-cached singleton: survives Next.js dev-mode hot reload so we
// never open a second file handle/lock on the same SQLite file (T-01-07).
export const db: DashboardDb =
  globalThis.__dashboardDb ??
  (globalThis.__dashboardDb = createClient(dashboardMode));
