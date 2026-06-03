import assert from "node:assert/strict";
import { test } from "node:test";
import {
  containsAnimeTitleAlias,
  containsEpisodeRelease,
  isSeasonPackRelease,
  stripTrailingArcAfterSeason,
} from "../src/lib/source-match";

test("containsEpisodeRelease accepts local season numbers for absolute episode rows", () => {
  const episodeNumbers = [67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77];

  assert.equal(
    containsEpisodeRelease(
      "[ANi] Re： 從零開始的異世界生活 第四季 - 08 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4]",
      74,
      episodeNumbers,
    ),
    true,
  );
  assert.equal(
    containsEpisodeRelease(
      "[黒ネズミたち] Re： 從零開始的異世界生活 第四季 / Re:Zero 4th Season - 74 (Baha 1920x1080 AVC AAC MP4)",
      74,
      episodeNumbers,
    ),
    true,
  );
});

test("containsEpisodeRelease accepts Season marker before a single episode number", () => {
  const episodeNumbers = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];

  assert.equal(
    containsEpisodeRelease(
      "[ANi] Tsue to Tsurugi no Wistoria / 杖與劍的魔劍譚 Season 2 - 20 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4]",
      20,
      episodeNumbers,
    ),
    true,
  );
  assert.equal(
    containsEpisodeRelease(
      "[黒ネズミたち] 杖与剑的魔剑谭 第二季 / Tsue to Tsurugi no Wistoria Season 2 - 20 (B-Global 1920x1080 HEVC AAC MKV)",
      20,
      episodeNumbers,
    ),
    true,
  );
});

test("containsEpisodeRelease rejects volume-only BD releases", () => {
  const episodeNumbers = [67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77];

  assert.equal(
    containsEpisodeRelease(
      "[BlurayDesuYo] Re Zero kara Hajimeru Isekai Seikatsu - Re：从零开始的异世界生活 - Vol. 8v2 (BD 1920x1080 10bit FLAC)[英语内封字幕]",
      74,
      episodeNumbers,
    ),
    false,
  );
  assert.equal(
    containsEpisodeRelease(
      "[ANi] Re：從零開始的異世界生活 第四季 - 08 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4]",
      74,
      episodeNumbers,
    ),
    true,
  );
});

test("containsEpisodeRelease rejects multi-episode packs in single episode search", () => {
  const episodeNumbers = [67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77];

  assert.equal(
    containsEpisodeRelease(
      "[动漫国&KNA&轻之国度字幕组] ★07月新番[Re:从零开始的异世界生活][26-38+SP26-38(前半全集)][1080P][简体][MP4]",
      73,
      episodeNumbers,
    ),
    false,
  );
  assert.equal(
    containsEpisodeRelease(
      "[动漫国&KNA&轻之国度字幕组] ★07月新番[Re:從零開始的異世界生活][38+SP38][1080P][繁體][MP4](前半部分完)",
      73,
      episodeNumbers,
    ),
    false,
  );
  assert.equal(
    containsEpisodeRelease(
      "【动漫国&KNA&轻之国度字幕组】★07月新番[Re:从零开始的异世界生活][SP26-30][1080P][简体][MP4]",
      73,
      episodeNumbers,
    ),
    false,
  );
});

test("stripTrailingArcAfterSeason keeps the season title before arc subtitles", () => {
  assert.equal(
    stripTrailingArcAfterSeason("Re：从零开始的异世界生活 第四季 丧失篇"),
    "Re：从零开始的异世界生活 第四季",
  );
  assert.equal(
    stripTrailingArcAfterSeason("Re:ゼロから始める異世界生活 4th season 喪失編"),
    "Re:ゼロから始める異世界生活 4th season",
  );
});

test("containsAnimeTitleAlias ignores broad short aliases when season aliases exist", () => {
  const aliases = [
    "Re",
    "Re：從零開始的異世界生活 第四季",
    "Re:ゼロから始める異世界生活 4th season",
  ];

  assert.equal(
    containsAnimeTitleAlias(
      "[ANi] Re：從零開始的異世界生活 第四季 - 08 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4]",
      aliases,
    ),
    true,
  );
  assert.equal(
    containsAnimeTitleAlias(
      "[ANi] RentaGirlfriend S05 / 出租女友 第五季 - 08 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4]",
      aliases,
    ),
    false,
  );
});

test("containsAnimeTitleAlias prefers season aliases over broad base titles", () => {
  const aliases = [
    "Re：從零開始的異世界生活",
    "Re：從零開始的異世界生活 第四季",
    "Re:ゼロから始める異世界生活 4th season",
  ];

  assert.equal(
    containsAnimeTitleAlias(
      "[ANi] Re：從零開始的異世界生活 第四季 - 08 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4]",
      aliases,
    ),
    true,
  );
  assert.equal(
    containsAnimeTitleAlias(
      "[ANi] Re：從零開始的異世界生活 第三季 - 08 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4]",
      aliases,
    ),
    false,
  );
});

test("containsAnimeTitleAlias accepts base alias when the release season matches", () => {
  const aliases = [
    "杖与剑的魔剑谭",
    "杖与剑的魔剑谭 第二季",
    "Tsue to Tsurugi no Wistoria",
    "Tsue to Tsurugi no Wistoria Season 2",
  ];

  assert.equal(
    containsAnimeTitleAlias(
      "[ANi] Tsue to Tsurugi no Wistoria / 杖與劍的魔劍譚 Season 2 - 20 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4]",
      aliases,
    ),
    true,
  );
  assert.equal(
    containsAnimeTitleAlias(
      "[ANi] Tsue to Tsurugi no Wistoria / 杖與劍的魔劍譚 Season 3 - 20 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4]",
      aliases,
    ),
    false,
  );
});

test("containsAnimeTitleAlias accepts translated season markers for the same base title", () => {
  const aliases = [
    "杖与剑的魔剑谭",
    "杖与剑的魔剑谭 第二季",
    "杖與劍的魔劍譚",
    "杖與劍的魔劍譚 第二季",
  ];

  assert.equal(
    containsAnimeTitleAlias(
      "[ANi] Tsue to Tsurugi no Wistoria / 杖與劍的魔劍譚 Season 2 - 20 [1080P][Baha][WEB-DL][AAC AVC][CHT][MP4]",
      aliases,
    ),
    true,
  );
});

test("isSeasonPackRelease accepts episode ranges that cover the season", () => {
  assert.equal(
    isSeasonPackRelease(
      "[Prejudice-Studio] 少女乐队的呐喊 GIRLS BAND CRY [01-13][Bilibili WEB-DL 1080P AVC 8bit AAC MP4][简体内嵌]",
      13,
    ),
    true,
  );
});

test("isSeasonPackRelease accepts complete season labels", () => {
  assert.equal(
    isSeasonPackRelease("少女乐队的呐喊 TV全集 1080p WEB-DL MP4", 13),
    true,
  );
  assert.equal(
    isSeasonPackRelease("GIRLS BAND CRY 季度全集 1080p", 13),
    true,
  );
});

test("isSeasonPackRelease rejects music releases and single episodes", () => {
  assert.equal(
    isSeasonPackRelease(
      "[JMAX] TV 动画「Girls Band Cry」OP 主題曲 [FLAC 96kHz/24bit]",
      13,
    ),
    false,
  );
  assert.equal(
    isSeasonPackRelease("少女乐队的呐喊 [07][1080p][简体内嵌]", 13),
    false,
  );
});
