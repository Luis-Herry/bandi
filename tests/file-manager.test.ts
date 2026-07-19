import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import {
  buildFileManagerLaunch,
  isPathWithinRoot,
} from "../src/lib/file-manager";

test("file manager path guard accepts descendants and rejects siblings", () => {
  const root = path.resolve("C:/Bandi/Downloads");
  assert.equal(isPathWithinRoot(root, path.join(root, "Anime", "ep01.mp4")), true);
  assert.equal(isPathWithinRoot(root, root), true);
  assert.equal(isPathWithinRoot(root, path.resolve("C:/Bandi/Other/ep01.mp4")), false);
});

test("file manager launch uses the visible absolute Windows Explorer path", () => {
  assert.deepEqual(
    buildFileManagerLaunch("D:\\Bandi\\Downloads", {
      platform: "win32",
      windowsRoot: "C:\\Windows",
    }),
    {
      command: "C:\\Windows\\explorer.exe",
      args: ["D:\\Bandi\\Downloads"],
    },
  );
  assert.deepEqual(
    buildFileManagerLaunch("D:\\Bandi\\Downloads\\ep01.mp4", {
      platform: "win32",
      windowsRoot: "C:\\Windows",
      selectFile: true,
    }),
    {
      command: "C:\\Windows\\explorer.exe",
      args: ["/select,", "D:\\Bandi\\Downloads\\ep01.mp4"],
    },
  );
});

test("file manager launch keeps Finder reveal and fails closed elsewhere", () => {
  assert.deepEqual(
    buildFileManagerLaunch("/Users/example/Movies/ep01.mp4", {
      platform: "darwin",
      selectFile: true,
    }),
    {
      command: "/usr/bin/open",
      args: ["-R", "/Users/example/Movies/ep01.mp4"],
    },
  );
  assert.equal(
    buildFileManagerLaunch("/tmp/video.mp4", { platform: "linux" }),
    null,
  );
});
