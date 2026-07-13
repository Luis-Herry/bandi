/**
 * 番号片元数据源 —— 给用户本地条目刮封面、标题、演员、片商和系列。
 *
 * 实测（2026-06-26）：JavBus 跳 driver-verify、JavDB 403、avmoo 已死；可用的是
 * **r18.dev JSON**（`/videos/vod/movies/detail/-/dvd_id={番号}/json`，MDC 也用），
 * 单次返回 title / 封面(DMM jacket) / actresses / categories / maker / series / release_date。
 *
 * 个人媒体库编目用途，best-effort，走系统代理。封面来自 DMM（pics.dmm.co.jp）。
 */

const R18_DVD_BASE =
  "https://r18.dev/videos/vod/movies/detail/-/dvd_id=";
const JAV321_SEARCH = "https://www.jav321.com/search";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface JavInfo {
  code: string;
  title: string | null;
  coverUrl: string | null;
  actresses: string[];
  genres: string[];
  maker: string | null;
  series: string | null;
  releaseDate: string | null;
  year: number | null;
  runtimeMinutes: number | null;
  /** 日文原标题（来源 jav321） */
  titleJa: string | null;
  /** jav321 平均評価，已折算到 /10（×2） */
  rating: number | null;
  /** 日文简介（来源 jav321） */
  descriptionJa: string | null;
}

/** 从文件名 / 标题里抽取番号（大写字母 + 连字符 + 数字；测试样例使用 TEST-390）。 */
export function extractJavCode(title: string): string | null {
  const m = title.toUpperCase().match(/\b([A-Z]{2,6})-(\d{2,5})\b/);
  return m ? `${m[1]}-${m[2]}` : null;
}

interface R18Raw {
  title?: string;
  release_date?: string;
  runtime_minutes?: number;
  actresses?: Array<{ name?: string }>;
  categories?: Array<{ name?: string }>;
  maker?: { name?: string } | null;
  series?: { name?: string } | null;
  images?: { jacket_image?: { large?: string; large2?: string } };
}

// 噪音分类（r18 把这些当 category，编目里没意义）
const JUNK_GENRES = new Set([
  "Sample Video",
  "Featured Actress",
  "Hi-Def",
  "Exclusive Distribution",
]);

interface Jav321Extra {
  titleJa: string | null;
  rating: number | null;
  descriptionJa: string | null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * jav321 补充日文原标题 + 评分 + 日文简介（纯 POST，无 Cloudflare）。
 * 只取元数据，**不碰页面里的磁链**（守不抓盗版边界）。best-effort。
 */
async function getJav321Extra(code: string): Promise<Jav321Extra | null> {
  let html: string | null = null;
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(JAV321_SEARCH, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `sn=${encodeURIComponent(code)}`,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        html = await res.text();
        break;
      }
    } catch {
      // 重试
    }
    await new Promise((r) => setTimeout(r, 600 + i * 600));
  }
  if (!html) return null;

  // 结果页须含该番号，避免空搜索误配
  const codeRe = new RegExp(code.replace("-", "-?"), "i");
  if (!codeRe.test(html)) return null;

  // 日文标题：<h3>{日文标题} <small>番号 演员</small></h3>
  const h3 = html.match(/<h3>([\s\S]*?)<\/h3>/);
  const titleJa = h3
    ? stripHtml(h3[1].replace(/<small>[\s\S]*?<\/small>/g, "")) || null
    : null;

  // 评分：<b>平均評価</b>: 5 —— jav321 是 /5，折算到 /10
  const r = html.match(/平均評価<\/b>\s*[:：]?\s*([\d.]+)/);
  const raw = r ? Number(r[1]) : NaN;
  const rating =
    Number.isFinite(raw) && raw > 0 ? Math.min(10, Math.round(raw * 2 * 10) / 10) : null;

  // 日文简介：描述段在 maker/品番 区块之后的 col-md-12
  const desc = html.match(
    /平均評価<\/b>[\s\S]*?<\/div><\/div><div class="row"><div class="col-md-12">([\s\S]*?)<(?:p|h2|div|script)/i,
  );
  const descriptionJa = desc ? stripHtml(desc[1]) || null : null;

  if (!titleJa && rating == null) return null;
  return { titleJa, rating, descriptionJa };
}

/** 按番号取元数据（r18.dev 主 + jav321 补日文标题/评分）。best-effort，失败返回 null。 */
export async function getJavInfo(code: string): Promise<JavInfo | null> {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2,6}-\d{2,5}$/.test(c)) return null;

  let text: string | null = null;
  for (let i = 0; i < 2; i++) {
    try {
      const res = await fetch(`${R18_DVD_BASE}${encodeURIComponent(c)}/json`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        text = await res.text();
        break;
      }
    } catch {
      // 重试
    }
    await new Promise((r) => setTimeout(r, 600 + i * 600));
  }
  if (!text) return null;

  let j: R18Raw;
  try {
    j = JSON.parse(text) as R18Raw;
  } catch {
    return null;
  }
  if (!j || typeof j !== "object") return null;

  const cover =
    j.images?.jacket_image?.large2?.trim() ||
    j.images?.jacket_image?.large?.trim() ||
    "";
  const year =
    j.release_date && /^(\d{4})/.test(j.release_date)
      ? Number(j.release_date.slice(0, 4))
      : null;
  const genres = (j.categories ?? [])
    .map((g) => (g.name ?? "").trim())
    .filter((g) => g && !JUNK_GENRES.has(g));
  const actresses = (j.actresses ?? [])
    .map((a) => (a.name ?? "").trim())
    .filter(Boolean);

  const j321 = await getJav321Extra(c);

  return {
    code: c,
    title: j.title?.trim() || null,
    coverUrl: /^https?:\/\//.test(cover) ? cover : null,
    actresses,
    genres,
    maker: j.maker?.name?.trim() || null,
    series: j.series?.name?.trim() || null,
    releaseDate: j.release_date ?? null,
    year,
    runtimeMinutes:
      typeof j.runtime_minutes === "number" && j.runtime_minutes > 0
        ? j.runtime_minutes
        : null,
    titleJa: j321?.titleJa ?? null,
    rating: j321?.rating ?? null,
    descriptionJa: j321?.descriptionJa ?? null,
  };
}
