/**
 * Sanctuary / Citadel replenishment (asm `DOSANCT`, ~2651–2808).
 *
 *  - Warriors: ≤4 → +random(5–8). Else, at your own Citadel on its first visit
 *    since a tomb run, 5–24 warriors are DOUBLED.
 *  - Gold: ≤7 → +random(9–16).
 *  - Food: ≤5 → +random(9–16).
 */
import { SANCTUARY_MIN_WARRIORS } from "./constants";
import { kingdomOf } from "./board";
import { clampStat } from "./economy";
import type { BuildingType, EventResult, Player } from "./types";
import type { Rng } from "./rng";
import { clonePlayer } from "./util";

export function resolveSanctuary(
  active: Player,
  building: BuildingType,
  rng: Rng
): { player: Player; result: EventResult } {
  const player = clonePlayer(active);
  const messages: string[] = [];
  const before = { warriors: player.warriors, gold: player.gold, food: player.food };

  // A Citadel bonus only applies at the player's OWN citadel, and only on the
  // first visit since their last tomb run.
  const isOwnCitadel = building === "citadel" && kingdomOf(player.position) === player.home;
  const citadelBonus = isOwnCitadel && !player.flags.citadelVisited;
  if (isOwnCitadel) player.flags.citadelVisited = true;

  // Warriors
  if (player.warriors <= SANCTUARY_MIN_WARRIORS) {
    const bonus = rng.range(5, 8);
    player.warriors = clampStat(player.warriors + bonus);
    messages.push(`The healers rally ${bonus} fresh warriors to your banner.`);
  } else if (player.warriors <= 24 && citadelBonus) {
    const bonus = player.warriors;
    player.warriors = clampStat(player.warriors * 2);
    messages.push(`Your home Citadel doubles your forces! +${player.warriors - bonus} warriors.`);
  }

  // Gold
  if (player.gold <= 7) {
    const bonus = rng.range(9, 16);
    player.gold = clampStat(player.gold + bonus);
    messages.push(`Tithes fill your coffers: +${bonus} gold.`);
  }

  // Food
  if (player.food <= 5) {
    const bonus = rng.range(9, 16);
    player.food = clampStat(player.food + bonus);
    messages.push(`The larder is stocked: +${bonus} rations.`);
  }

  if (messages.length === 0) {
    messages.push("You rest, but your party already wants for nothing.");
  }

  return {
    player,
    result: {
      kind: "sanctuary",
      drum: "scout-healer-gold",
      messages,
      deltas: {
        warriors: player.warriors - before.warriors,
        gold: player.gold - before.gold,
        food: player.food - before.food,
      },
    },
  };
}
