import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import {
  buildFileManagerLaunch,
  isPathWithinRoot,
  openInFileManager,
} from "../src/lib/file-manager";

function createSpawnStub(outcome: "error" | "spawn") {
  let unrefCalled = false;
  const spawnProcess = () => {
    const listeners = new Map<string, () => void>();
    const child = {
      once(event: "error" | "spawn", listener: () => void) {
        listeners.set(event, listener);
        return child;
      },
      unref() {
        unrefCalled = true;
      },
    };
    queueMicrotask(() => listeners.get(outcome)?.());
    return child;
  };
  return { spawnProcess, wasUnrefCalled: () => unrefCalled };
}

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

test("file manager reports Explorer spawn success and releases the child", async () => {
  const stub = createSpawnStub("spawn");
  const opened = await openInFileManager("D:\\Bandi\\Downloads", {
    platform: "win32",
    windowsRoot: "C:\\Windows",
    spawnProcess: stub.spawnProcess,
  });
  assert.equal(opened, true);
  assert.equal(stub.wasUnrefCalled(), true);
});

test("file manager reports Explorer spawn failure without releasing the child", async () => {
  const stub = createSpawnStub("error");
  const opened = await openInFileManager("D:\\Bandi\\Downloads", {
    platform: "win32",
    windowsRoot: "C:\\Windows",
    spawnProcess: stub.spawnProcess,
  });
  assert.equal(opened, false);
  assert.equal(stub.wasUnrefCalled(), false);
});
