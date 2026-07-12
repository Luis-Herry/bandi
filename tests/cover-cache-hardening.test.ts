import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  MAX_COVER_BYTES,
  cacheCover,
  coverCachePath,
  detectImageMimeType,
  validateCoverPayload,
} from "../src/lib/cover-cache";

// Regression: QA-021 — a 200 HTML response could be persisted as a cover image.
// Found by /qa on 2026-07-11.
// Report: .gstack/qa-reports/qa-report-desktop-2026-07-11.md

test("cover cache recognizes supported image signatures", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = Buffer.from("RIFF0000WEBP", "ascii");
  const gif = Buffer.from("GIF89a", "ascii");
  const avif = Buffer.from("0000ftypavif", "ascii");

  assert.equal(detectImageMimeType(jpeg), "image/jpeg");
  assert.equal(detectImageMimeType(png), "image/png");
  assert.equal(detectImageMimeType(webp), "image/webp");
  assert.equal(detectImageMimeType(gif), "image/gif");
  assert.equal(detectImageMimeType(avif), "image/avif");
});

test("cover cache rejects HTML, mismatched types, and oversized images", () => {
  const html = Buffer.from("<!doctype html><title>upstream error</title>");
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

  assert.equal(validateCoverPayload("text/html", html), null);
  assert.equal(validateCoverPayload("image/jpeg", html), null);
  assert.equal(validateCoverPayload("image/png", jpeg), null);
  assert.equal(
    validateCoverPayload("image/jpeg", Buffer.alloc(MAX_COVER_BYTES + 1)),
    null,
  );
  assert.equal(
    validateCoverPayload("image/jpeg; charset=binary", jpeg),
    "image/jpeg",
  );

  const routeSource = readFileSync("src/app/api/img/route.ts", "utf8");
  assert.match(routeSource, /"X-Content-Type-Options": "nosniff"/);
  assert.doesNotMatch(routeSource, /"Content-Type": "image\/jpeg"/);
});

test("cover cache requires an injected absolute directory", () => {
  const previous = process.env.COVER_CACHE_DIR;
  try {
    delete process.env.COVER_CACHE_DIR;
    assert.throws(() => coverCachePath("https://example.com/a.jpg"), {
      message: /COVER_CACHE_DIR 未配置/,
    });

    for (const invalidDirectory of [
      "relative/cache",
      "C:cache",
      "\\cache",
    ]) {
      process.env.COVER_CACHE_DIR = invalidDirectory;
      assert.throws(() => coverCachePath("https://example.com/a.jpg"), {
        message: /必须是完整的 Windows 盘符或 UNC 子目录/,
      });
    }

    process.env.COVER_CACHE_DIR = "H:\\BandiData\\cache\\covers";
    assert.equal(
      path.dirname(coverCachePath("https://example.com/a.jpg")),
      path.normalize(process.env.COVER_CACHE_DIR),
    );
  } finally {
    if (previous == null) delete process.env.COVER_CACHE_DIR;
    else process.env.COVER_CACHE_DIR = previous;
  }
});

test("validated covers still respond when the H cache write fails", async () => {
  const previousDirectory = process.env.COVER_CACHE_DIR;
  const previousFetch = globalThis.fetch;
  const previousWarn = console.warn;
  const root = mkdtempSync(path.join(tmpdir(), "bandi-cover-write-failure-"));
  const blockingFile = path.join(root, "not-a-directory");
  writeFileSync(blockingFile, "blocked", "utf8");
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
  let warned = false;

  try {
    process.env.COVER_CACHE_DIR = blockingFile;
    globalThis.fetch = async () =>
      new Response(new Uint8Array(jpeg), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    console.warn = () => {
      warned = true;
    };

    const result = await cacheCover("https://example.com/write-failure.jpg");
    assert.deepEqual(result, jpeg);
    assert.equal(warned, true);
  } finally {
    if (previousDirectory == null) delete process.env.COVER_CACHE_DIR;
    else process.env.COVER_CACHE_DIR = previousDirectory;
    globalThis.fetch = previousFetch;
    console.warn = previousWarn;
  }
});
