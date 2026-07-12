import assert from "node:assert/strict";
import { test } from "node:test";

test("selectTitleAliasesFromAniList exposes romaji and English fallback names", async () => {
  const mod: Partial<typeof import("../src/lib/anime-title-aliases")> =
    await import("../src/lib/anime-title-aliases").catch(() => ({}));

  assert.equal(typeof mod.selectTitleAliasesFromAniList, "function");
  if (typeof mod.selectTitleAliasesFromAniList !== "function") return;

  const aliases = mod.selectTitleAliasesFromAniList({
    title: {
      romaji: "Ooki Onnanoko wa Suki Desuka?",
      native: "大きい女の子は好きですか?",
      english: "My Life as Inukai-san's Dog",
    },
  });

  assert.deepEqual(aliases.slice(0, 2), [
    "Ooki Onnanoko wa Suki Desuka?",
    "My Life as Inukai-san's Dog",
  ]);
});

test("selectTitleAliasesFromAniList adds ASCII punctuation variants", async () => {
  const mod: Partial<typeof import("../src/lib/anime-title-aliases")> =
    await import("../src/lib/anime-title-aliases").catch(() => ({}));

  assert.equal(typeof mod.selectTitleAliasesFromAniList, "function");
  if (typeof mod.selectTitleAliasesFromAniList !== "function") return;

  const aliases = mod.selectTitleAliasesFromAniList({
    title: {
      romaji: "Inu ni Nattara Suki na Hito ni Hirowareta.",
      native: "犬になったら好きな人に拾われた。",
      english: "My Life as Inukai-san’s Dog",
    },
  });

  assert.ok(aliases.includes("My Life as Inukai-san's Dog"));
});

test("selectTitleAliasesFromBangumi reads infobox title aliases", async () => {
  const mod: Partial<typeof import("../src/lib/anime-title-aliases")> =
    await import("../src/lib/anime-title-aliases").catch(() => ({}));

  assert.equal(typeof mod.selectTitleAliasesFromBangumi, "function");
  if (typeof mod.selectTitleAliasesFromBangumi !== "function") return;

  const aliases = mod.selectTitleAliasesFromBangumi({
    name: "上伊那ぼたん、酔へる姿は百合の花",
    name_cn: "上伊那牡丹，酒醉身姿似百合花般",
    infobox: [
      { key: "官方网站", value: "https://kamiina-botan.com/" },
      {
        key: "别名",
        value: [
          { v: "Kamiina Botan, the Drunken Appearance Is a Lily Flower" },
          { v: "Kamiina Botan, Yoeru Sugata wa Yuri no Hana" },
        ],
      },
    ],
  });

  assert.ok(aliases.includes("Kamiina Botan, Yoeru Sugata wa Yuri no Hana"));
  assert.ok(!aliases.includes("https://kamiina-botan.com/"));
});
