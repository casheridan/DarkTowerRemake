import { describe, expect, it } from "vitest";
import { applyFood, clampStat, dragonTake, foodConsumed, goldCapacity } from "../economy";

describe("food consumption (asm ~1648–1660): ceil(warriors / 15)", () => {
  it("uses the documented brackets", () => {
    expect(foodConsumed(0)).toBe(0);
    expect(foodConsumed(1)).toBe(1);
    expect(foodConsumed(15)).toBe(1);
    expect(foodConsumed(16)).toBe(2);
    expect(foodConsumed(30)).toBe(2);
    expect(foodConsumed(31)).toBe(3);
    expect(foodConsumed(45)).toBe(3);
    expect(foodConsumed(46)).toBe(4);
    expect(foodConsumed(99)).toBe(7);
  });
});

describe("applyFood (asm ~1648–1745)", () => {
  it("subtracts consumed food when supplies suffice", () => {
    const r = applyFood(15, 10);
    expect(r.consumed).toBe(1);
    expect(r.food).toBe(9);
    expect(r.warriors).toBe(15);
    expect(r.starved).toBe(false);
  });

  it("starves exactly one warrior and clamps food to 0 when it can't feed the party", () => {
    const r = applyFood(20, 0); // needs 2 food, has 0
    expect(r.starved).toBe(true);
    expect(r.food).toBe(0);
    expect(r.warriors).toBe(19);
  });

  it("raises the low-food warning when remaining food < 4× consumption", () => {
    // 16 warriors -> consume 2; remaining < 8 triggers the warning
    expect(applyFood(16, 9).lowFood).toBe(true); // 7 remaining < 8
    expect(applyFood(16, 10).lowFood).toBe(false); // 8 remaining, not < 8
  });
});

describe("goldCapacity (asm L5BB — 6 per warrior, +50 for a Beast, cap 99)", () => {
  it("is 6 gold per warrior", () => {
    expect(goldCapacity(5, false)).toBe(30);
    expect(goldCapacity(10, false)).toBe(60);
    expect(goldCapacity(0, false)).toBe(0);
  });
  it("a Beast adds 50, all capped at 99", () => {
    expect(goldCapacity(5, true)).toBe(80); // 30 + 50
    expect(goldCapacity(10, true)).toBe(99); // 60 + 50 = 110 → 99
    expect(goldCapacity(99, false)).toBe(99); // 594 → 99
  });
});

describe("dragonTake (asm L6C0 — one quarter)", () => {
  it("takes floor(value / 4)", () => {
    expect(dragonTake(0)).toBe(0);
    expect(dragonTake(3)).toBe(0);
    expect(dragonTake(4)).toBe(1);
    expect(dragonTake(30)).toBe(7);
    expect(dragonTake(99)).toBe(24);
  });
});

describe("clampStat", () => {
  it("clamps to the 0–99 BCD range", () => {
    expect(clampStat(-5)).toBe(0);
    expect(clampStat(150)).toBe(99);
    expect(clampStat(42)).toBe(42);
  });
});
