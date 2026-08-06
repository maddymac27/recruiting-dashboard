import { afterAll, describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { assertMode, resolveDbPath } from "@/db/paths";

// `server-only`'s default export throws unconditionally unless the
// bundler-only "react-server" resolve condition is active (set by Next.js'
// RSC bundler, not present under plain Node/vitest). Mock it so importing
// src/db/client.ts under the test runner exercises the client's own logic
// without tripping this bundler-time-only guard.
vi.mock("server-only", () => ({}));

describe("fail-loud mode resolution (pure logic, no singleton import)", () => {
  it("assertMode throws on unset/invalid DASHBOARD_MODE and passes for demo/real", () => {
    // Tests the pure resolution logic directly — deliberately does NOT import
    // src/db/client.ts with a bad env, which would throw at module load and
    // crash the test runner rather than producing an assertable failure.
    expect(() => assertMode(undefined)).toThrow();
    expect(() => assertMode("bogus")).toThrow();
    expect(() => assertMode("demo")).not.toThrow();
    expect(() => assertMode("real")).not.toThrow();
  });

  it("resolveDbPath('demo') and resolveDbPath('real') resolve to two distinct files (structural isolation, DEMO-02)", () => {
    const demoPath = resolveDbPath("demo");
    const realPath = resolveDbPath("real");
    expect(demoPath).not.toBe(realPath);
    expect(demoPath).toMatch(/demo\.sqlite$/);
    expect(realPath).toMatch(/real\.sqlite$/);
  });
});

describe("client module surface (structural isolation, DEMO-02)", () => {
  const previousMode = process.env.DASHBOARD_MODE;

  afterAll(() => {
    if (previousMode === undefined) {
      delete process.env.DASHBOARD_MODE;
    } else {
      process.env.DASHBOARD_MODE = previousMode;
    }
    // Clean up the sqlite file this test caused client.ts to open — it has
    // no schema (no migration ran against it), so it must not linger.
    const demoDbPath = resolveDbPath("demo");
    for (const suffix of ["", "-wal", "-shm"]) {
      const filePath = `${demoDbPath}${suffix}`;
      if (existsSync(filePath)) rmSync(filePath);
    }
  });

  it("exposes only `db` and the resolved `dashboardMode` — no per-query mode switch, no separate connection constructor", async () => {
    process.env.DASHBOARD_MODE = "demo";
    const clientModule = await import("@/db/client");
    expect(Object.keys(clientModule).sort()).toEqual(["dashboardMode", "db"]);
    expect(clientModule.db).toBeDefined();
    // dashboardMode is a plain resolved value (echoes what was already
    // decided at startup), not a switch that lets a caller pick a mode.
    expect(clientModule.dashboardMode).toBe("demo");
    // Close the raw node:sqlite handle so the afterAll cleanup below can
    // remove the (schema-less — no migration ran against it) sqlite file.
    clientModule.db.$client.close();
  });
});
