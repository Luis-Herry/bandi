import assert from "node:assert/strict";
import test from "node:test";
import { getBrowseAddIdentity } from "../src/lib/browse-add";

test("browse add identity prefers Bangumi, then an existing local row, then YUC", () => {
  assert.deepEqual(
    getBrowseAddIdentity({ bangumiId: 42, localAnimeId: 7, yucKey: "yuc-key" }),
    { source: "bangumi", bangumiId: 42, yucKey: "yuc-key" },
  );
  assert.deepEqual(
    getBrowseAddIdentity({ bangumiId: null, localAnimeId: 7, yucKey: "yuc-key" }),
    { source: "local", animeId: 7, yucKey: "yuc-key" },
  );
  assert.deepEqual(
    getBrowseAddIdentity({ bangumiId: null, localAnimeId: null, yucKey: "yuc-key" }),
    { source: "yuc", yucKey: "yuc-key" },
  );
  assert.equal(
    getBrowseAddIdentity({ bangumiId: null, localAnimeId: null, yucKey: null }),
    null,
  );
});
