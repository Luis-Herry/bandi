import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAnimeGardenMagnet,
  formatAnimeGardenSize,
  searchAnimeGardenResources,
} from "../src/lib/animegarden";

test("buildAnimeGardenMagnet appends tracker query string", () => {
  assert.equal(
    buildAnimeGardenMagnet({
      magnet: "magnet:?xt=urn:btih:ABC",
      tracker: "&tr=https%3A%2F%2Ftracker.example%2Fannounce",
    }),
    "magnet:?xt=urn:btih:ABC&tr=https%3A%2F%2Ftracker.example%2Fannounce",
  );
});

test("formatAnimeGardenSize converts KiB to bytes for existing formatter", () => {
  assert.equal(formatAnimeGardenSize(1024), String(1024 * 1024));
  assert.equal(formatAnimeGardenSize(null), null);
});

test("searchAnimeGardenResources keeps fallback aliases beyond four terms", async () => {
  const originalFetch = globalThis.fetch;
  const searched: string[] = [];

  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { search?: string };
    if (body.search) searched.push(body.search);
    return Response.json({ resources: [] });
  }) as typeof fetch;

  try {
    await searchAnimeGardenResources({
      searchTerms: [
        "高大的女孩子",
        "高大的女孩子 2026",
        "大きい女の子は好きですか",
        "Ooki Onnanoko wa Suki Desuka",
        "My Life as Inukai-san's Dog",
      ],
      pageSize: 1,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(searched.includes("My Life as Inukai-san's Dog"));
});
