import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_PARTICLE_COUNT, clampParticleCount } from "../src/lib/particle-config";

test("clampParticleCount keeps the 3D field below the particle budget", () => {
  assert.equal(MAX_PARTICLE_COUNT, 180);
  assert.equal(clampParticleCount(140), 140);
  assert.equal(clampParticleCount(500), MAX_PARTICLE_COUNT);
  assert.equal(clampParticleCount(-4), 0);
  assert.equal(clampParticleCount(12.8), 12);
});
