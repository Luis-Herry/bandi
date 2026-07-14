import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  advanceParentLeaseSequence,
  classifyParentLease,
  type ParentLeaseAction,
} from "../instrumentation";

const expected = {
  pid: 4242,
  token: "current-parent-token",
  now: 20_000,
  maxAgeMs: 10_000,
};

test("parent lease only authorizes qBit shutdown for the same expired lease", () => {
  assert.equal(classifyParentLease({
    pid: expected.pid,
    token: expected.token,
    updatedAt: 5_000,
  }, expected), "shutdown-qbit");
  assert.equal(classifyParentLease({
    pid: expected.pid,
    token: "new-parent-token",
    updatedAt: 19_999,
  }, expected), "exit-only");
  assert.equal(classifyParentLease({
    pid: 9999,
    token: expected.token,
    updatedAt: 19_999,
  }, expected), "exit-only");
  assert.equal(classifyParentLease(null, expected), "exit-only");
});

test("old Next rechecks the latest lease before touching qBittorrent", () => {
  const source = readFileSync("instrumentation.ts", "utf8");
  assert.match(source, /const latestLease = JSON\.parse\(readFileSync\(leasePath/);
  assert.match(source, /confirmedShutdown = classifyParentLease/);
  assert.match(source, /if \(confirmedShutdown && qbitUrl && qbitUser && qbitPassword\)/);
});

function runSequence(actions: ParentLeaseAction[]) {
  let state = { consecutiveExpiredLeases: 0 };
  return actions.map((action) => {
    const result = advanceParentLeaseSequence(state, action);
    state = { consecutiveExpiredLeases: result.consecutiveExpiredLeases };
    return result;
  });
}

test("lease shutdown requires three consecutive same-parent expirations", () => {
  const mixed = runSequence(["exit-only", "exit-only", "shutdown-qbit"]);
  assert.equal(mixed.at(-1)?.consecutiveExpiredLeases, 1);
  assert.equal(mixed.some((entry) => entry.shutdownQbit), false);

  const expired = runSequence([
    "shutdown-qbit",
    "shutdown-qbit",
    "shutdown-qbit",
  ]);
  assert.deepEqual(expired.map((entry) => entry.shutdownQbit), [false, false, true]);

  const reparented = classifyParentLease({
    pid: expected.pid + 1,
    token: expected.token,
    updatedAt: 1,
  }, expected);
  assert.equal(reparented, "exit-only");
  assert.equal(runSequence([
    "shutdown-qbit",
    reparented,
    "shutdown-qbit",
  ]).at(-1)?.shutdownQbit, false);
});
