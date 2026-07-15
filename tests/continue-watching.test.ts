import assert from "node:assert/strict";
import { test } from "node:test";
import {
  selectContinueEpisode,
  selectHeroEpisodeAvailability,
} from "../src/lib/continue-watching";

const now = new Date("2026-07-14T12:00:00.000Z");
const airedAt = new Date("2026-07-14T10:00:00.000Z");
const futureAiredAt = new Date("2026-07-21T10:00:00.000Z");

const downloadedEpisodes = [1, 2, 3].map((number) => ({
  number,
  isDownloaded: true,
  airedAt,
}));

test("continue watching resumes an incomplete current episode first", () => {
  const selection = selectContinueEpisode({
    watchedThroughEpisode: 2,
    episodes: downloadedEpisodes,
    now,
    playbackProgress: {
      episodeNumber: 2,
      positionSeconds: 420,
      durationSeconds: 1_440,
      completed: false,
    },
  });

  assert.deepEqual(selection, {
    episodeNumber: 2,
    source: "incomplete-playback",
  });
});

test("continue watching advances after the current episode is completed", () => {
  const selection = selectContinueEpisode({
    watchedThroughEpisode: 3,
    episodes: [
      { number: 3, isDownloaded: true, airedAt },
      { number: 4, isDownloaded: true, airedAt },
    ],
    now,
    playbackProgress: {
      episodeNumber: 3,
      positionSeconds: 1_440,
      durationSeconds: 1_440,
      completed: true,
    },
  });

  assert.deepEqual(selection, {
    episodeNumber: 4,
    source: "next-download",
  });
});

test("continue watching hides after completion when the next episode is unavailable", () => {
  const selection = selectContinueEpisode({
    watchedThroughEpisode: 3,
    episodes: [{ number: 3, isDownloaded: true, airedAt }],
    now,
    playbackProgress: {
      episodeNumber: 3,
      positionSeconds: 1_440,
      durationSeconds: 1_440,
      completed: true,
    },
  });

  assert.deepEqual(selection, { episodeNumber: null, source: null });
});

test("continue watching falls forward to the next downloaded episode", () => {
  const selection = selectContinueEpisode({
    watchedThroughEpisode: 2,
    episodes: [
      { number: 2, isDownloaded: false, airedAt },
      { number: 3, isDownloaded: true, airedAt },
    ],
    now,
  });

  assert.deepEqual(selection, {
    episodeNumber: 3,
    source: "next-download",
  });
});

test("continue watching ignores stale or missing local playback entries", () => {
  const selection = selectContinueEpisode({
    watchedThroughEpisode: 2,
    episodes: [
      { number: 1, isDownloaded: true, airedAt },
      { number: 2, isDownloaded: true, airedAt },
      { number: 3, isDownloaded: true, airedAt },
    ],
    now,
    playbackProgress: {
      episodeNumber: 1,
      positionSeconds: 420,
      durationSeconds: 1_440,
      completed: false,
    },
  });

  assert.deepEqual(selection, {
    episodeNumber: 3,
    source: "next-download",
  });
});

test("continue watching stays hidden when no local episode is available", () => {
  const selection = selectContinueEpisode({
    watchedThroughEpisode: 2,
    episodes: [{ number: 2, isDownloaded: false, airedAt }],
    now,
  });

  assert.deepEqual(selection, { episodeNumber: null, source: null });
});

test("continue watching does not expose a future downloaded episode", () => {
  const selection = selectContinueEpisode({
    watchedThroughEpisode: 3,
    episodes: [
      { number: 3, isDownloaded: true, airedAt },
      { number: 4, isDownloaded: true, airedAt: futureAiredAt },
    ],
    now,
  });

  assert.deepEqual(selection, { episodeNumber: null, source: null });
});

test("hero offers RSS search for the first aired episode after progress", () => {
  const availability = selectHeroEpisodeAvailability({
    watchedThroughEpisode: 3,
    episodes: [
      { number: 4, isDownloaded: false, airedAt },
      { number: 5, isDownloaded: false, airedAt: futureAiredAt },
    ],
    now,
  });

  assert.deepEqual(availability, {
    sourceEpisodeNumber: 4,
    nextAiringEpisodeNumber: null,
    nextAiringAt: null,
  });
});

test("hero exposes the next airing time when no later episode has aired", () => {
  const availability = selectHeroEpisodeAvailability({
    watchedThroughEpisode: 3,
    episodes: [
      { number: 4, isDownloaded: false, airedAt: futureAiredAt },
      { number: 5, isDownloaded: false, airedAt: null },
    ],
    now,
  });

  assert.deepEqual(availability, {
    sourceEpisodeNumber: null,
    nextAiringEpisodeNumber: 4,
    nextAiringAt: futureAiredAt,
  });
});
