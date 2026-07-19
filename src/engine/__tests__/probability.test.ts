import { describe, expect, it } from "vitest";
import { MOVE_EVENT_RANGES, classifyMoveRoll } from "../constants";
import { createRng } from "../rng";
import type { MoveEventType } from "../types";

describe("move-event distribution (DOMOVE, asm ~2107–2548)", () => {
  it("classifies every 4-bit roll into the exact ROM buckets", () => {
    const buckets: Record<MoveEventType, number[]> = {
      lost: [],
      dragon: [],
      plague: [],
      brigands: [],
      safe: [],
    };
    for (let roll = 0; roll <= 15; roll++) {
      buckets[classifyMoveRoll(roll)].push(roll);
    }
    expect(buckets.lost).toEqual([0, 1, 2]); // 3/16
    expect(buckets.dragon).toEqual([3, 4]); // 2/16
    expect(buckets.plague).toEqual([5, 6, 7]); // 3/16
    expect(buckets.brigands).toEqual([8, 9, 10]); // 3/16
    expect(buckets.safe).toEqual([11, 12, 13, 14, 15]); // 5/16
  });

  it("the ranges partition exactly the 16 values 0–15 with no gaps/overlaps", () => {
    const covered = new Set<number>();
    for (const r of MOVE_EVENT_RANGES) {
      for (let v = r.min; v <= r.max; v++) {
        expect(covered.has(v)).toBe(false);
        covered.add(v);
      }
    }
    expect(covered.size).toBe(16);
  });

  it("yields the exact theoretical probabilities", () => {
    const prob = (e: MoveEventType) =>
      MOVE_EVENT_RANGES.filter((r) => r.event === e).reduce(
        (a, r) => a + (r.max - r.min + 1),
        0
      ) / 16;
    expect(prob("lost")).toBeCloseTo(0.1875);
    expect(prob("dragon")).toBeCloseTo(0.125);
    expect(prob("plague")).toBeCloseTo(0.1875);
    expect(prob("brigands")).toBeCloseTo(0.1875);
    expect(prob("safe")).toBeCloseTo(0.3125);
  });
});

describe("RNG uniformity", () => {
  it("rand0to15 is uniform across many samples", () => {
    const rng = createRng(0xc0ffee);
    const counts = new Array(16).fill(0);
    const N = 160_000;
    for (let i = 0; i < N; i++) counts[rng.rand0to15()]++;
    const expected = N / 16;
    for (const c of counts) {
      // within 8% of the expected per-bucket count
      expect(Math.abs(c - expected) / expected).toBeLessThan(0.08);
    }
  });

  it("rand1to4 stays in [1,4] and rand0to2 in [0,2]", () => {
    const rng = createRng(7);
    for (let i = 0; i < 5000; i++) {
      const a = rng.rand1to4();
      const b = rng.rand0to2();
      expect(a).toBeGreaterThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(4);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(2);
    }
  });

  it("rand0to2 uses the ROM's 6/16, 5/16, 5/16 weighting", () => {
    const rng = createRng(0xb16b00b5);
    const counts = [0, 0, 0];
    const samples = 160_000;
    for (let i = 0; i < samples; i++) counts[rng.rand0to2()]++;

    const expected = [6 / 16, 5 / 16, 5 / 16];
    for (let i = 0; i < counts.length; i++) {
      expect(Math.abs(counts[i] / samples - expected[i])).toBeLessThan(0.01);
    }
  });
});
