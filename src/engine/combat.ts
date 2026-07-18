/**
 * Combat — a faithful port of the ROM brigand/Tower battle (asm `L800`–`L8ED`,
 * ~2937–3235).
 *
 * Setup: brigand strength is *tethered* to your warriors — `warriors ± (0–2)`,
 * clamped to 1–99 (so roadside fights are always close).
 *
 * Each ROUND:
 *   - combat strength = warriors × random(1–4)
 *   - the brigand count is subtracted across random(1–4) sub-rounds
 *   - survive every sub-round → you WIN the round and the brigands are HALVED
 *     (the ROM multiplies remaining strength… actually the brigand count — by 5
 *     then divides by 10, i.e. ×0.5)
 *   - run out of strength mid-round → you LOSE the round and one warrior dies
 *
 * The battle ends when the brigands reach 0 (victory) or your warriors reach 0
 * (defeat). At any point you may retreat, losing a single warrior (the ROM's
 * KILLONE path; forced in multiplayer once you drop to ≤2 warriors).
 */
import { clampStat } from "./economy";
import type { CombatState, ItemType, Player } from "./types";
import type { Rng } from "./rng";

export interface CombatReward {
  gold?: number;
  warriors?: number;
  items?: ItemType[];
}

/** Brigand strength tethered to the player's warriors: warriors ± (0–2). */
export function rollBrigands(warriors: number, rng: Rng): number {
  const advantage = rng.rand0to2();
  const playerGetsEdge = rng.randBit() === 1;
  const count = playerGetsEdge ? warriors - advantage : warriors + advantage;
  return Math.max(1, Math.min(99, count));
}

export function startBrigandCombat(
  player: Player,
  rng: Rng,
  reward?: CombatReward
): CombatState {
  const brigands = rollBrigands(player.warriors, rng);
  return {
    source: "brigands",
    brigands,
    brigandsRemaining: brigands,
    warriorsAtStart: player.warriors,
    warriorsRemaining: player.warriors,
    rounds: [],
    over: player.warriors <= 0,
    playerWon: player.warriors <= 0 ? false : null,
    reward,
  };
}

export function startTowerCombat(player: Player, towerBrigands: number): CombatState {
  return {
    source: "tower",
    brigands: towerBrigands,
    brigandsRemaining: towerBrigands,
    warriorsAtStart: player.warriors,
    warriorsRemaining: player.warriors,
    rounds: [],
    over: false,
    playerWon: null,
  };
}

/** Resolve a single combat round, returning the next CombatState. */
export function combatRound(combat: CombatState, rng: Rng): CombatState {
  if (combat.over) return combat;

  const w = combat.warriorsRemaining;
  const b = combat.brigandsRemaining;

  const multiplier = rng.rand1to4();
  const subRounds = rng.rand1to4();
  const strength = w * multiplier;

  let remaining = strength;
  let wonRound = true;
  for (let i = 0; i < subRounds; i++) {
    remaining -= b;
    if (remaining < 0) {
      wonRound = false;
      break;
    }
  }

  const newWarriors = wonRound ? w : clampStat(w - 1);
  const newBrigands = wonRound ? Math.floor(b / 2) : b;

  const round = {
    round: combat.rounds.length + 1,
    playerStrength: strength,
    brigandStrength: b,
    warriorsRemaining: newWarriors,
    brigandsRemaining: newBrigands,
    playerWonRound: wonRound,
  };

  const over = newBrigands <= 0 || newWarriors <= 0;
  const playerWon = over ? newBrigands <= 0 : null;

  return {
    ...combat,
    warriorsRemaining: newWarriors,
    brigandsRemaining: newBrigands,
    rounds: [...combat.rounds, round],
    over,
    playerWon,
  };
}

/** Retreat — lose a single warrior and end the fight (KILLONE). */
export function combatRetreat(combat: CombatState): CombatState {
  if (combat.over) return combat;
  return {
    ...combat,
    warriorsRemaining: clampStat(combat.warriorsRemaining - 1),
    over: true,
    playerWon: false,
  };
}

/** In multiplayer you're forced to retreat once you fall to ≤2 warriors. */
export function mustRetreat(combat: CombatState, playerCount: number): boolean {
  return playerCount > 1 && combat.warriorsRemaining <= 2 && !combat.over;
}
