import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const routeSource = readFileSync("src/app/api/library/[id]/route.ts", "utf8");

test("cinema progress API rejects a positive episode when episode data is unavailable", async () => {
  const { validateEpisodeProgressBounds } = await import(
    "../src/lib/episode-progress-bounds"
  );

  assert.deepEqual(
    validateEpisodeProgressBounds({
      mediaType: "drama",
      currentEpisode: 1,
      completionEpisode: null,
    }),
    { error: "episode data unavailable", status: 422 },
  );
});

test("progress API rejects an episode beyond the known completion boundary", async () => {
  const { validateEpisodeProgressBounds } = await import(
    "../src/lib/episode-progress-bounds"
  );

  assert.deepEqual(
    validateEpisodeProgressBounds({
      mediaType: "drama",
      currentEpisode: 13,
      completionEpisode: 12,
    }),
    { error: "episode progress out of range", status: 422 },
  );
  assert.equal(
    validateEpisodeProgressBounds({
      mediaType: "drama",
      currentEpisode: 12,
      completionEpisode: 12,
    }),
    null,
  );
});

test("anime progress keeps its existing unknown-upper-bound behavior", async () => {
  const { validateEpisodeProgressBounds } = await import(
    "../src/lib/episode-progress-bounds"
  );

  assert.equal(
    validateEpisodeProgressBounds({
      mediaType: "anime",
      currentEpisode: 3,
      completionEpisode: null,
    }),
    null,
  );
});

test("library PATCH applies the bounds check before creating or updating progress", () => {
  const validationIndex = routeSource.indexOf("validateEpisodeProgressBounds({");
  const upsertIndex = routeSource.indexOf("let existing = db");

  assert.notEqual(validationIndex, -1);
  assert.notEqual(upsertIndex, -1);
  assert.ok(validationIndex < upsertIndex);
  assert.match(routeSource, /status: boundsError\.status/);
});
