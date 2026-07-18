import assert from "node:assert/strict";
import test from "node:test";
import type { YucEntry } from "../src/lib/yuc/types";
import {
  dedupeYucEntries,
  findUniqueYucCatalogMatch,
  findUniqueYucCatalogTarget,
  findUniqueYucMatch,
  isReliableYucMovieWorkMatch,
  isReliableYucMatch,
  isYucMovieReRelease,
  yucEntryType,
} from "../src/lib/yuc/match";

function entry(overrides: Partial<YucEntry> = {}): YucEntry {
  return {
    sourceKey: "yuc:season:202607:0000000000000001",
    sourceKind: "season",
    sourceUrl: "https://yuc.wiki/202607/",
    title: "關於我轉生變成史萊姆這檔事 第4季",
    titleJa: "転生したらスライムだった件 第4期",
    coverUrl: null,
    premiereRaw: "7/5~",
    premiereDate: "2026-07-05",
    weeklyDay: 0,
    weeklyTime: "23:00",
    scheduleRaw: "周日 23:00",
    totalEpisodes: 24,
    format: "TV",
    tags: ["小说改"],
    staff: [],
    cast: [],
    studio: null,
    original: null,
    officialUrl: null,
    pvUrl: null,
    providers: [],
    seasonYear: 2026,
    seasonMonth: 7,
    ...overrides,
  };
}

test("YUC matching accepts exact Japanese or simplified/traditional title identity", () => {
  const sample = entry();
  assert.equal(
    isReliableYucMatch(sample, {
      title: "关于我转生变成史莱姆这档事 第4季",
      titleJa: "転生したらスライムだった件 第4期",
      year: 2026,
      format: "TV",
    }),
    true,
  );
});

test("read-only catalog matching accepts one unique base-title subtitle variant", () => {
  const sample = entry({
    title: "暴怒千金誓要复仇",
    titleJa: "ブチ切れ令嬢は報復を誓いました。",
  });
  assert.equal(
    findUniqueYucCatalogMatch([sample], {
      title: "暴怒千金发誓复仇。～凭借魔导书之力打垮祖国～",
      titleJa:
        "ブチ切れ令嬢は報復を誓いました。～魔導書の力で祖国を叩き潰します～",
      year: 2026,
      format: "TV",
    }),
    sample,
  );
  assert.equal(
    findUniqueYucCatalogMatch([sample], {
      title: "暴怒千金发誓复仇",
      year: 2025,
      format: "TV",
    }),
    null,
  );
});

test("read-only catalog matching stays closed on multiple relaxed candidates", () => {
  const first = entry({ title: "示例动画", titleJa: "サンプルアニメ" });
  const second = entry({
    sourceKey: "yuc:future:new:0000000000000002",
    sourceKind: "future",
    sourceUrl: "https://yuc.wiki/new/",
    title: "示例动画 完",
    titleJa: "サンプルアニメ 完",
  });
  assert.equal(
    findUniqueYucCatalogMatch([first, second], {
      title: "示例动画 完整标题",
      titleJa: "サンプルアニメ 完全版",
      year: 2026,
      format: "TV",
    }),
    null,
  );
});

test("catalog identity chooses the correct Re:Zero cour by date and main episode count", () => {
  const reZero = entry({
    title: "Re:从零开始的异世界生活 第4期",
    titleJa: "Re:ゼロから始める異世界生活 4th season",
    premiereDate: "2026-04-08",
    totalEpisodes: 11,
    seasonMonth: 4,
  });
  const lossArc = {
    id: 547888,
    title: "Re：从零开始的异世界生活 第四季 丧失篇",
    titleJa: "Re:ゼロから始める異世界生活 4th season 喪失編",
    year: 2026,
    format: "TV",
    premiereDate: "2026-04-08",
    seasonMonth: 4,
    totalEpisodes: 11,
  };
  const recoveryArc = {
    id: 633836,
    title: "Re：从零开始的异世界生活 第四季 再起篇",
    titleJa: "Re:ゼロから始める異世界生活 4th season 再起編",
    year: 2026,
    format: "TV",
    premiereDate: "2026-08-12",
    seasonMonth: 8,
    totalEpisodes: 8,
  };

  assert.equal(
    findUniqueYucCatalogTarget(reZero, [recoveryArc, lossArc])?.id,
    547888,
  );
  assert.equal(
    findUniqueYucCatalogTarget(
      { ...reZero, premiereDate: null },
      [
        { ...lossArc, premiereDate: null },
        { ...recoveryArc, premiereDate: null, seasonMonth: 4, totalEpisodes: 11 },
      ],
    ),
    null,
  );
});

test("catalog identity normalizes numeric season labels for Wistoria", () => {
  const wistoria = entry({
    title: "杖与剑的魔剑谭 第2期",
    titleJa: "杖と剣のウィストリア 第2期",
    premiereDate: "2026-04-12",
    totalEpisodes: 12,
    seasonMonth: 4,
  });
  const canonical = {
    id: 515856,
    title: "杖与剑的魔剑谭 第二季",
    titleJa: "杖と剣のウィストリア Season 2",
    year: 2026,
    format: "TV",
    premiereDate: "2026-04-12",
    seasonMonth: 4,
    totalEpisodes: 12,
  };

  assert.equal(findUniqueYucCatalogTarget(wistoria, [canonical])?.id, 515856);
});

test("read-only catalog matching handles reordered media labels and a unique Latin subtitle", () => {
  const reordered = entry({
    title: "吹响吧上低音号 最终乐章 后篇",
    titleJa: null,
    format: "Movie",
  });
  assert.equal(
    findUniqueYucCatalogMatch([reordered], {
      title: "最终乐章 吹响吧！上低音号 后篇",
      year: 2026,
      format: "剧场版",
    }),
    reordered,
  );

  const latin = entry({
    title: "只狼 NO DEFEAT",
    titleJa: null,
    format: "Movie",
  });
  assert.equal(
    findUniqueYucCatalogMatch([latin], {
      title: "SEKIRO: NO DEFEAT",
      year: 2026,
      format: "Movie",
    }),
    latin,
  );
});

test("read-only catalog matching dedupes an exact special despite distribution labels", () => {
  const special = entry({
    sourceKind: "special",
    sourceKey: "yuc:special:sp:0000000000000003",
    sourceUrl: "https://yuc.wiki/sp/",
    title: "缎带英雄",
    titleJa: "THE RIBBON HERO リボンヒーロー",
    format: "Movie",
  });
  assert.equal(
    findUniqueYucCatalogMatch([special], {
      title: "缎带英雄",
      titleJa: "THE RIBBON HERO リボンヒーロー",
      year: 2026,
      format: "WEB",
    }),
    special,
  );
  assert.equal(
    isReliableYucMatch(special, {
      title: special.title,
      titleJa: special.titleJa,
      year: 2026,
      format: "WEB",
    }),
    false,
  );

  const chapter = entry({
    sourceKind: "special",
    sourceKey: "yuc:special:sp:0000000000000004",
    sourceUrl: "https://yuc.wiki/sp/",
    title: "机动警察 EZY File 2",
    titleJa: null,
    format: "OVA",
  });
  assert.equal(
    findUniqueYucCatalogMatch([chapter], {
      title: "机动警察 EZY 第二章",
      year: 2026,
      format: "剧场版",
    }),
    chapter,
  );
});

test("YUC matching rejects year, explicit season, and media format conflicts", () => {
  const sample = entry();
  assert.equal(
    isReliableYucMatch(sample, {
      title: sample.title,
      year: 2025,
      format: "TV",
    }),
    false,
  );
  assert.equal(
    isReliableYucMatch(sample, {
      title: "關於我轉生變成史萊姆這檔事 第3季",
      year: 2026,
      format: "TV",
    }),
    false,
  );
  assert.equal(
    isReliableYucMatch(sample, {
      title: sample.title,
      year: 2026,
      format: "Movie",
    }),
    false,
  );
});

test("YUC matching fails closed when two candidates have the same confidence", () => {
  const first = entry();
  const second = entry({
    sourceKey: "yuc:future:new:0000000000000002",
    sourceKind: "future",
    sourceUrl: "https://yuc.wiki/new/",
  });
  assert.equal(
    findUniqueYucMatch([first, second], {
      title: first.title,
      titleJa: first.titleJa,
      year: 2026,
      format: "TV",
    }),
    null,
  );
});

test("YUC cross-page dedupe keeps one work and merges complementary facts", () => {
  const season = entry({
    providers: [
      { label: "港台", service: "巴哈姆特动画疯", url: "https://acg.gamer.com.tw/acgDetail.php?s=1" },
    ],
  });
  const special = entry({
    sourceKey: "yuc:special:sp:0000000000000002",
    sourceKind: "special",
    sourceUrl: "https://yuc.wiki/sp/",
    officialUrl: "https://example-anime.jp/",
    providers: [
      { label: "环大陆", service: "Crunchyroll", url: "https://www.crunchyroll.com/series/1" },
    ],
  });
  const result = dedupeYucEntries([season, special]);
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceKind, "season");
  assert.equal(result[0].officialUrl, "https://example-anime.jp/");
  assert.equal(result[0].providers.length, 2);
});

test("YUC entry types keep animation movies and specials in the anime domain", () => {
  assert.equal(yucEntryType(entry({ format: "Movie" })), "Movie");
  assert.equal(yucEntryType(entry({ format: "OAD" })), "OVA");
  assert.equal(yucEntryType(entry({ format: "WebSP" })), "OVA");
});

test("movie work identity ignores a regional re-release year and marker", () => {
  const movie = entry({
    sourceKind: "movie",
    sourceKey: "yuc:movie:movie:0000000000000009",
    sourceUrl: "https://yuc.wiki/movie/",
    title: "你的名字（重映）",
    titleJa: "君の名は。",
    format: "Movie",
    premiereRaw: "2025/7/19重映",
    premiereDate: "2025-07-19",
    seasonYear: 2025,
  });
  const target = {
    title: "你的名字",
    titleJa: "君の名は。",
    year: 2016,
    format: "Movie",
  };
  assert.equal(isReliableYucMatch(movie, target), false);
  assert.equal(isReliableYucMovieWorkMatch(movie, target), true);
  assert.equal(findUniqueYucCatalogMatch([movie], target), movie);
  assert.equal(isYucMovieReRelease(movie), true);
  assert.equal(
    isReliableYucMovieWorkMatch(movie, {
      ...target,
      titleJa: "同名リメイク",
    }),
    false,
  );
});
