import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "bandi-download-dismissals-"));
process.env.DATABASE_URL = join(tempDir, "dismissals.db");

test("download source dismissals persist until an explicit re-add clears them", async () => {
  const dismissals = await import("../src/lib/download-dismissals");
  const { buildDownloadSourceKey, buildLocalFileDownloadUrl } = await import(
    "../src/lib/download-reconcile"
  );
  const magnet =
    "magnet:?xt=urn:btih:f9b8f54c2e1e6be23b9d34b46bb045b3828912e7";
  const localUrl = buildLocalFileDownloadUrl("D:\\Media\\Bandi\\manual.mp4");
  const magnetKey = buildDownloadSourceKey(magnet);
  const localKey = buildDownloadSourceKey(localUrl);
  const expected = [magnetKey, localKey];

  assert.equal(dismissals.dismissDownloadSources([magnet, localUrl]), 2);
  assert.deepEqual(
    [...dismissals.listDismissedDownloadSourceKeys()].sort(),
    expected.sort(),
  );
  assert.equal(dismissals.clearDownloadSourceDismissal(magnet), true);
  assert.deepEqual([...dismissals.listDismissedDownloadSourceKeys()], [localKey]);
});
