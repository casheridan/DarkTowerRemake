import { describe, expect, it } from "vitest";
import type { CombatRound } from "../../engine";
import { CLEAN_CUE_SECONDS } from "../../audio/sfx";
import {
  COMBAT_ROUND_PADDING_MS,
  combatCueSeconds,
  combatStepDelayMs,
} from "../combatTiming";

function round(playerWonRound: boolean): CombatRound {
  return {
    round: 1,
    playerStrength: 10,
    brigandStrength: 10,
    warriorsRemaining: playerWonRound ? 10 : 9,
    brigandsRemaining: playerWonRound ? 5 : 10,
    playerWonRound,
  };
}

describe("combat presentation timing", () => {
  it("lets the battle introduction finish before the first round", () => {
    expect(combatCueSeconds()).toBe(CLEAN_CUE_SECONDS.battle);
    expect(combatStepDelayMs()).toBe(
      Math.round(CLEAN_CUE_SECONDS.battle * 1000) + COMBAT_ROUND_PADDING_MS
    );
  });

  it("holds both round outcomes after their complete hit cues", () => {
    expect(combatStepDelayMs(round(true))).toBe(
      Math.round(CLEAN_CUE_SECONDS.winRound * 1000) + COMBAT_ROUND_PADDING_MS
    );
    expect(combatStepDelayMs(round(false))).toBe(
      Math.round(CLEAN_CUE_SECONDS.loseRound * 1000) + COMBAT_ROUND_PADDING_MS
    );
  });
});
