import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildWatchEventDrafts } from "../src/lib/watch-events";

const watchedAt = new Date("2026-05-26T12:00:00+08:00");
const base = {
  userId: "user-1",
  animeId: 10,
  watchedAt,
  episodeIdsByNumber: new Map([
    [1, 101],
    [4, 104],
    [5, 105],
  ]),
};

describe("buildWatchEventDrafts", () => {
  test("old=3 to new=5 creates watch events for (old,new]", () => {
    const events = buildWatchEventDrafts({
      ...base,
      oldEpisode: 3,
      newEpisode: 5,
    });

    assert.deepEqual(
      events.map((event) => ({
        episode: event.episode,
        episodeId: event.episodeId,
        action: event.action,
        minutes: event.minutes,
      })),
      [
        { episode: 4, episodeId: 104, action: "watch", minutes: 24 },
        { episode: 5, episodeId: 105, action: "watch", minutes: 24 },
      ],
    );
  });

  test("old=5 to new=3 creates unwatch events for (new,old]", () => {
    const events = buildWatchEventDrafts({
      ...base,
      oldEpisode: 5,
      newEpisode: 3,
    });

    assert.deepEqual(
      events.map((event) => ({
        episode: event.episode,
        episodeId: event.episodeId,
        action: event.action,
      })),
      [
        { episode: 4, episodeId: 104, action: "unwatch" },
        { episode: 5, episodeId: 105, action: "unwatch" },
      ],
    );
  });

  test("old=0 to new=1 creates a watch event for episode 1", () => {
    const events = buildWatchEventDrafts({
      ...base,
      oldEpisode: 0,
      newEpisode: 1,
    });

    assert.equal(events.length, 1);
    assert.equal(events[0]?.episode, 1);
    assert.equal(events[0]?.episodeId, 101);
    assert.equal(events[0]?.action, "watch");
  });

  test("absolute episode ranges only include known episode numbers", () => {
    const events = buildWatchEventDrafts({
      ...base,
      oldEpisode: 0,
      newEpisode: 13,
      episodeIdsByNumber: new Map([
        [13, 113],
        [14, 114],
      ]),
      knownEpisodeNumbers: [13, 14],
    });

    assert.deepEqual(
      events.map((event) => ({
        episode: event.episode,
        episodeId: event.episodeId,
        action: event.action,
      })),
      [{ episode: 13, episodeId: 113, action: "watch" }],
    );
  });

  test("same progress creates no events", () => {
    const events = buildWatchEventDrafts({
      ...base,
      oldEpisode: 5,
      newEpisode: 5,
    });

    assert.deepEqual(events, []);
  });
});
