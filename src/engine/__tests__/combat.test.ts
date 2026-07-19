import { describe, expect, it } from "vitest";
import { combatRetreat, combatRound, rollBrigands, startBrigandCombat, startTowerCombat } from "../combat";
import { createRng } from "../rng";
import { makeTestPlayer } from "./helpers";

const fixed = (overrides: Partial<ReturnType<typeof createRng>>) => ({
  next: () => 0.5,
  range: (min: number) => min,
  rand0to15: () => 0,
  rand0to2: () => 0,
  randBit: () => 0 as 0 | 1,
  rand1to4: () => 1,
  ...overrides,
});

describe("brigand strength is tethered to warriors (asm L800)", () => {
  it("stays within warriors ± 2", () => {
    const rng = createRng(42);
    for (let i = 0; i < 2000; i++) {
      const w = 1 + Math.floor(rng.next() * 99);
      const b = rollBrigands(w, rng);
      expect(b).toBeGreaterThanOrEqual(Math.max(1, w - 2));
      expect(b).toBeLessThanOrEqual(Math.min(99, w + 2));
    }
  });

  it("never drops below 1", () => {
    const rng = fixed({ rand0to2: () => 2, randBit: () => 1 }); // player edge, max advantage
    expect(rollBrigands(1, rng)).toBe(1);
  });
});

describe("combat rounds (asm L840/L880)", () => {
  it("winning a round halves the brigands", () => {
    let combat = startTowerCombat(makeTestPlayer({ warriors: 50 }), 40);
    // strength 50×4=200, subtract 40 once -> survives -> win -> 40 halves to 20
    combat = combatRound(combat, fixed({ rand1to4: () => 4 }) as any);
    expect(combat.brigandsRemaining).toBe(20);
    expect(combat.warriorsRemaining).toBe(50);
    expect(combat.rounds[0].playerWonRound).toBe(true);
  });

  it("losing a round costs one warrior", () => {
    // strength 1×1=1, brigands 40, 1-40 < 0 -> lose round -> -1 warrior
    let combat = startTowerCombat(makeTestPlayer({ warriors: 10 }), 40);
    combat = combatRound(combat, fixed({ rand1to4: () => 1 }) as any);
    expect(combat.warriorsRemaining).toBe(9);
    expect(combat.brigandsRemaining).toBe(40);
    expect(combat.rounds[0].playerWonRound).toBe(false);
  });

  it("a strong army eventually wins the Tower battle", () => {
    let combat = startTowerCombat(makeTestPlayer({ warriors: 99 }), 64);
    const rng = createRng(5);
    let guard = 0;
    while (!combat.over && guard++ < 100) combat = combatRound(combat, rng);
    expect(combat.over).toBe(true);
    expect(combat.playerWon).toBe(true);
  });

  it("retreat ends the fight and loses one warrior", () => {
    const combat = startBrigandCombat(makeTestPlayer({ warriors: 10 }), fixed({}) as any);
    const after = combatRetreat(combat);
    expect(after.over).toBe(true);
    expect(after.playerWon).toBe(false);
    expect(after.warriorsRemaining).toBe(9);
  });

  it("forces a multiplayer retreat at two warriors and preserves one survivor", () => {
    const combat = startBrigandCombat(makeTestPlayer({ warriors: 2 }), fixed({}) as any);
    const after = combatRound(combat, fixed({}) as any, 2);
    expect(after.over).toBe(true);
    expect(after.playerWon).toBe(false);
    expect(after.warriorsRemaining).toBe(1);
  });

  it("never lets a one-warrior multiplayer retreat drop to zero", () => {
    const combat = startBrigandCombat(makeTestPlayer({ warriors: 1 }), fixed({}) as any);
    expect(combatRetreat(combat, 2).warriorsRemaining).toBe(1);
    expect(combatRetreat(combat, 1).warriorsRemaining).toBe(0);
  });
});
