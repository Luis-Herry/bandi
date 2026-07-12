import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("cinema catalog quality filter favors live-action and current public titles", async () => {
  const { isCinemaCatalogCandidate } = await import("../src/lib/tmdb");
  const base = {
    tmdbId: 1,
    type: "tv" as const,
    title: "Public Drama",
    originalTitle: "Public Drama",
    year: 2026,
    posterPath: "/poster.jpg",
    voteAverage: 8,
    overview: "A public TV title",
    source: "on_the_air" as const,
    popularity: 18,
    voteCount: 80,
    releaseDate: "2026-06-20",
    genreIds: [18],
    originalLanguage: "en",
  };

  assert.equal(
    isCinemaCatalogCandidate(base, { today: "2026-06-27" }),
    true,
  );
  assert.equal(
    isCinemaCatalogCandidate(
      { ...base, title: "TV Anime", genreIds: [16, 10759] },
      { today: "2026-06-27" },
    ),
    false,
  );
  assert.equal(
    isCinemaCatalogCandidate(
      {
        ...base,
        type: "movie",
        source: "top_rated",
        voteAverage: 9.8,
        voteCount: 8,
      },
      { today: "2026-06-27" },
    ),
    false,
  );
  assert.equal(
    isCinemaCatalogCandidate(
      {
        ...base,
        type: "movie",
        source: "now_playing",
        releaseDate: "2026-12-01",
        voteCount: 80,
      },
      { today: "2026-06-27" },
    ),
    false,
  );
});

test("cinema space labels the discovery page as 影视库 instead of 清单", () => {
  const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");
  const pageSource = readFileSync("src/app/(main)/cinema-library/page.tsx", "utf8");
  const clientSource = readFileSync(
    "src/app/(main)/cinema-library/CinemaLibraryClient.tsx",
    "utf8",
  );
  const cinemaSource = readFileSync("src/app/(main)/cinema/CinemaClient.tsx", "utf8");

  assert.match(navSource, /label:\s*"影视库"/);
  assert.doesNotMatch(navSource, /label:\s*"清单"/);
  assert.match(pageSource, /title:\s*"影视库"/);
  assert.match(clientSource, />\s*影视库\s*</);
  assert.doesNotMatch(clientSource, /清单/);
  assert.doesNotMatch(cinemaSource, /清单/);
});

test("cinema catalog can refresh from public TMDb discovery lists", () => {
  const tmdbSource = readFileSync("src/lib/tmdb.ts", "utf8");
  const doubanSource = readFileSync("src/lib/douban.ts", "utf8");
  const enrichSource = readFileSync("src/lib/cinema-enrich.ts", "utf8");
  const routeSource = readFileSync("src/app/api/cinema/enrich/route.ts", "utf8");
  const clientSource = readFileSync(
    "src/app/(main)/cinema-library/CinemaLibraryClient.tsx",
    "utf8",
  );
  const importButtonSource = readFileSync(
    "src/components/features/CinemaCatalogImportButton.tsx",
    "utf8",
  );

  assert.match(tmdbSource, /export async function getCinemaCatalog/);
  assert.match(tmdbSource, /\/trending\/all\/week/);
  assert.match(tmdbSource, /\/movie\/top_rated/);
  assert.match(tmdbSource, /\/movie\/now_playing/);
  assert.match(tmdbSource, /\/tv\/on_the_air/);
  assert.match(tmdbSource, /\/tv\/top_rated/);
  assert.match(tmdbSource, /Promise\.all/);
  assert.match(tmdbSource, /timeoutMs: 8_000/);
  assert.match(tmdbSource, /maxAttempts: 1/);
  assert.match(doubanSource, /export async function getDoubanCatalog/);
  assert.match(doubanSource, /\/j\/search_subjects/);
  assert.match(enrichSource, /export async function importCinemaCatalog/);
  assert.match(enrichSource, /export async function importDoubanCatalog/);
  assert.match(routeSource, /scope === "catalog"/);
  assert.match(routeSource, /importCinemaCatalog\(\{ limit, enrich: false \}\)/);
  assert.match(routeSource, /importDoubanCatalog\(\{ limit/);
  assert.match(routeSource, /revalidatePath\("\/cinema-library"\)/);
  assert.match(clientSource, /CinemaCatalogImportButton/);
  assert.match(importButtonSource, /router\.refresh\(\)/);
  assert.doesNotMatch(importButtonSource, /useTransition|startRefresh/);
  assert.match(importButtonSource, /当前可展示/);
  assert.match(importButtonSource, /动漫分流/);
  assert.match(importButtonSource, /匹配已有/);
  assert.match(importButtonSource, /原地纠正/);
  assert.match(importButtonSource, /未匹配跳过/);
  assert.match(importButtonSource, /身份冲突/);
  assert.match(importButtonSource, /题材待确认/);
});

test("cinema catalog cards only navigate internally;正版链接 stay in detail page", () => {
  const cardSource = readFileSync("src/components/features/CinemaCard.tsx", "utf8");
  const localClientSource = readFileSync("src/app/(main)/cinema/CinemaClient.tsx", "utf8");
  const catalogClientSource = readFileSync(
    "src/app/(main)/cinema-library/CinemaLibraryClient.tsx",
    "utf8",
  );
  const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");
  const cinemaRoutePath = "src/app/(main)/cinema/[id]/page.tsx";
  const animeRouteSource = readFileSync("src/app/(main)/anime/[id]/page.tsx", "utf8");
  const detailSource = readFileSync(
    "src/app/(main)/anime/[id]/CinemaDetail.tsx",
    "utf8",
  );

  assert.match(cardSource, /detailSource\?: "local" \| "library"/);
  assert.match(
    cardSource,
    /detailSource\s*\?\s*`\/cinema\/\$\{item\.id\}\?from=\$\{detailSource\}`\s*:\s*`\/cinema\/\$\{item\.id\}`/,
  );
  assert.match(localClientSource, /detailSource="local"/);
  assert.match(catalogClientSource, /detailSource="library"/);
  assert.match(
    navSource,
    /const cinemaDetailSource = pathname\.startsWith\("\/cinema\/"\)[\s\S]*searchParams\.get\("from"\)[\s\S]*null/,
  );
  assert.match(navSource, /l\.href === "\/cinema" &&\s*cinemaDetailSource === "local"/);
  assert.match(
    navSource,
    /l\.href === "\/cinema-library" &&\s*cinemaDetailSource === "library"/,
  );
  assert.doesNotMatch(cardSource, /`\/anime\/\$\{item\.id\}`/);
  assert.equal(existsSync(cinemaRoutePath), true);
  assert.match(readFileSync(cinemaRoutePath, "utf8"), /CinemaDetail/);
  assert.match(animeRouteSource, /redirect\(`\/cinema\/\$\{animeId\}`\)/);
  assert.doesNotMatch(cardSource, /target="_blank"|providerLabel.*href|watchProviders/);
  assert.match(detailSource, /id="where-to-watch"/);
  assert.match(detailSource, /target="_blank"/);
});

test("cinema detail exposes rating and review notes for tracked cinema items", () => {
  const detailSource = readFileSync(
    "src/app/(main)/anime/[id]/CinemaDetail.tsx",
    "utf8",
  );

  assert.match(detailSource, /import \{ RatingNotes \}/);
  assert.match(detailSource, /<RatingNotes/);
  assert.match(detailSource, /initialRating=\{userAnime\?\.rating\}/);
  assert.match(detailSource, /initialNotes=\{userAnime\?\.notes\}/);
});

test("cinema detail includes progress control and episode state legend", () => {
  const detailSource = readFileSync(
    "src/app/(main)/anime/[id]/CinemaDetail.tsx",
    "utf8",
  );
  const watchControlSource = readFileSync(
    "src/components/features/CinemaWatchControl.tsx",
    "utf8",
  );
  const episodeListSource = readFileSync(
    "src/components/features/CinemaEpisodeList.tsx",
    "utf8",
  );

  assert.match(detailSource, /import \{ EpisodeProgressControl \}/);
  assert.match(detailSource, /<EpisodeProgressControl/);
  assert.match(detailSource, /initialCurrent=\{watchedCount\}/);
  assert.match(detailSource, /maxEpisode=\{maxEpisodeNumber\}/);
  assert.match(detailSource, /enabled=\{canEditEpisodeProgress\}/);
  assert.match(detailSource, /disabledLabel="同步剧集后可记录"/);
  assert.match(detailSource, /detailContinueEpisode/);
  assert.match(detailSource, /episode\.number > watchedThroughEpisode/);
  assert.match(detailSource, /watchStatus=\{userAnime\?\.watchStatus\}/);
  assert.match(watchControlSource, /anime-watch-status-change/);
  assert.match(watchControlSource, /setStatus\(detail\.watchStatus\)/);
  assert.match(episodeListSource, /已看/);
  assert.match(episodeListSource, /当前/);
  assert.match(episodeListSource, /未看/);
  assert.match(episodeListSource, /未播出/);
  assert.match(episodeListSource, /anime-progress-change/);
  assert.match(episodeListSource, /anime-watch-status-change/);
  assert.match(episodeListSource, /displayWatchStatus === "completed"/);
});

test("cinema detail can enrich one item on demand without running the full catalog", () => {
  const detailSource = readFileSync(
    "src/app/(main)/anime/[id]/CinemaDetail.tsx",
    "utf8",
  );
  const buttonSource = readFileSync(
    "src/components/features/CinemaDetailEnrichButton.tsx",
    "utf8",
  );

  assert.match(detailSource, /CinemaDetailEnrichButton/);
  assert.match(detailSource, /needsMetadata/);
  assert.match(detailSource, /metadataAttempted/);
  assert.match(detailSource, /anime\.doubanRatingFetchedAt != null/);
  assert.doesNotMatch(detailSource, /anime\.tmdbId == null/);
  assert.match(buttonSource, /body: JSON\.stringify\(\{ animeId \}\)/);
  assert.match(buttonSource, /data\.result\.reclassified/);
  assert.match(buttonSource, /router\.replace\(`\/anime\/\$\{data\.result\.animeId\}`\)/);
  assert.doesNotMatch(buttonSource, /scope: "catalog"|scope: "all"|scope: "missing"/);
});

test("Douban TV animation is routed away from cinema at import and query time", () => {
  const doubanSource = readFileSync("src/lib/douban.ts", "utf8");
  const enrichSource = readFileSync("src/lib/cinema-enrich.ts", "utf8");
  const cinemaQuerySource = readFileSync(
    "src/lib/db-helpers/cinema.ts",
    "utf8",
  );

  assert.match(doubanSource, /tag: "日本动画"/);
  assert.match(doubanSource, /tag: "动画"/);
  assert.match(doubanSource, /hasDoubanAnimationGenre/);
  assert.match(enrichSource, /applyDoubanAnimationMetadata/);
  assert.match(enrichSource, /mediaType: "anime"/);
  assert.match(enrichSource, /findDoubanCatalogRowsById/);
  assert.match(enrichSource, /\.where\(eq\(anime\.doubanId, doubanId\)\)[\s\S]*?\.all\(\)/);
  assert.match(enrichSource, /skippedAnimeUnmatched/);
  assert.match(cinemaQuerySource, /hasDoubanAnimationGenre\(row\.tags\)/);
});

test("cinema local movies default to 全部 and local enrichment uses local scope", () => {
  const cinemaSource = readFileSync(
    "src/app/(main)/cinema/CinemaClient.tsx",
    "utf8",
  );
  const enrichButtonSource = readFileSync(
    "src/components/features/CinemaEnrichButton.tsx",
    "utf8",
  );

  assert.match(cinemaSource, /const ALL_MOVIES = "全部"/);
  assert.match(cinemaSource, /: ALL_MOVIES/);
  assert.match(cinemaSource, /genre === ALL_MOVIES\s*\? movie/);
  assert.match(cinemaSource, /<CinemaEnrichButton scope="local"/);
  assert.match(enrichButtonSource, /\/api\/cinema\/enrich\?scope=local/);
  assert.match(enrichButtonSource, /请先扫描文件/);
});
