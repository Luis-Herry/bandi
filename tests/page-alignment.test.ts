import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const globalsSource = readFileSync("src/app/globals.css", "utf8");
const navSource = readFileSync("src/components/features/Nav.tsx", "utf8");
const libraryClientSource = readFileSync(
  "src/app/(main)/library/LibraryClient.tsx",
  "utf8",
);
const homeHeroSource = readFileSync(
  "src/components/features/HomeHero.tsx",
  "utf8",
);
const animeDetailSource = readFileSync(
  "src/app/(main)/anime/[id]/page.tsx",
  "utf8",
);
const cinemaDetailSource = readFileSync(
  "src/app/(main)/anime/[id]/CinemaDetail.tsx",
  "utf8",
);
const libraryPageSource = readFileSync(
  "src/app/(main)/library/page.tsx",
  "utf8",
);
const browseClientSource = readFileSync(
  "src/app/(main)/browse/BrowseClient.tsx",
  "utf8",
);
const browsePageSource = readFileSync(
  "src/app/(main)/browse/page.tsx",
  "utf8",
);
const browseLoadingSource = readFileSync(
  "src/app/(main)/browse/loading.tsx",
  "utf8",
);
const cinemaLibrarySource = readFileSync(
  "src/app/(main)/cinema-library/CinemaLibraryClient.tsx",
  "utf8",
);

const alignedPageFiles = [
  "src/app/(main)/page.tsx",
  "src/app/(main)/loading.tsx",
  "src/app/(main)/library/page.tsx",
  "src/app/(main)/library/local/LocalLibraryClient.tsx",
  "src/app/(main)/browse/BrowseClient.tsx",
  "src/app/(main)/browse/loading.tsx",
  "src/app/(main)/stats/page.tsx",
  "src/app/(main)/admin/downloads/Client.tsx",
  "src/app/(main)/cinema/CinemaClient.tsx",
  "src/app/(main)/cinema-library/CinemaLibraryClient.tsx",
  "src/app/(main)/profile/page.tsx",
  "src/app/(main)/settings/page.tsx",
] as const;

test("main pages keep the content gutter while the space switcher owns the window edge", () => {
  assert.match(globalsSource, /--app-page-max:\s*1440px/);
  assert.match(globalsSource, /--app-page-gutter:\s*var\(--app-page-padding\)/);
  assert.match(globalsSource, /--app-page-gutter:\s*max\(/);
  assert.match(globalsSource, /--app-page-scrollbar-width:\s*0px/);
  assert.match(
    globalsSource,
    /html\[data-desktop-app="true"\]\s*\{[\s\S]*?--app-page-scrollbar-width:\s*10px/,
  );
  assert.match(globalsSource, /::-webkit-scrollbar\s*\{[\s\S]*?width:\s*10px/);
  assert.match(
    globalsSource,
    /\.desktop-page-scroll\s*\{[\s\S]*?scrollbar-gutter:\s*stable/,
  );
  assert.match(globalsSource, /\.app-page-container/);
  assert.match(
    globalsSource,
    /padding-inline-start:\s*var\(--app-page-gutter\)/,
  );
  assert.match(
    globalsSource,
    /padding-inline-end:\s*calc\([\s\S]*?var\(--app-page-gutter\)\s*-\s*var\(--app-page-scrollbar-width\)/,
  );
  assert.match(
    navSource,
    /relative flex h-16 w-full items-center border-b border-transparent px-6/,
  );
  assert.match(
    navSource,
    /relative z-10 flex min-w-0 shrink-0 items-center[\s\S]*<SpaceSwitcher/,
  );
  assert.match(navSource, /left-\[var\(--app-page-gutter\)\]/);
  assert.match(navSource, /right-\[var\(--app-page-gutter\)\]/);
  assert.match(navSource, /navLinks = isCinemaSpace \? CINEMA_LINKS : LINKS/);

  for (const file of alignedPageFiles) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /app-page-container/, file);
  }

  assert.equal(homeHeroSource.match(/app-page-container/g)?.length, 1);
  assert.equal(animeDetailSource.match(/app-page-container/g)?.length, 2);
  assert.equal(cinemaDetailSource.match(/app-page-container/g)?.length, 2);
});

test("catalog page heroes share one height, content rail, and proxied poster art", () => {
  for (const source of [
    libraryPageSource,
    browseClientSource,
    browseLoadingSource,
    cinemaLibrarySource,
  ]) {
    assert.match(source, /className="catalog-page-hero(?: [^"]*)?"/);
    assert.match(source, /catalog-page-hero-content/);
  }

  assert.match(
    globalsSource,
    /\.catalog-page-hero\s*\{[\s\S]*?min-height:\s*13\.75rem/,
  );
  assert.match(
    globalsSource,
    /@media \(min-width: 640px\)[\s\S]*?\.catalog-page-hero\s*\{[\s\S]*?height:\s*15rem/,
  );
  assert.match(
    globalsSource,
    /@media \(min-width: 900px\)[\s\S]*?\.catalog-page-hero-content\s*\{[\s\S]*?align-items:\s*center/,
  );
  assert.match(
    browseClientSource,
    /<AnimeCover[\s\S]*?src=\{url\}[\s\S]*?imageRole="hero"[\s\S]*?className="!absolute inset-0 h-full w-full"/,
  );
  assert.match(browsePageSource, /const fallbackHeroCovers = getLibrary\(user\.id\)/);
  assert.match(browsePageSource, /fallbackHeroCovers=\{fallbackHeroCovers\}/);
  assert.match(
    browseClientSource,
    /seasonalCovers\.length > 0[\s\S]*?: fallbackHeroCovers/,
  );
  assert.match(
    cinemaLibrarySource,
    /items\.filter\(\(item\) => item\.posterUrl\)\.slice\(0, 4\)/,
  );
  assert.match(
    cinemaLibrarySource,
    /<AnimeCover[\s\S]*?src=\{item\.posterUrl\}[\s\S]*?imageRole="hero"[\s\S]*?className="!absolute inset-0 h-full w-full"/,
  );
});

test("anime and cinema catalog search rows share the same responsive layout", () => {
  const sharedRowClass =
    /flex flex-wrap items-center gap-3 border-t border-\[color:var\(--border-subtle\)\] pt-3/;

  assert.match(browseClientSource, sharedRowClass);
  assert.match(cinemaLibrarySource, sharedRowClass);
  assert.match(
    browseClientSource,
    /min-w-\[200px\] flex-1[\s\S]*?h-8 rounded-\[6px\] bg-\[color:var\(--bg-surface-hover\)\]/,
  );
  assert.doesNotMatch(browseClientSource, /md:max-w-\[360px\]/);
  assert.doesNotMatch(browseClientSource, /min-w-\[84px\]/);
});

test("desktop navigation tabs, search, and page content share both grid rails", () => {
  const pageMax = 1440;
  const pagePadding = 48;
  const minimumGutter = 192;
  const scrollbarWidth = 10;

  for (const viewportWidth of [1100, 1180, 1280, 1440, 1920]) {
    const gutter = Math.max(
      minimumGutter,
      (viewportWidth - pageMax) * 0.5 + pagePadding,
    );
    const navTabsLeft = gutter;
    const pageContentLeft = gutter;
    const searchRight = viewportWidth - gutter;
    const scrollViewportWidth = viewportWidth - scrollbarWidth;
    const pageContentRight =
      scrollViewportWidth - (gutter - scrollbarWidth);

    assert.equal(navTabsLeft, pageContentLeft, `${viewportWidth}px left rail`);
    assert.equal(searchRight, pageContentRight, `${viewportWidth}px right rail`);
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
