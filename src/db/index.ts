import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";
import { ensureDatabaseSchema, ensureDesktopDefaults } from "./bootstrap";

const dbUrl = process.env.DATABASE_URL ?? "./data/anime.db";
const dbPath = resolve(process.cwd(), dbUrl);
const dir = dirname(dbPath);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
ensureDatabaseSchema(sqlite);
if (process.env.ANIME_DESKTOP_APP === "1") {
  ensureDesktopDefaults(sqlite);
}

export const db = drizzle(sqlite, { schema });
export { schema };
export type DB = typeof db;
