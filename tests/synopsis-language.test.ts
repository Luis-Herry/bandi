import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isLikelyChineseSynopsis,
  selectPreferredSynopsis,
} from "../src/lib/synopsis-language";

test("Chinese synopsis wins over Japanese source copy", () => {
  const japanese = "商店街をひた走るくたびれ中年男性の佐々木。彼のひそやかな癒しといえば、日ごろから愛煙する煙草。";
  const chinese = "在商店街工作得筋疲力尽的中年上班族佐佐木，每天的小小慰藉是抽烟。";
  assert.equal(selectPreferredSynopsis(japanese, chinese), chinese);
  assert.equal(selectPreferredSynopsis(chinese, japanese), chinese);
});

test("simplified and traditional copy are both recognized as Chinese", () => {
  assert.equal(isLikelyChineseSynopsis("魔女与少女踏上寻找故乡的旅程。"), true);
  assert.equal(isLikelyChineseSynopsis("魔女與少女踏上尋找故鄉的旅程。"), true);
});

test("a small Japanese title fragment does not disqualify Chinese copy", () => {
  assert.equal(
    isLikelyChineseSynopsis("作品原名为スーパー，讲述两人在超市后门相遇的故事。"),
    true,
  );
});

test("source order is preserved when no Chinese synopsis exists", () => {
  const japanese = "ふたりが出会う物語。";
  const english = "A story about two people meeting.";
  assert.equal(selectPreferredSynopsis(japanese, english), japanese);
  assert.equal(selectPreferredSynopsis("  ", null), null);
});
