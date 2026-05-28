export interface AnimeGardenResource {
  id: number;
  provider: string;
  providerId: string;
  title: string;
  href: string;
  type: string;
  magnet: string | null;
  tracker?: string | null;
  size?: number | null;
  createdAt?: string | null;
  publisher?: {
    id?: number;
    name?: string;
    avatar?: string;
  } | null;
  subjectId?: number | null;
}

interface AnimeGardenResponse {
  status?: string;
  resources?: unknown[];
}

const ANIMEGARDEN_API = "https://api.animes.garden/resources";
const MAX_SEARCH_TERMS = 8;

export async function searchAnimeGardenResources(options: {
  searchTerms: string[];
  pageSize?: number;
}): Promise<AnimeGardenResource[]> {
  const terms = uniqueSearchTerms(options.searchTerms).slice(0, MAX_SEARCH_TERMS);
  if (terms.length === 0) return [];

  const batches = await Promise.all(
    terms.map((term) => searchOneTerm(term, options.pageSize ?? 40)),
  );
  return dedupeResources(batches.flat());
}

export function buildAnimeGardenMagnet(
  resource: Pick<AnimeGardenResource, "magnet" | "tracker">,
): string | null {
  if (!resource.magnet) return null;
  return `${resource.magnet}${resource.tracker ?? ""}`;
}

export function formatAnimeGardenSize(size: number | null | undefined): string | null {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return null;
  }
  // AnimeGarden API 的 size 是 KiB；前端候选列表按字节格式化。
  return String(Math.round(size * 1024));
}

async function searchOneTerm(
  term: string,
  pageSize: number,
): Promise<AnimeGardenResource[]> {
  const url = new URL(ANIMEGARDEN_API);
  url.searchParams.set("type", "动画");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("tracker", "true");

  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
        "User-Agent":
          process.env.BANGUMI_USER_AGENT ??
          "luis/anime-tracker (https://github.com/luis)",
      },
      body: JSON.stringify({ search: term }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];

    const json = (await res.json().catch(() => null)) as AnimeGardenResponse | null;
    if (!json || !Array.isArray(json.resources)) return [];

    return json.resources
      .map(normalizeResource)
      .filter((item): item is AnimeGardenResource => item !== null);
  } catch {
    return [];
  }
}

function normalizeResource(value: unknown): AnimeGardenResource | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const title = toStr(raw.title);
  if (!title) return null;

  const publisher =
    raw.publisher && typeof raw.publisher === "object"
      ? (raw.publisher as Record<string, unknown>)
      : null;

  return {
    id: toNum(raw.id) ?? 0,
    provider: toStr(raw.provider) || "animegarden",
    providerId: toStr(raw.providerId),
    title,
    href: toStr(raw.href),
    type: toStr(raw.type),
    magnet: toStr(raw.magnet) || null,
    tracker: toStr(raw.tracker) || null,
    size: toNum(raw.size),
    createdAt: toStr(raw.createdAt) || null,
    publisher: publisher
      ? {
          id: toNum(publisher.id) ?? undefined,
          name: toStr(publisher.name) || undefined,
          avatar: toStr(publisher.avatar) || undefined,
        }
      : null,
    subjectId: toNum(raw.subjectId),
  };
}

function uniqueSearchTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    const normalized = term.replace(/\s+/g, " ").trim();
    if (normalized.length < 2) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function dedupeResources(resources: AnimeGardenResource[]): AnimeGardenResource[] {
  const seen = new Set<string>();
  const out: AnimeGardenResource[] = [];
  for (const resource of resources) {
    const key =
      buildAnimeGardenMagnet(resource) ??
      resource.href ??
      resource.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resource);
  }
  return out;
}

function toStr(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function toNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
