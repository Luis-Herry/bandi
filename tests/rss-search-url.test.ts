import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSearchRssUrls, extractEpisodeNumber } from "../src/lib/rss";

test("buildSearchRssUrls adds Animes Garden search queries", () => {
  const urls = buildSearchRssUrls("https://api.animes.garden/feed.xml", [
    "少女乐队",
  ]);

  assert.deepEqual(urls, [
    "https://api.animes.garden/feed.xml",
    "https://api.animes.garden/feed.xml?search=%E5%B0%91%E5%A5%B3%E4%B9%90%E9%98%9F",
  ]);
});

test("buildSearchRssUrls adds dmhy keyword queries", () => {
  const urls = buildSearchRssUrls("https://share.dmhy.org/topics/rss/rss.xml", [
    "上伊那牡丹",
  ]);

  assert.deepEqual(urls, [
    "https://share.dmhy.org/topics/rss/rss.xml",
    "https://share.dmhy.org/topics/rss/rss.xml?keyword=%E4%B8%8A%E4%BC%8A%E9%82%A3%E7%89%A1%E4%B8%B9",
  ]);
});

test("buildSearchRssUrls keeps unsupported sources unchanged", () => {
  const urls = buildSearchRssUrls("https://example.test/feed.xml", ["测试"]);

  assert.deepEqual(urls, ["https://example.test/feed.xml"]);
});

test("extractEpisodeNumber ignores release dates before real episode tags", () => {
  assert.equal(
    extractEpisodeNumber(
      "★04月新番★[上伊那牡丹，醉姿如百合][07][1080p]",
    ),
    7,
  );
  assert.equal(
    extractEpisodeNumber(
      '[2026.05.27] TVアニメ「上伊那ぼたん」OPテーマ [FLAC 96kHz/24bit]',
    ),
    null,
  );
});

test("extractEpisodeNumber prefers absolute episode when total episode is present", () => {
  assert.equal(
    extractEpisodeNumber(
      "[晚街与灯][Re：从零开始的异世界生活 第四季][07 - 总第73][1080P]",
    ),
    73,
  );
  assert.equal(
    extractEpisodeNumber(
      "[Re：從零開始的異世界生活 第四季][07 - 總第73][1080P]",
    ),
    73,
  );
});
