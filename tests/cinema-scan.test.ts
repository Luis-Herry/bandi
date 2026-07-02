import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseMediaFileName,
  groupScannedFiles,
  extractYear,
} from "../src/lib/cinema-scan";

test("movie with parenthesized year + release tags", () => {
  const r = parseMediaFileName("/media/movies/Inception (2010) 1080p BluRay x265.mkv");
  assert.equal(r.kind, "movie");
  assert.equal(r.title, "Inception");
  assert.equal(r.year, 2010);
  assert.equal(r.episode, 1);
});

test("movie whose title contains a year-like number prefers the real year", () => {
  const r = parseMediaFileName("/media/Blade.Runner.2049.2017.2160p.UHD.BluRay.mkv");
  assert.equal(r.kind, "movie");
  assert.equal(r.title, "Blade Runner 2049");
  assert.equal(r.year, 2017);
});

test("movie without a year", () => {
  const r = parseMediaFileName("/media/Parasite.mkv");
  assert.equal(r.kind, "movie");
  assert.equal(r.title, "Parasite");
  assert.equal(r.year, null);
});

test("tv SxxExx", () => {
  const r = parseMediaFileName("/media/tv/Breaking.Bad.S01E05.1080p.WEB-DL.mkv");
  assert.equal(r.kind, "tv");
  assert.equal(r.title, "Breaking Bad");
  assert.equal(r.season, 1);
  assert.equal(r.episode, 5);
});

test("tv NxNN form", () => {
  const r = parseMediaFileName("/media/The Office 3x07.mkv");
  assert.equal(r.kind, "tv");
  assert.equal(r.title, "The Office");
  assert.equal(r.season, 3);
  assert.equal(r.episode, 7);
});

test("tv Chinese season + episode markers", () => {
  const r = parseMediaFileName("/media/权力的游戏 第1季 第03集.mkv");
  assert.equal(r.kind, "tv");
  assert.equal(r.title, "权力的游戏");
  assert.equal(r.season, 1);
  assert.equal(r.episode, 3);
});

test("tv EP form defaults to season 1", () => {
  const r = parseMediaFileName("/media/庆余年.EP12.1080p.mkv");
  assert.equal(r.kind, "tv");
  assert.equal(r.title, "庆余年");
  assert.equal(r.season, 1);
  assert.equal(r.episode, 12);
});

test("falls back to parent folder name when filename is bare", () => {
  const r = parseMediaFileName("/media/movies/Interstellar (2014)/movie.mkv");
  assert.equal(r.kind, "movie");
  assert.equal(r.title, "Interstellar");
  assert.equal(r.year, 2014);
});

test("bare numeric filenames under a show folder are treated as tv episodes", () => {
  const first = parseMediaFileName("/media/悲喜渔生/01.mkv");
  const second = parseMediaFileName("/media/悲喜渔生/02.mkv");

  assert.equal(first.kind, "tv");
  assert.equal(first.title, "悲喜渔生");
  assert.equal(first.season, 1);
  assert.equal(first.episode, 1);
  assert.equal(second.kind, "tv");
  assert.equal(second.title, "悲喜渔生");
  assert.equal(second.episode, 2);

  const groups = groupScannedFiles([second, first]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.kind, "tv");
  assert.equal(groups[0]?.title, "悲喜渔生");
  assert.deepEqual(
    groups[0]?.files.map((f) => f.episode),
    [1, 2],
  );
});

test("episode-prefixed Chinese tv files fall back to the show folder title", () => {
  const r = parseMediaFileName(
    "/media/\u60b2\u559c\u6e14\u751f \u4e2d\u65e5\u53cc\u8bed\u5b57\u5e55 1-12\u5168\u96c6 1080P/10-\u7b2c10\u8bdd \u5e38\u5b8f\u4e0e\u8d35\u660e-1080P AVC.mp4",
  );

  assert.equal(r.kind, "tv");
  assert.equal(r.title, "\u60b2\u559c\u6e14\u751f \u4e2d\u65e5\u53cc\u8bed\u5b57\u5e55 1-12\u5168\u96c6");
  assert.equal(r.season, 1);
  assert.equal(r.episode, 10);
});

test("extractYear prefers parenthesized over title numbers", () => {
  assert.equal(extractYear("Blade Runner 2049 (2017)"), 2017);
  assert.equal(extractYear("The Matrix 1999 1080p"), 1999);
  assert.equal(extractYear("No Year Here"), null);
});

test("strips site-watermark / junk prefixes from titles", () => {
  assert.equal(parseMediaFileName("/m/sample com@TEST-390.mkv").title, "TEST-390");
  assert.equal(parseMediaFileName("/m/225544 xyz DEMO-231.mp4").title, "DEMO-231");
  assert.equal(
    parseMediaFileName("/m/sample com 935838 xyz MOCK-590.mkv").title,
    "MOCK-590",
  );
});

test("does not over-strip legit titles containing TV / common words", () => {
  // 年份会先截断标题，站点清洗不应吃掉 "Live TV"
  assert.equal(parseMediaFileName("/m/Live TV 2020 1080p.mkv").title, "Live TV");
  assert.equal(parseMediaFileName("/m/Inception (2010).mkv").title, "Inception");
});

test("groupScannedFiles groups tv episodes and keeps movies separate", () => {
  const files = [
    parseMediaFileName("/m/Show.S01E02.mkv"),
    parseMediaFileName("/m/Show.S01E01.mkv"),
    parseMediaFileName("/m/Inception (2010).mkv"),
  ];
  const groups = groupScannedFiles(files);
  assert.equal(groups.length, 2);

  const tv = groups.find((g) => g.kind === "tv");
  assert.ok(tv);
  assert.equal(tv.title, "Show");
  assert.equal(tv.season, 1);
  assert.equal(tv.files.length, 2);
  assert.deepEqual(
    tv.files.map((f) => f.episode),
    [1, 2],
  );

  const movie = groups.find((g) => g.kind === "movie");
  assert.ok(movie);
  assert.equal(movie.title, "Inception");
  assert.equal(movie.year, 2010);
});

test("fansub anime '[组] 番名 - NN [SRTx2/ASSx2]' is skipped (not imported into cinema)", () => {
  const files = [
    parseMediaFileName(
      "/m/[Nekomoe kissaten&LoliHouse] New PANTY & STOCKING with GARTERBELT - 02 [WebRip 1080p HEVC-10bit AACx2 ASSx2].mkv",
    ),
    parseMediaFileName(
      "/m/[Nekomoe kissaten&LoliHouse] New PANTY & STOCKING with GARTERBELT - 01 [WebRip 1080p HEVC-10bit AACx2 ASSx2].mkv",
    ),
  ];
  assert.equal(files[0].kind, "skip");
  assert.equal(files[1].kind, "skip");
  // 跳过的文件不进任何分组（不进 cinema）
  assert.equal(groupScannedFiles(files).length, 0);
});

test("fansub anime 'Group Title NN JPSC' / '- NN - SRTx2' is skipped", () => {
  assert.equal(
    parseMediaFileName("/m/Nekomoe kissaten Medalist 05 JPSC.mkv").kind,
    "skip",
  );
  assert.equal(
    parseMediaFileName(
      "/m/LoliHouse Uma Musume Cinderella Gray - 12 - SRTx2.mkv",
    ).kind,
    "skip",
  );
});

test("a movie with a trailing - N but no fansub signal stays a movie", () => {
  const r = parseMediaFileName("/m/Mission Impossible - 2 (2000) 1080p BluRay.mkv");
  assert.equal(r.kind, "movie");
});
