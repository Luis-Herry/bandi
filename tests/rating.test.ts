import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatRatingScore,
  getStarFillPercent,
  normalizeRatingInput,
} from "../src/lib/rating";

test("normalizeRatingInput keeps ratings on half-star steps", () => {
  assert.equal(normalizeRatingInput(0.25), 0.5);
  assert.equal(normalizeRatingInput(0.5), 0.5);
  assert.equal(normalizeRatingInput(2.24), 2);
  assert.equal(normalizeRatingInput(2.25), 2.5);
  assert.equal(normalizeRatingInput(4.74), 4.5);
  assert.equal(normalizeRatingInput(4.75), 5);
  assert.equal(normalizeRatingInput(6), 5);
});

test("formatRatingScore keeps the 10-point display scale", () => {
  assert.equal(formatRatingScore(0), "--");
  assert.equal(formatRatingScore(0.5), "1.0");
  assert.equal(formatRatingScore(4.5), "9.0");
  assert.equal(formatRatingScore(5), "10.0");
});

test("getStarFillPercent exposes empty, half, and full stars", () => {
  assert.equal(getStarFillPercent(1, 0), 0);
  assert.equal(getStarFillPercent(1, 0.5), 50);
  assert.equal(getStarFillPercent(1, 1), 100);
  assert.equal(getStarFillPercent(4, 3.5), 50);
  assert.equal(getStarFillPercent(5, 4.5), 50);
  assert.equal(getStarFillPercent(5, 5), 100);
});
