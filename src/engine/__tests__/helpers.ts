/** Shared test utilities (not a test file). */
import { STARTING_FOOD, STARTING_GOLD, STARTING_WARRIORS } from "../constants";
import { citadelId } from "../board";
import type { ItemType, Player } from "../types";
import type { Rng } from "../rng";

/** A deterministic RNG that replays a script for rand0to15, with sane defaults. */
export function scriptedRng(rolls: number[]): Rng {
  let i = 0;
  const nextRoll = () => rolls[Math.min(i++, rolls.length - 1)];
  return {
    next: () => 0.5,
    range: (min) => min,
    rand0to15: nextRoll,
    rand0to2: () => 0,
    randBit: () => 0,
    rand1to4: () => 1,
  };
}

type PlayerOverrides = Partial<Omit<Player, "flags">> & { flags?: Partial<Player["flags"]> };

export function makeTestPlayer(overrides: PlayerOverrides = {}): Player {
  const { inventory, flags, ...rest } = overrides;
  return {
    id: 0,
    name: "Tester",
    home: "arisilon",
    position: citadelId("arisilon"),
    lastKingdom: "arisilon",
    previousKingdom: "arisilon",
    warriors: STARTING_WARRIORS,
    gold: STARTING_GOLD,
    food: STARTING_FOOD,
    alive: true,
    won: false,
    turnsTaken: 0,
    score: null,
    ...rest,
    inventory: new Set<ItemType>(inventory ?? []),
    flags: {
      citadelVisited: false,
      cursed: false,
      lostWithScout: false,
      freshHaggle: true,
      regionKeyAvailable: false,
      ...(flags ?? {}),
    },
  };
}
