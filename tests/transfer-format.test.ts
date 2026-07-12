import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatDataSize,
  formatTransferSpeed,
} from "../src/lib/transfer-format";

test("transfer speed distinguishes an idle service from unavailable data", () => {
  assert.equal(formatTransferSpeed(undefined), "—");
  assert.equal(formatTransferSpeed(Number.NaN), "—");
  assert.equal(formatTransferSpeed(0), "0 B/s");
  assert.equal(formatTransferSpeed(1536), "1.5 KB/s");
});

test("data size preserves zero and formats disk capacity", () => {
  assert.equal(formatDataSize(undefined), "—");
  assert.equal(formatDataSize(0), "0 B");
  assert.equal(formatDataSize(279_225_012_224), "260 GB");
});
