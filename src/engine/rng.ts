/**
 * Seedable PRNG + the discrete random helpers the ROM uses.
 *
 * The original TMS1400 generates randomness via an LFSR that is continually
 * re-seeded while waiting for a keypress (asm `RANDOM`, ~line 256). That timing
 * dependence can't be reproduced deterministically, so we reproduce the
 * *distributions* the ROM relies on (uniform 4-bit rolls, 0–2 advantage, etc.)
 * with a fast, well-distributed, seedable generator instead. This keeps the
 * exact probabilities faithful while remaining testable and replayable.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, 15] — the ROM's core 4-bit random roll. */
  rand0to15(): number;
  /** ROM-weighted 0–2 advantage: 6/16 zero, 5/16 one, 5/16 two. */
  rand0to2(): number;
  /** A single random bit (0 or 1) — e.g. who gets the combat advantage. */
  randBit(): 0 | 1;
  /** Uniform integer in [1, 4] — combat strength multiplier / sub-rounds. */
  rand1to4(): number;
  /** Uniform integer in [min, max] inclusive. */
  range(min: number, max: number): number;
}

/** mulberry32 — small, fast, good-enough distribution for a board game. */
export function createRng(seed = (Math.random() * 2 ** 32) >>> 0): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number =>
    min + Math.floor(next() * (max - min + 1));

  return {
    next,
    range,
    rand0to15: () => Math.floor(next() * 16),
    rand0to2: () => {
      const roll = Math.floor(next() * 16);
      return roll <= 5 ? 0 : roll <= 10 ? 1 : 2;
    },
    randBit: () => (next() < 0.5 ? 0 : 1),
    rand1to4: () => 1 + Math.floor(next() * 4),
  };
}
