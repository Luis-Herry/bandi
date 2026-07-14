import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

for (const [runtime, modulePath] of [
  ["Windows", "../desktop/qbit-credential-repair.cjs"],
  ["macOS", "../local-server/qbit-credential-repair.cjs"],
] as const) {
  test(`${runtime} credential repair is limited to once per failure cycle`, async () => {
    const { createCredentialRepairCycle } = require(modulePath);
    const cycle = createCredentialRepairCycle();
    const counts = {
      stop: 0,
      credentialWrite: 0,
      restart: 0,
      spawn: 0,
      health: 0,
    };
    const healthResults = [false, true];
    const actions = {
      stop: async () => { counts.stop += 1; },
      rewriteCredentials: async () => { counts.credentialWrite += 1; },
      restart: async () => {
        counts.restart += 1;
        counts.spawn += 1;
        counts.health += 1;
        return { authenticated: healthResults.shift() === true };
      },
    };

    const first = await cycle.repairCredentialsOnce(actions);
    assert.deepEqual(first, {
      attempted: true,
      authenticated: false,
      exhausted: true,
      value: undefined,
    });
    assert.equal(cycle.isExhausted(), true);

    const blocked = await cycle.repairCredentialsOnce(actions);
    assert.deepEqual(blocked, {
      attempted: false,
      authenticated: false,
      exhausted: true,
    });
    assert.deepEqual(counts, {
      stop: 1,
      credentialWrite: 1,
      restart: 1,
      spawn: 1,
      health: 1,
    });

    cycle.markAuthenticatedReady();
    const nextCycle = await cycle.repairCredentialsOnce(actions);
    assert.equal(nextCycle.authenticated, true);
    assert.equal(cycle.isExhausted(), false);
    assert.deepEqual(counts, {
      stop: 2,
      credentialWrite: 2,
      restart: 2,
      spawn: 2,
      health: 2,
    });
  });
}
