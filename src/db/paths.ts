import path from "node:path";

// This is the ONLY place DASHBOARD_MODE maps to a file path (D-13).
// Deliberately free of `import "server-only"` so migrate/seed CLI scripts
// (which run outside the Next.js server context) can import it directly.

export type DashboardMode = "demo" | "real";

/**
 * Fail-loud mode guard (D-13). There is NO default: an unset or misspelled
 * DASHBOARD_MODE throws immediately rather than silently picking one mode,
 * which is exactly the "which file is this actually reading" ambiguity D-13
 * exists to eliminate.
 */
export function assertMode(value: unknown): asserts value is DashboardMode {
  if (value !== "demo" && value !== "real") {
    throw new Error(
      `DASHBOARD_MODE must be 'demo' or 'real', got: ${String(value)}`,
    );
  }
}

/**
 * Resolves a DASHBOARD_MODE to its absolute SQLite file path under data/.
 * demo -> data/demo.sqlite, real -> data/real.sqlite — always two distinct
 * files; no code path can be capable of mixing real and demo data (D-13).
 */
export function resolveDbPath(mode: DashboardMode): string {
  assertMode(mode);
  const fileName = mode === "demo" ? "demo.sqlite" : "real.sqlite";
  return path.join(process.cwd(), "data", fileName);
}
