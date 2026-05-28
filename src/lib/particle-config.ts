export const MAX_PARTICLE_COUNT = 180;

export function clampParticleCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(MAX_PARTICLE_COUNT, Math.floor(count)));
}
