/**
 * Seed script. Run with: npm run db:seed
 *
 * Idempotent: clears table contents (not schema) before inserting.
 * Cover images use picsum.photos seeded URLs so they look like
 * cinematic / ember / dusk landscapes — matching the project's
 * "depleted lands" visual reference.
 */

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./index";
import {
  users,
  anime,
  userAnime,
  episodes,
  rssSources,
  downloadQueue,
} from "./schema";

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

/** Day-of-week today (Sun=0 .. Sat=6). */
const TODAY_DOW = new Date().getDay();

function daysAgo(n: number): Date {
  return new Date(NOW - n * DAY);
}
function daysAhead(n: number): Date {
  return new Date(NOW + n * DAY);
}

interface AnimeSeed {
  title: string;
  titleJa?: string;
  cover: string; // picsum seed
  synopsis: string;
  type: "TV" | "Movie" | "OVA" | "Web";
  status: "airing" | "completed" | "upcoming";
  totalEpisodes: number;
  airingDay: number | null;
  airingTime: string | null;
  season: "winter" | "spring" | "summer" | "fall" | null;
  year: number | null;
  tags: string[];
  accentColor: string;
  /** what the seed user sees this as */
  userWatchStatus:
    | "watching"
    | "planning"
    | "completed"
    | "onhold"
    | "dropped";
  currentEpisode: number;
  rating?: number;
  notes?: string;
  /**
   * Days offsets at which each episode was/will be aired, relative to today.
   * Length determines how many episode rows we generate.
   */
  episodeAirOffsets: number[];
  bangumiId?: number;
}

const ANIME_SEEDS: AnimeSeed[] = [
  // ── watching (4 部) ───────────────────────────────────────────
  {
    title: "余烬之地",
    titleJa: "アッシュランド",
    cover: "https://picsum.photos/seed/embers-land-1/1600/2400",
    synopsis:
      "战火退潮一百年后，孤独的拾遗者在燃尽的大陆上重新点亮被遗忘的灯火。一段缓慢而温柔的旅程，关于记忆、灰烬与重生。",
    type: "TV",
    status: "airing",
    totalEpisodes: 12,
    airingDay: TODAY_DOW, // 今日更新
    airingTime: "23:30",
    season: "spring",
    year: 2026,
    tags: ["奇幻", "废土", "公路", "原创"],
    accentColor: "#d4a853",
    userWatchStatus: "watching",
    currentEpisode: 4,
    rating: 5,
    notes: "本季最期待，画面调色一绝。",
    bangumiId: 9001,
    episodeAirOffsets: [-49, -42, -35, -28, -21, -14, -7, 0, 7],
  },
  {
    title: "黄昏列车",
    titleJa: "黄昏のトレイン",
    cover: "https://picsum.photos/seed/dusk-train-2/1600/2400",
    synopsis: "穿越被夕阳染红的山脉，列车永远朝着地平线行驶。",
    type: "TV",
    status: "airing",
    totalEpisodes: 13,
    airingDay: (TODAY_DOW + 1) % 7,
    airingTime: "22:00",
    season: "spring",
    year: 2026,
    tags: ["治愈", "公路", "群像"],
    accentColor: "#b87333",
    userWatchStatus: "watching",
    currentEpisode: 5,
    rating: 4,
    bangumiId: 9002,
    episodeAirOffsets: [-56, -49, -42, -35, -28, -21, -14, -7, 1, 8],
  },
  {
    title: "钢与霜",
    titleJa: "鋼と霜",
    cover: "https://picsum.photos/seed/steel-frost-3/1600/2400",
    synopsis: "北境的雪季比战争更漫长。",
    type: "TV",
    status: "airing",
    totalEpisodes: 24,
    airingDay: TODAY_DOW, // 今日更新（漏看）
    airingTime: "00:30",
    season: "winter",
    year: 2026,
    tags: ["战争", "群像", "权谋"],
    accentColor: "#8b9aa3",
    userWatchStatus: "watching",
    currentEpisode: 6, // 落后一集 → 漏看
    rating: 4,
    notes: "节奏稍慢，但每集都有亮点。",
    bangumiId: 9003,
    episodeAirOffsets: [-56, -49, -42, -35, -28, -21, -14, -7, 0],
  },
  {
    title: "灯塔守夜人",
    titleJa: "灯台守の夜",
    cover: "https://picsum.photos/seed/lighthouse-4/1600/2400",
    synopsis: "废弃灯塔的最后一位守夜人，与海风、信件、过客的故事。",
    type: "TV",
    status: "airing",
    totalEpisodes: 12,
    airingDay: (TODAY_DOW + 2) % 7,
    airingTime: "23:00",
    season: "spring",
    year: 2026,
    tags: ["治愈", "日常", "独居"],
    accentColor: "#c8a26b",
    userWatchStatus: "watching",
    currentEpisode: 3,
    rating: 5,
    bangumiId: 9004,
    episodeAirOffsets: [-42, -35, -28, -21, -14, -7, 2, 9],
  },

  // ── planning (2 部) ───────────────────────────────────────────
  {
    title: "风暴边缘",
    titleJa: "ストームエッジ",
    cover: "https://picsum.photos/seed/stormedge-5/1600/2400",
    synopsis: "在永不停歇的雷暴中央，飞行员们追寻传说中的静风之眼。",
    type: "TV",
    status: "upcoming",
    totalEpisodes: 12,
    airingDay: (TODAY_DOW + 3) % 7,
    airingTime: "22:30",
    season: "summer",
    year: 2026,
    tags: ["冒险", "机械", "蒸汽朋克"],
    accentColor: "#9a6b3d",
    userWatchStatus: "planning",
    currentEpisode: 0,
    bangumiId: 9005,
    episodeAirOffsets: [3, 10, 17],
  },
  {
    title: "落日骑团",
    titleJa: "サンセット・オーダー",
    cover: "https://picsum.photos/seed/sunset-order-6/1600/2400",
    synopsis: "最后的骑团在黄昏中接受最后一道誓言。",
    type: "TV",
    status: "upcoming",
    totalEpisodes: 12,
    airingDay: (TODAY_DOW + 5) % 7,
    airingTime: "23:00",
    season: "summer",
    year: 2026,
    tags: ["奇幻", "战记"],
    accentColor: "#b87055",
    userWatchStatus: "planning",
    currentEpisode: 0,
    bangumiId: 9006,
    episodeAirOffsets: [5, 12, 19],
  },

  // ── completed (2 部) ──────────────────────────────────────────
  {
    title: "盐之歌",
    titleJa: "塩のうた",
    cover: "https://picsum.photos/seed/salt-song-7/1600/2400",
    synopsis: "盐之大陆上的一段口述史诗。",
    type: "TV",
    status: "completed",
    totalEpisodes: 12,
    airingDay: null,
    airingTime: null,
    season: "winter",
    year: 2025,
    tags: ["群像", "民俗", "史诗"],
    accentColor: "#d4b87a",
    userWatchStatus: "completed",
    currentEpisode: 12,
    rating: 5,
    notes: "今年最好的群像。",
    bangumiId: 9007,
    episodeAirOffsets: [-180, -173, -166, -159, -152, -145, -138, -131, -124, -117, -110, -103],
  },
  {
    title: "蓝时刻",
    titleJa: "ブルーアワー",
    cover: "https://picsum.photos/seed/blue-hour-8/1600/2400",
    synopsis: "日落与黑夜之间，那短短二十分钟的城市侧影。",
    type: "Movie",
    status: "completed",
    totalEpisodes: 1,
    airingDay: null,
    airingTime: null,
    season: "fall",
    year: 2025,
    tags: ["剧场版", "都市", "成长"],
    accentColor: "#c69960",
    userWatchStatus: "completed",
    currentEpisode: 1,
    rating: 4,
    bangumiId: 9008,
    episodeAirOffsets: [-220],
  },

  // ── onhold (1 部) ─────────────────────────────────────────────
  {
    title: "霓灯渡口",
    titleJa: "ネオン・フェリー",
    cover: "https://picsum.photos/seed/neon-ferry-9/1600/2400",
    synopsis: "夜雾中漂浮的渡轮，载着每个人未说出口的话。",
    type: "TV",
    status: "airing",
    totalEpisodes: 13,
    airingDay: (TODAY_DOW + 4) % 7,
    airingTime: "01:00",
    season: "spring",
    year: 2026,
    tags: ["都市", "群像", "夜"],
    accentColor: "#a87e4f",
    userWatchStatus: "onhold",
    currentEpisode: 2,
    notes: "暂时搁置，节奏没跟上。",
    bangumiId: 9009,
    episodeAirOffsets: [-49, -42, -35, -28, -21, -14, -7, 4, 11],
  },

  // ── dropped (1 部) ────────────────────────────────────────────
  {
    title: "破碎象限",
    titleJa: "破壊象限",
    cover: "https://picsum.photos/seed/quadrant-10/1600/2400",
    synopsis: "末日后第七个文明的考古笔记。",
    type: "TV",
    status: "airing",
    totalEpisodes: 12,
    airingDay: (TODAY_DOW + 6) % 7,
    airingTime: "00:00",
    season: "spring",
    year: 2026,
    tags: ["科幻", "考古"],
    accentColor: "#7a8a85",
    userWatchStatus: "dropped",
    currentEpisode: 1,
    notes: "设定有趣，但叙事太碎。",
    bangumiId: 9010,
    episodeAirOffsets: [-35, -28, -21, -14, -7, 6, 13],
  },
];

async function main() {
  console.log("[seed] clearing existing rows…");
  // child rows first
  db.delete(downloadQueue).run();
  db.delete(episodes).run();
  db.delete(userAnime).run();
  db.delete(rssSources).run();
  db.delete(anime).run();
  db.delete(users).run();

  // ── user ────────────────────────────────────────────────────
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash("demo2026", 10);
  db.insert(users)
    .values({
      id: userId,
      username: "demo",
      passwordHash,
    })
    .run();
  console.log(`[seed] user "demo" / "demo2026" created (${userId})`);

  // ── anime + episodes + userAnime ───────────────────────────
  for (const s of ANIME_SEEDS) {
    const inserted = db
      .insert(anime)
      .values({
        bangumiId: s.bangumiId,
        title: s.title,
        titleJa: s.titleJa,
        coverUrl: s.cover,
        synopsis: s.synopsis,
        type: s.type,
        status: s.status,
        totalEpisodes: s.totalEpisodes,
        airingDay: s.airingDay,
        airingTime: s.airingTime,
        season: s.season,
        year: s.year,
        tags: s.tags,
        accentColor: s.accentColor,
      })
      .returning({ id: anime.id })
      .get();
    const animeId = inserted.id;

    db.insert(userAnime)
      .values({
        userId,
        animeId,
        watchStatus: s.userWatchStatus,
        currentEpisode: s.currentEpisode,
        rating: s.rating,
        notes: s.notes,
      })
      .run();

    for (let i = 0; i < s.episodeAirOffsets.length; i++) {
      const offset = s.episodeAirOffsets[i];
      const aired = offset >= 0 ? daysAhead(offset) : daysAgo(-offset);
      db.insert(episodes)
        .values({
          animeId,
          number: i + 1,
          title: `第 ${i + 1} 话`,
          airedAt: aired,
          isDownloaded: offset <= 0 && Math.random() > 0.4,
        })
        .run();
    }

    console.log(
      `[seed] anime "${s.title}" — ${s.userWatchStatus}, ep ${s.currentEpisode}/${s.totalEpisodes}`,
    );
  }

  // ── rssSources ─────────────────────────────────────────────
  const rssRows = [
    {
      name: "Mikan Project",
      url: "https://mikanani.me/RSS/Bangumi?bangumiId=3300",
      filters: { quality: "1080p", group: "ANi" },
      isActive: true,
    },
    {
      name: "Nyaa - 字幕组合集",
      url: "https://nyaa.si/?page=rss&q=&c=1_2&f=0",
      filters: { quality: "1080p", keywords: ["BDRip"] },
      isActive: true,
    },
    {
      name: "动漫花园",
      url: "https://share.dmhy.org/topics/rss/rss.xml",
      filters: { quality: "1080p" },
      isActive: false,
    },
  ];
  for (const r of rssRows) {
    db.insert(rssSources)
      .values({
        name: r.name,
        url: r.url,
        filters: r.filters,
        isActive: r.isActive,
      })
      .run();
  }
  console.log(`[seed] ${rssRows.length} rss sources inserted`);

  // ── downloadQueue ──────────────────────────────────────────
  const firstAnime = db
    .select({ id: anime.id })
    .from(anime)
    .all()[0];
  const downloads = [
    {
      animeId: firstAnime?.id ?? null,
      title: "[ANi] 余烬之地 - 08 [1080P][Bilibili][WEB-DL][AAC AVC][CHT CHS]",
      magnetUrl:
        "magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12&dn=embers",
      status: "downloading" as const,
      progress: 67,
      speed: "4.2 MB/s",
    },
    {
      animeId: firstAnime?.id ?? null,
      title: "[Nekomoe kissaten] 黄昏列车 - 05 [1080p][JPSC]",
      magnetUrl:
        "magnet:?xt=urn:btih:fedcba0987654321fedcba0987654321fedcba09&dn=dusk-train",
      status: "completed" as const,
      progress: 100,
      speed: null,
    },
  ];
  for (const d of downloads) {
    db.insert(downloadQueue)
      .values({
        animeId: d.animeId,
        title: d.title,
        magnetUrl: d.magnetUrl,
        status: d.status,
        progress: d.progress,
        speed: d.speed ?? undefined,
      })
      .run();
  }
  console.log(`[seed] ${downloads.length} download queue items inserted`);

  console.log("[seed] done.");
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
