import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const globalsSource = readFileSync("src/app/globals.css", "utf8");
const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");
const libraryClientSource = readFileSync(
  "src/app/(main)/library/LibraryClient.tsx",
  "utf8",
);

const alignedPageFiles = [
  "src/app/(main)/page.tsx",
  "src/app/(main)/loading.tsx",
  "src/app/(main)/library/page.tsx",
  "src/app/(main)/browse/BrowseClient.tsx",
  "src/app/(main)/browse/loading.tsx",
  "src/app/(main)/stats/page.tsx",
  "src/app/(main)/admin/downloads/Client.tsx",
  "src/app/(main)/profile/page.tsx",
  "src/app/(main)/settings/page.tsx",
] as const;

test("main tab pages share the nav-aligned content container", () => {
  assert.match(globalsSource, /--app-page-max:\s*1440px/);
  assert.match(globalsSource, /--app-page-gutter:\s*var\(--app-page-padding\)/);
  assert.match(globalsSource, /--app-page-gutter:\s*max\(/);
  assert.match(globalsSource, /\.app-page-container/);
  assert.match(globalsSource, /padding-inline:\s*var\(--app-page-gutter\)/);
  assert.match(navSource, /left-\[var\(--app-page-gutter\)\]/);
  assert.match(navSource, /right-\[var\(--app-page-gutter\)\]/);

  for (const file of alignedPageFiles) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /app-page-container/, file);
  }
});

test("horizontal tabs and rails use the shared no-scrollbar utility", () => {
  assert.match(globalsSource, /\.no-scrollbar\s*\{[\s\S]*scrollbar-width:\s*none/);
  assert.match(
    globalsSource,
    /\.no-scrollbar::-webkit-scrollbar\s*\{[\s\S]*display:\s*none/,
  );

  const horizontalScrollFiles = [
    "src/app/(main)/browse/BrowseClient.tsx",
    "src/app/(main)/browse/loading.tsx",
    "src/app/(main)/settings/page.tsx",
    "src/app/(main)/admin/downloads/Client.tsx",
    "src/app/(main)/loading.tsx",
    "src/components/features/AnimeCreditsTabs.tsx",
    "src/components/features/SeasonalBrowseWeekday.tsx",
    "src/components/features/SeasonalCalendar.tsx",
  ] as const;

  for (const file of horizontalScrollFiles) {
    const source = readFileSync(file, "utf8");
    assert.match(
      source,
      /className="[^"]*no-scrollbar[^"]*overflow-x-auto/,
      file,
    );
  }

  assert.match(
    libraryClientSource,
    /className="[^"]*flex-wrap[^"]*overflow-visible/,
  );
  assert.doesNotMatch(
    libraryClientSource,
    /className="[^"]*no-scrollbar[^"]*overflow-x-auto[^"]*STATUS_TABS/,
  );
});
