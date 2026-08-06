import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // Never scan GSD worktree copies (.claude/worktrees/**) — a stray worktree
    // otherwise pollutes the suite with duplicate/failing test copies.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
