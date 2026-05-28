import assert from "node:assert/strict";
import { test } from "node:test";

import {
  selectBangumiImage,
  toCharacterCardView,
  toStaffCardView,
} from "../src/lib/bangumi-credits";

test("selectBangumiImage prefers larger available Bangumi image fields", () => {
  assert.equal(
    selectBangumiImage({
      small: "small.jpg",
      medium: "medium.jpg",
      grid: "grid.jpg",
      large: "large.jpg",
    }),
    "large.jpg",
  );

  assert.equal(selectBangumiImage({ grid: "grid.jpg" }), "grid.jpg");
  assert.equal(selectBangumiImage(null), null);
});

test("toCharacterCardView keeps role, image, and primary actor", () => {
  const view = toCharacterCardView({
    id: 152266,
    name: "芙莉莲",
    relation: "主角",
    type: 1,
    summary: "",
    images: { medium: "character.jpg" },
    actors: [
      {
        id: 7605,
        name: "种崎敦美",
        type: 1,
        career: ["声优"],
        images: { small: "actor.jpg" },
      },
    ],
  });

  assert.deepEqual(view, {
    id: 152266,
    href: "/character/152266",
    name: "芙莉莲",
    role: "主角",
    imageUrl: "character.jpg",
    actorName: "种崎敦美",
    actorHref: "/staff/7605",
  });
});

test("toStaffCardView preserves production relation and links to staff page", () => {
  const view = toStaffCardView({
    id: 67006,
    name: "MADHOUSE",
    relation: "动画制作",
    type: 2,
    career: [],
    eps: "",
    images: { common: "studio.jpg" },
  });

  assert.deepEqual(view, {
    id: 67006,
    href: "/staff/67006",
    name: "MADHOUSE",
    role: "动画制作",
    imageUrl: "studio.jpg",
  });
});
