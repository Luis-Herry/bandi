import assert from "node:assert/strict";
import test from "node:test";
import { getBrowseAddIdentity } from "../src/lib/browse-add";

test("browse add identity prefers local, then Bangumi, then YUC", () => {
  assert.deepEqual(
    getBrowseAddIdentity({ bangumiId: 42, localAnimeId: 7, yucKey: "yuc-key" }),
    { source: "local", animeId: 7, yucKey: "yuc-key", bangumiId: 42 },
  );
  assert.deepEqual(
    getBrowseAddIdentity({ bangumiId: null, localAnimeId: 7, yucKey: "yuc-key" }),
    { source: "local", animeId: 7, yucKey: "yuc-key" },
  );
  assert.deepEqual(
    getBrowseAddIdentity({ bangumiId: 42, localAnimeId: null, yucKey: "yuc-key" }),
    { source: "bangumi", bangumiId: 42, yucKey: "yuc-key" },
  );
  assert.deepEqual(
    getBrowseAddIdentity({ bangumiId: null, localAnimeId: null, yucKey: "yuc-key" }),
    { source: "yuc", yucKey: "yuc-key" },
  );
  assert.deepEqual(
    getBrowseAddIdentity({ bangumiId: 42, localAnimeId: null, yucKey: null }),
    { source: "bangumi", bangumiId: 42 },
  );
  assert.equal(
    getBrowseAddIdentity({ bangumiId: null, localAnimeId: null, yucKey: null }),
    null,
  );
});
