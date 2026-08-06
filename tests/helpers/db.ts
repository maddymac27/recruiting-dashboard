import { DatabaseSync } from "node:sqlite";
import { drizzle, type NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { runMigrations } from "@/db/migrate";

export interface TestDb {
  db: NodeSQLiteDatabase;
  close: () => void;
}

/**
 * Shared test fixture (VALIDATION Wave 0): spins up an isolated in-memory
 * node:sqlite database with all migrations applied, so every domain test in
 * this and later plans can get a fresh, fully-migrated DB with one import.
 */
export function createTestDb(): TestDb {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");

  const db = drizzle({ client: sqlite });
  runMigrations(db);

  return {
    db,
    close: () => sqlite.close(),
  };
}
