import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getCanonicalEpisodeRange,
  resolveUniqueEpisodeRangeCandidate,
} from "../src/lib/anime-season-range";

test("canonical range ignores a synthetic outlier beyond the declared first season", () => {
  assert.deepEqual(
    getCanonicalEpisodeRange({
      value: "s1",
      totalEpisodes: 12,
      episodeNumbers: [...Array.from({ length: 12 }, (_, index) => index + 1), 26],
    }),
    { first: 1, last: 12 },
  );
});

test("absolute EP25 and EP26 resolve uniquely to the third season", () => {
  const resolved = resolveUniqueEpisodeRangeCandidate(
    [
      { value: "s1", totalEpisodes: 12, episodeNumbers: Array.from({ length: 12 }, (_, i) => i + 1) },
      { value: "s2", totalEpisodes: 12, episodeNumbers: Array.from({ length: 12 }, (_, i) => i + 13) },
      { value: "s3", totalEpisodes: 12, episodeNumbers: Array.from({ length: 12 }, (_, i) => i + 25) },
    ],
    [25, 26],
  );
  assert.equal(resolved, "s3");
});
