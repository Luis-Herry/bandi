import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";

const RSS_TITLE_ALIASES_KEY = "rss_title_aliases";
const MAX_ALIASES_PER_ANIME = 12;
const MAX_ALIAS_LENGTH = 80;

interface RssTitleAliasStore {
  version: 1;
  aliasesByAnimeId: Record<string, string[]>;
}

const EMPTY_STORE: RssTitleAliasStore = {
  version: 1,
  aliasesByAnimeId: {},
};

export function normalizeRssTitleAlias(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const alias = value.replace(/\s+/g, " ").trim();
  if (alias.length < 2) return null;
  return alias.slice(0, MAX_ALIAS_LENGTH);
}

export function mergeRssTitleAliases(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const raw of group) {
      const alias = normalizeRssTitleAlias(raw);
      if (!alias) continue;
      const key = alias.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(alias);
    }
  }
  return out;
}

export function getRssTitleAliases(animeId: number): string[] {
  if (!Number.isFinite(animeId)) return [];
  const store = readStore();
  return store.aliasesByAnimeId[String(animeId)] ?? [];
}

export function getAllRssTitleAliases(): Record<string, string[]> {
  return readStore().aliasesByAnimeId;
}

export function addRssTitleAlias(animeId: number, value: unknown): string[] {
  const alias = normalizeRssTitleAlias(value);
  if (!Number.isFinite(animeId) || !alias) return getRssTitleAliases(animeId);

  const store = readStore();
  const key = String(animeId);
  const next = mergeRssTitleAliases([alias], store.aliasesByAnimeId[key] ?? [])
    .slice(0, MAX_ALIASES_PER_ANIME);
  store.aliasesByAnimeId[key] = next;
  writeStore(store);
  return next;
}

export function removeRssTitleAlias(animeId: number, value: unknown): string[] {
  const alias = normalizeRssTitleAlias(value);
  if (!Number.isFinite(animeId) || !alias) return getRssTitleAliases(animeId);

  const store = readStore();
  const key = String(animeId);
  const removeKey = alias.toLowerCase();
  const next = (store.aliasesByAnimeId[key] ?? []).filter(
    (item) => item.toLowerCase() !== removeKey,
  );
  if (next.length > 0) {
    store.aliasesByAnimeId[key] = next;
  } else {
    delete store.aliasesByAnimeId[key];
  }
  writeStore(store);
  return next;
}

function readStore(): RssTitleAliasStore {
  const row = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, RSS_TITLE_ALIASES_KEY))
    .get();
  const value = row?.value;
  if (!value || typeof value !== "object") return { ...EMPTY_STORE };

  const raw = value as Partial<RssTitleAliasStore>;
  const aliasesByAnimeId =
    raw.aliasesByAnimeId && typeof raw.aliasesByAnimeId === "object"
      ? raw.aliasesByAnimeId
      : {};

  const normalized: Record<string, string[]> = {};
  for (const [animeId, aliases] of Object.entries(aliasesByAnimeId)) {
    if (!Array.isArray(aliases)) continue;
    const id = Number(animeId);
    if (!Number.isFinite(id)) continue;
    const next = mergeRssTitleAliases(aliases).slice(0, MAX_ALIASES_PER_ANIME);
    if (next.length > 0) normalized[String(id)] = next;
  }

  return {
    version: 1,
    aliasesByAnimeId: normalized,
  };
}

function writeStore(store: RssTitleAliasStore) {
  db.insert(appSettings)
    .values({
      key: RSS_TITLE_ALIASES_KEY,
      value: store,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: store,
        updatedAt: sql`(unixepoch())`,
      },
    })
    .run();
}
