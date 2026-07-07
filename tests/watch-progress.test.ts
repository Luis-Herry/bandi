import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getCompletionEpisodeNumber,
  resolveProgressWatchStatus,
} from "../src/lib/watch-progress";

test("completion uses the highest stored absolute episode number", () => {
  const completionEpisode = getCompletionEpisodeNumber({
    totalEpisodes: 11,
    episodeNumbers: [67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77],
  });

  assert.equal(completionEpisode, 77);
  assert.equal(
    resolveProgressWatchStatus({
      currentStatus: "watching",
      nextEpisode: 74,
      completionEpisode,
    }),
    "watching",
  );
  assert.equal(
    resolveProgressWatchStatus({
      currentStatus: "watching",
      nextEpisode: 77,
      completionEpisode,
    }),
    "completed",
  );
});

test("progress edits below the season end do not keep completed implicitly", () => {
  assert.equal(
    resolveProgressWatchStatus({
      currentStatus: "completed",
      nextEpisode: 74,
      completionEpisode: 77,
    }),
    "watching",
  );
});

test("progress edits move planning items into watching", () => {
  assert.equal(
    resolveProgressWatchStatus({
      currentStatus: "planning",
      nextEpisode: 1,
      completionEpisode: 12,
    }),
    "watching",
  );
  assert.equal(
    resolveProgressWatchStatus({
      currentStatus: "planning",
      nextEpisode: 0,
      completionEpisode: 12,
    }),
    "planning",
  );
});

test("explicit watch status wins over progress inference", () => {
  assert.equal(
    resolveProgressWatchStatus({
      currentStatus: "watching",
      explicitStatus: "completed",
      nextEpisode: 74,
      completionEpisode: 77,
    }),
    "completed",
  );
  assert.equal(
    resolveProgressWatchStatus({
      currentStatus: "dropped",
      nextEpisode: 77,
      completionEpisode: 77,
    }),
    "dropped",
  );
});

test("completion falls back to total episodes when episode rows are unavailable", () => {
  assert.equal(
    getCompletionEpisodeNumber({
      totalEpisodes: 12,
      episodeNumbers: [],
    }),
    12,
  );
});
