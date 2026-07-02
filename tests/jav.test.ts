import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJavCode } from "../src/lib/jav";

test("extractJavCode pulls the code out of messy filenames", () => {
  assert.equal(extractJavCode("sample com@TEST-390"), "TEST-390");
  assert.equal(extractJavCode("225544 xyz DEMO-231"), "DEMO-231");
  assert.equal(extractJavCode("sample com 935838 xyz MOCK-590"), "MOCK-590");
  assert.equal(extractJavCode("TEST-529-UC"), "TEST-529"); // 取主码，忽略 -UC 尾缀
  assert.equal(extractJavCode("SAMPLE-570"), "SAMPLE-570");
});

test("extractJavCode returns null for non-code titles", () => {
  assert.equal(extractJavCode("Inception (2010)"), null);
  assert.equal(extractJavCode("庆余年 第1季"), null);
  assert.equal(extractJavCode("200522 メリー・ジェーン"), null); // 纯数字日期，无字母码
});
