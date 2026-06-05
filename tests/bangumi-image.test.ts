import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resizeBangumiImageUrl,
  selectBangumiImageByRole,
} from "../src/lib/bangumi-image";

test("selectBangumiImageByRole prefers lightweight images for card surfaces", () => {
  const images = {
    large: "https://lain.bgm.tv/pic/cover/l/23/3d/demo.jpg",
    medium: "https://lain.bgm.tv/r/800/pic/cover/l/23/3d/demo.jpg",
    common: "https://lain.bgm.tv/r/400/pic/cover/l/23/3d/demo.jpg",
    grid: "https://lain.bgm.tv/r/100/pic/cover/l/23/3d/demo.jpg",
  };

  assert.equal(selectBangumiImageByRole(images, "card"), images.common);
  assert.equal(selectBangumiImageByRole(images, "hero"), images.medium);
  assert.equal(selectBangumiImageByRole(images, "thumb"), images.grid);
  assert.equal(selectBangumiImageByRole(images, "original"), images.large);
});

test("resizeBangumiImageUrl maps historical large Bangumi URLs to display-sized variants", () => {
  assert.equal(
    resizeBangumiImageUrl(
      "https://lain.bgm.tv/pic/cover/l/23/3d/602059_4j4UW.jpg",
      "card",
    ),
    "https://lain.bgm.tv/r/400/pic/cover/l/23/3d/602059_4j4UW.jpg",
  );
  assert.equal(
    resizeBangumiImageUrl(
      "https://lain.bgm.tv/r/800/pic/cover/l/23/3d/602059_4j4UW.jpg",
      "thumb",
    ),
    "https://lain.bgm.tv/r/100/pic/cover/l/23/3d/602059_4j4UW.jpg",
  );
  assert.equal(
    resizeBangumiImageUrl("https://example.test/cover.jpg", "card"),
    "https://example.test/cover.jpg",
  );
  assert.equal(
    resizeBangumiImageUrl(
      "http://lain.bgm.tv/pic/cover/l/23/3d/602059_4j4UW.jpg",
      "card",
    ),
    "https://lain.bgm.tv/r/400/pic/cover/l/23/3d/602059_4j4UW.jpg",
  );
});
