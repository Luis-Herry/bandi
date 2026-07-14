import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const homeSource = readFileSync("src/app/(main)/page.tsx", "utf8");
const profileSource = readFileSync("src/app/(main)/profile/page.tsx", "utf8");
const librarySource = readFileSync(
  "src/app/(main)/library/LibraryClient.tsx",
  "utf8",
);
const heroSource = readFileSync(
  "src/components/features/HomeHero.tsx",
  "utf8",
);
const cardSource = readFileSync(
  "src/components/features/AnimeCard.tsx",
  "utf8",
);
const detailSource = readFileSync(
  "src/app/(main)/anime/[id]/page.tsx",
  "utf8",
);
const searchSource = readFileSync(
  "src/components/features/SearchCommand.tsx",
  "utf8",
);

test("home hero renders the saved star rating on the shared 10-point scale", () => {
  assert.match(heroSource, /import \{ formatRatingScore \} from "@\/lib\/rating"/);
  assert.match(heroSource, /formatRatingScore\(slide\.rating\)/);
  assert.doesNotMatch(heroSource, /slide\.rating \?\? 9\.0/);
});

test("continue section distinguishes playable items from all watching titles", () => {
  assert.match(homeSource, /title="可继续播放"/);
  assert.match(homeSource, /watchingCount > 0/);
  assert.match(homeSource, /暂无可播放内容，\$\{watchingCount\} 部在看可去追番列表找资源/);
  assert.doesNotMatch(homeSource, /暂无可直接播放的内容/);
  assert.doesNotMatch(homeSource, /暂无在看的番剧/);

  assert.match(profileSource, /title="可继续播放"/);
  assert.match(profileSource, /libraryStats\.watching > 0/);
  assert.match(profileSource, /暂无可播放内容，\$\{libraryStats\.watching\} 部在看可去追番列表找资源/);
  assert.doesNotMatch(profileSource, /暂无可直接播放的内容/);
  assert.doesNotMatch(profileSource, /暂无正在观看的番剧/);
});

test("home follow-up columns keep empty panels aligned with populated panels", () => {
  assert.equal(
    homeSource.match(/className="flex h-full flex-col"/g)?.length,
    2,
  );
  assert.equal(
    homeSource.match(/className="flex-1 p-2 space-y-1"/g)?.length,
    2,
  );
  assert.equal(
    homeSource.match(
      /className="flex flex-1 items-center justify-center p-6 text-center"/g,
    )?.length,
    2,
  );
});

test("unwatched count chip is its own keyboard-focusable episode link", () => {
  assert.match(cardSource, /const unwatchedCount =/);
  assert.match(cardSource, /href=\{episodesHref\}/);
  assert.match(cardSource, /aria-label=\{`查看 \$\{title\} 的 \$\{unwatchedCount\} 集待看`\}/);
  assert.match(cardSource, /待看 \{unwatchedCount\}/);
  assert.doesNotMatch(cardSource, /\+\{unwatchedCount\}/);
  assert.match(cardSource, /pointer-events-auto relative z-\[20\]/);
  assert.match(detailSource, /id="episodes"/);
});

test("Windows shortcut copy matches the Ctrl+K handler", () => {
  assert.match(searchSource, /e\.metaKey \|\| e\.ctrlKey/);
  assert.match(homeSource, /Ctrl K/);
  assert.match(librarySource, /Ctrl K/);
  assert.doesNotMatch(homeSource, /⌘K/);
  assert.doesNotMatch(librarySource, /⌘K/);
});

test("slow external anime data streams behind local Suspense fallbacks", () => {
  assert.match(homeSource, /<Suspense fallback=\{<SeasonalBrowseSkeleton \/>\}>/);
  assert.match(homeSource, /async function SeasonalBrowseSection/);
  assert.match(homeSource, /本季新番暂时加载失败/);
  assert.doesNotMatch(homeSource, /let seasonalAll: SeasonalBrowseItem\[\] = \[\]/);

  assert.match(detailSource, /<Suspense fallback=\{<RelatedResourcesSkeleton \/>\}>/);
  assert.match(detailSource, /async function AsyncRelatedResourcesPanel/);
  assert.match(detailSource, /getSubjectRelations failed/);
  assert.doesNotMatch(detailSource, /const relatedResources = anime\.bangumiId/);
});
