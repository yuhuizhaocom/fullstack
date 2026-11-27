// Deterministic RNG for fixed-seed simulation. State is stored in GameState.

export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: (Math.trunc(seed) ^ 0x9e3779b9) >>> 0 };
}

/** Mulberry32: fast, stable 32-bit PRNG returning [0, 1). */
export function nextRandom(rng: Rng): number {
  let value = (rng.state = (rng.state + 0x6d2b79f5) >>> 0);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function randomRange(rng: Rng, min: number, max: number): number {
  return min + nextRandom(rng) * (max - min);
}