import { CLEAN_CUE_SECONDS } from "../audio/sfx";
import type { CombatRound } from "../engine";

/**
 * A readable pause after each tower cue. The physical appliance holds its
 * result before beginning the next skirmish; without this beat, an otherwise
 * faithful sequence feels rushed in the browser.
 */
export const COMBAT_ROUND_PADDING_MS = 650;

/** Duration of the cue that introduces the next combat state transition. */
export function combatCueSeconds(lastRound?: CombatRound): number {
  if (!lastRound) return CLEAN_CUE_SECONDS.battle;
  return lastRound.playerWonRound
    ? CLEAN_CUE_SECONDS.winRound
    : CLEAN_CUE_SECONDS.loseRound;
}

/** Complete cue plus the silent display hold before combat advances. */
export function combatStepDelayMs(lastRound?: CombatRound): number {
  return Math.round(combatCueSeconds(lastRound) * 1000) + COMBAT_ROUND_PADDING_MS;
}
