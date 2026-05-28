import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeRssTitleAliases,
  normalizeRssTitleAlias,
} from "../src/lib/rss-title-aliases";

test("normalizeRssTitleAlias trims repeated whitespace", () => {
  assert.equal(
    normalizeRssTitleAlias("  Re:   从零开始的异世界生活 第四季  "),
    "Re: 从零开始的异世界生活 第四季",
  );
  assert.equal(normalizeRssTitleAlias("x"), null);
});

test("mergeRssTitleAliases keeps saved aliases first and removes duplicates", () => {
  assert.deepEqual(
    mergeRssTitleAliases(
      ["Re: 从零开始的异世界生活 第四季"],
      ["re: 从零开始的异世界生活 第四季", "Re: 从零开始的异世界生活 第四季 丧失篇"],
    ),
    [
      "Re: 从零开始的异世界生活 第四季",
      "Re: 从零开始的异世界生活 第四季 丧失篇",
    ],
  );
});
