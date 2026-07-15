import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { isPathWithinRoot } from "../src/lib/file-manager";

test("file manager path guard accepts descendants and rejects siblings", () => {
  const root = path.resolve("C:/Bandi/Downloads");
  assert.equal(isPathWithinRoot(root, path.join(root, "Anime", "ep01.mp4")), true);
  assert.equal(isPathWithinRoot(root, root), true);
  assert.equal(isPathWithinRoot(root, path.resolve("C:/Bandi/Other/ep01.mp4")), false);
});
