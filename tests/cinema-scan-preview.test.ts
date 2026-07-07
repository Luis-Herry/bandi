import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ScannedTitle } from "../src/lib/cinema-scan";

test("previewScannedTitles summarizes scanned media without import fields", async () => {
  const { previewScannedTitles } = await import("../src/lib/cinema-import");
  const titles: ScannedTitle[] = [
    {
      kind: "movie",
      title: "Inception",
      year: 2010,
      season: null,
      files: [
        {
          absPath: "D:/Movies/Inception (2010).mkv",
          fileName: "Inception (2010).mkv",
          kind: "movie",
          title: "Inception",
          year: 2010,
          season: 0,
          episode: 1,
        },
      ],
    },
    {
      kind: "tv",
      title: "Breaking Bad",
      year: null,
      season: 1,
      files: [
        {
          absPath: "D:/TV/Breaking Bad/S01E01.mkv",
          fileName: "S01E01.mkv",
          kind: "tv",
          title: "Breaking Bad",
          year: null,
          season: 1,
          episode: 1,
        },
        {
          absPath: "D:/TV/Breaking Bad/S01E02.mkv",
          fileName: "S01E02.mkv",
          kind: "tv",
          title: "Breaking Bad",
          year: null,
          season: 1,
          episode: 2,
        },
      ],
    },
  ];

  const preview = previewScannedTitles(titles);

  assert.deepEqual(preview, {
    titlesScanned: 2,
    filesFound: 3,
    movies: 1,
    dramas: 1,
    skippedFansubFiles: 0,
    samples: [
      {
        title: "Inception",
        kind: "movie",
        year: 2010,
        season: null,
        files: 1,
      },
      {
        title: "Breaking Bad",
        kind: "drama",
        year: null,
        season: 1,
        files: 2,
      },
    ],
  });
});

test("cinema scan flow keeps preview separate from confirmed import", () => {
  const routeSource = readFileSync("src/app/api/cinema/scan/route.ts", "utf8");
  const buttonSource = readFileSync(
    "src/components/features/CinemaScanButton.tsx",
    "utf8",
  );

  assert.match(routeSource, /preview\?: unknown/);
  assert.match(routeSource, /previewScannedTitles/);
  assert.match(routeSource, /raw\.preview === true/);
  assert.match(buttonSource, /preview: true/);
  assert.match(buttonSource, /confirmImport/);
  assert.match(buttonSource, /确认导入/);
  assert.match(buttonSource, /absolute right-0 top-\[calc\(100%\+8px\)\]/);
  assert.match(buttonSource, /background: "var\(--bg-elevated\)"/);
  assert.match(buttonSource, /backdropFilter: "none"/);
});
