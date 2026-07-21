import { describe, expect, it } from "vitest";
import { calculateScore, romQuarterWeight } from "../score";

describe("ROM final score (LFFF)", () => {
  it("reproduces L6C0's coarse quarter weighting for Tower armies", () => {
    expect(romQuarterWeight(17)).toBe(3);
    expect(romQuarterWeight(32)).toBe(7);
    expect(romQuarterWeight(64)).toBe(16);
  });

  it("rewards fewer turns, fewer assaulting warriors, and more defenders", () => {
    const baseline = calculateScore({ towerBrigands: 32, turnsTaken: 8, warriorsAtTower: 12 });
    expect(calculateScore({ towerBrigands: 32, turnsTaken: 7, warriorsAtTower: 12 })).toBe(baseline + 8);
    expect(calculateScore({ towerBrigands: 32, turnsTaken: 8, warriorsAtTower: 11 })).toBe(baseline + 8);
    expect(calculateScore({ towerBrigands: 64, turnsTaken: 8, warriorsAtTower: 12 })).toBeGreaterThan(baseline);
  });

  it("clamps the physical two-digit display to 00–99", () => {
    expect(calculateScore({ towerBrigands: 17, turnsTaken: 99, warriorsAtTower: 99 })).toBe(0);
    expect(calculateScore({ towerBrigands: 64, turnsTaken: 0, warriorsAtTower: 1 })).toBe(99);
  });
});
