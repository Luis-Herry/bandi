/**
 * 本地影视库文件名解析（纯函数，只依赖 node:path，可单测）。
 *
 * 目标：从用户自有片的文件名 / 父目录名推断「电影 vs 剧集」+ 片名 + 年份（+ 季集）。
 * 元数据 / 海报 / 评分留给后续 tmdb.ts、douban.ts 回填，这里只做骨架识别。
 *
 * 商业剧 / 院线片主流命名是 `Title (Year)` 和 `SxxExx`，所以这里自己实现，
 * 不复用偏字幕组动画风格的 `extractEpisodeNumber`（它不干净处理 SxxExx）。
 */

import path from "node:path";

// "skip"：识别为字幕组动画，跳过不进 cinema（动漫走动漫侧 /library/local）。
export type ScannedKind = "movie" | "tv" | "skip";

export interface ScannedMediaFile {
  absPath: string;
  fileName: string;
  kind: ScannedKind;
  title: string;
  year: number | null;
  /** tv：解析到的季号（缺省 1）；movie：0（无意义） */
  season: number;
  /** tv：集号；movie：恒 1（单集特例） */
  episode: number;
}

export interface ScannedTitle {
  kind: ScannedKind;
  title: string;
  year: number | null;
  /** tv：季号；movie：null */
  season: number | null;
  files: ScannedMediaFile[];
}

// 发布标签：从片名里剥掉，避免污染标题
const RELEASE_TAGS =
  /\b(?:1080p|2160p|720p|480p|4k|uhd|hdr10?|dolby|dv|bluray|blu-ray|bdrip|brrip|webrip|web-?dl|web|hdtv|dvdrip|remux|x264|x265|h\.?264|h\.?265|hevc|avc|10bit|8bit|aac|ac3|eac3|dts(?:-hd)?|ddp?5[._]1|truehd|atmos|flac|opus|repack|proper|internal|extended|uncut|imax|remastered|complete|multi|dual|cht|chs|gb|big5|eng|jpn)\b/gi;

// 剧集标记（按可靠度排序）
const TV_SXXEXX = /\bS(\d{1,2})[\s._-]*E(\d{1,3})\b/i;
const TV_NXNN = /\b(\d{1,2})x(\d{2,3})\b/i;
const TV_CJK_EP = /第\s*0*(\d{1,3})\s*[集话話]/;
const TV_EP = /\bEP\.?\s*0*(\d{1,3})\b/i;
const TV_EPISODE_WORD = /\bEpisode\s*0*(\d{1,3})\b/i;
const TV_SEASON_CJK = /第\s*0*(\d{1,3})\s*[季期]/;
const TV_SEASON_S = /\bS(\d{1,2})\b/i;
const BARE_EPISODE_STEM = /^(?:ep(?:isode)?[\s._-]*)?0*(\d{1,3})$/i;

// 标题切断标记（取最早出现的那个）
const TITLE_CUT_MARKERS = [
  TV_SXXEXX,
  TV_NXNN,
  TV_CJK_EP,
  TV_EP,
  TV_EPISODE_WORD,
  TV_SEASON_CJK,
];

function detectTv(stem: string): { season: number; episode: number } | null {
  let m = TV_SXXEXX.exec(stem);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };

  m = TV_NXNN.exec(stem);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };

  m = TV_CJK_EP.exec(stem);
  if (m) {
    const sm = TV_SEASON_CJK.exec(stem);
    return { season: sm ? Number(sm[1]) : 1, episode: Number(m[1]) };
  }

  m = TV_EP.exec(stem) ?? TV_EPISODE_WORD.exec(stem);
  if (m) {
    const sm = TV_SEASON_CJK.exec(stem) ?? TV_SEASON_S.exec(stem);
    return { season: sm ? Number(sm[1]) : 1, episode: Number(m[1]) };
  }

  return null;
}

export function extractYear(s: string): number | null {
  // 优先括号年份（最可信，能避开 "Blade Runner 2049" 把 2049 当年份）
  const paren = s.match(/[([{]\s*((?:19|20)\d{2})\s*[)\]}]/);
  if (paren) return Number(paren[1]);

  // 在第一个画质 / 来源标签前截断，取该区间内「最后一个」年份：
  // "Blade.Runner.2049.2017.2160p" → 取 2017，而不是片名里的 2049
  const tag = s.match(
    /\b(?:1080p|2160p|720p|480p|4k|uhd|bluray|blu-ray|bdrip|brrip|web|webrip|web-?dl|hdtv|dvdrip|remux|x26[45]|h\.?26[45]|hevc)\b/i,
  );
  const head = tag ? s.slice(0, tag.index) : s;
  const years = [...head.matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)/g)].map((m) =>
    Number(m[1]),
  );
  if (years.length) return years[years.length - 1];

  const any = s.match(/(?<!\d)((?:19|20)\d{2})(?!\d)/);
  return any ? Number(any[1]) : null;
}

function titleSegment(stem: string, year: number | null): string {
  let cut = stem.length;
  for (const re of TITLE_CUT_MARKERS) {
    const m = re.exec(stem);
    if (m && m.index < cut) cut = m.index;
  }
  if (year != null) {
    const ym = new RegExp(`[([{.\\s_-]*${year}`).exec(stem);
    if (ym && ym.index < cut) cut = ym.index;
  }
  return stem.slice(0, cut);
}

function detectBareEpisode(stem: string): number | null {
  const m = BARE_EPISODE_STEM.exec(stem.trim());
  if (!m) return null;
  const episode = Number(m[1]);
  return episode > 0 ? episode : null;
}

// 字幕组动画：`[组] 番名 - NN [画质 SRTx2 ASSx2]` / `组 番名 NN JPSC` / `番名 - NN - ASSx2`。
// 这种 `- NN` 既不是 SxxExx 也不是 EP 形式，detectTv 抓不到，会被当成「一集一行」的电影。
// 只在有明确字幕组信号（多轨字幕/音轨 tag 或开头 [组] 前缀）且无括号年份时触发，避免误判电影续集。
const FANSUB_MULTITRACK = /\b(?:SRTx?\d|ASSx?\d|AACx?\d|FLACx?\d|JPS?C|JPTC)\b/i;
const PAREN_YEAR_RE = /[([{]\s*(?:19|20)\d{2}\s*[)\]}]/;
const FANSUB_EP_RE =
  /(?:^|[\s\-_.([])0*(\d{1,3})(?=\s*(?:[\])]|-\s*(?:SRT|ASS|AAC|FLAC)|\[|\b(?:JPS?C|JPTC|WebRip|WEB-?DL|BDRip|1080p|720p|2160p|HEVC|x26[45])\b))/i;

function detectFansubTv(
  stem: string,
): { season: number; episode: number; index: number } | null {
  if (PAREN_YEAR_RE.test(stem)) return null;
  const hasSignal =
    FANSUB_MULTITRACK.test(stem) || /^\s*\[[^\]]{2,40}\]/.test(stem);
  if (!hasSignal) return null;
  const m = FANSUB_EP_RE.exec(stem);
  if (!m) return null;
  const ep = Number(m[1]);
  if (!(ep > 0 && ep <= 999)) return null;
  // index = 集号匹配的起点（含前导边界字符），切标题时把 ` - 01 ...` 整段去掉
  return { season: 1, episode: ep, index: m.index };
}

function titleIsOnlyEpisodeNumber(title: string, episode: number | null): boolean {
  if (episode == null) return false;
  if (!/^\d{1,3}$/.test(title.trim())) return false;
  return Number(title) === episode;
}

function parentLooksLikeShowTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return (
    title.length >= 2 &&
    !["movie", "movies", "film", "films", "tv", "series"].includes(lower) &&
    !/^s\d{1,2}$/i.test(title)
  );
}

// 剥离开头的站点水印 / 碎号噪音：sample com@ / site.com / 225544 xyz / 纯长数字 / 前导 @
function stripSiteNoise(s: string): string {
  let out = s;
  for (let i = 0; i < 4; i++) {
    const before = out;
    out = out
      .replace(/^[\s@._-]+/, "")
      .replace(/^[a-z0-9]+\.(?:com|net|org|cc|io|xyz|me|tv|app|vip|club)\b[\s@._/-]*/i, "")
      .replace(/^[a-z0-9]+\s+(?:com|net|xyz)\b[\s@._/-]+/i, "")
      .replace(/^(?:xyz|com)\s+/i, "")
      .replace(/^\d{5,}\s+/, "");
    if (out === before) break;
  }
  return out;
}

function cleanTitle(raw: string): string {
  return stripSiteNoise(raw)
    .replace(/^\s*\[[^\]]{1,40}\]\s*/, "") // 剥离开头的 [字幕组] 前缀
    .replace(/[._]+/g, " ")
    .replace(/[[\](){}]/g, " ")
    .replace(RELEASE_TAGS, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-_]+|[\s\-_]+$/g, "")
    .trim();
}

export function normalizeMediaTitleKey(raw: string | null | undefined): string {
  return cleanTitle(raw ?? "").toLowerCase();
}

/**
 * 解析单个视频文件路径 → 片名 / 年份 / 季集。文件名信息不足时回退到父目录名。
 */
export function parseMediaFileName(
  absPath: string,
  fallbackToParent = true,
): ScannedMediaFile {
  const fileName = path.basename(absPath);
  const ext = path.extname(fileName);
  const stem = ext ? fileName.slice(0, -ext.length) : fileName;
  const parent = path.basename(path.dirname(absPath));

  const tv = detectTv(stem);
  // 字幕组动画（`[组] 番名 - NN [SRTx2/ASSx2/JPSC]` / `组 番名 NN JPSC` 等）：跳过，不进 cinema。
  // 这种 `- NN` 既不是 SxxExx 也不是 EP，detectTv 抓不到、本会被当成一集一行的电影。
  // 动漫该走动漫侧（/library/local, mediaType=anime），不污染影视库。
  if (!tv && detectFansubTv(stem)) {
    return {
      absPath,
      fileName,
      kind: "skip",
      title: stem,
      year: null,
      season: 0,
      episode: 0,
    };
  }
  const bareEpisode = tv ? null : detectBareEpisode(stem);
  const stemYear = extractYear(stem);
  const parentYear = fallbackToParent ? extractYear(parent) : null;

  let title = cleanTitle(titleSegment(stem, stemYear));
  let year = stemYear;

  // 文件名标题不可用，或电影没年份但父目录有年份（如 "Interstellar (2014)/movie.mkv"）
  // → 以父目录名为准。
  const preferParent =
    fallbackToParent && !tv && stemYear == null && parentYear != null;
  const titleNeedsParent =
    !title || title.length < 2 || titleIsOnlyEpisodeNumber(title, tv?.episode ?? null);
  if (preferParent || (fallbackToParent && titleNeedsParent)) {
    const parentTitle = cleanTitle(titleSegment(parent, parentYear));
    if (parentTitle && parentTitle.length >= 2) {
      title = parentTitle;
      if (year == null) year = parentYear;
    }
  }
  if (year == null && !tv) year = parentYear;
  if (!title) title = stem;

  if (!tv && bareEpisode != null && fallbackToParent) {
    const parentTitle = cleanTitle(titleSegment(parent, parentYear));
    if (parentLooksLikeShowTitle(parentTitle)) {
      const sm = TV_SEASON_CJK.exec(parent) ?? TV_SEASON_S.exec(parent);
      return {
        absPath,
        fileName,
        kind: "tv",
        title: parentTitle,
        year: parentYear,
        season: sm ? Number(sm[1]) : 1,
        episode: bareEpisode,
      };
    }
  }

  if (tv) {
    return {
      absPath,
      fileName,
      kind: "tv",
      title,
      year,
      season: tv.season || 1,
      episode: tv.episode,
    };
  }
  return { absPath, fileName, kind: "movie", title, year, season: 0, episode: 1 };
}

/**
 * 把扫描到的文件按「片名 + 年份（电影）/ 片名 + 季（剧）」聚合成条目。
 * 同一部剧的多集归到一个 title 下；电影各自一条。
 */
export function groupScannedFiles(files: ScannedMediaFile[]): ScannedTitle[] {
  const map = new Map<string, ScannedTitle>();
  for (const f of files) {
    if (f.kind === "skip") continue; // 字幕组动画：跳过不进 cinema
    const key =
      f.kind === "tv"
        ? `tv|${f.title.toLowerCase()}|${f.season}`
        : `movie|${f.title.toLowerCase()}|${f.year ?? ""}`;
    let group = map.get(key);
    if (!group) {
      group = {
        kind: f.kind,
        title: f.title,
        year: f.year,
        season: f.kind === "tv" ? f.season : null,
        files: [],
      };
      map.set(key, group);
    }
    if (group.year == null && f.year != null) group.year = f.year;
    group.files.push(f);
  }

  for (const group of map.values()) {
    if (group.kind === "tv") {
      group.files.sort((a, b) => a.episode - b.episode);
    }
  }
  return [...map.values()];
}
