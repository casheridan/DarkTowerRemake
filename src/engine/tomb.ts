/**
 * Tomb / Ruin treasure (asm `L8D9`/`L900`, ~3254–3445).
 *
 * Primary roll (0–15):
 *   0–1  (12.5%) → empty
 *   2–11 (62.5%) → brigands guard the tomb (combat)
 *   12–15 (25%)  → treasure: +random(13–20) gold, then a secondary roll:
 *       0–9  (62.5%) → the region's next key (if it owes one)
 *       10–11 (12.5%) → Pegasus
 *       12–13 (12.5%) → Dragon Sword (if not already held)
 *       14–15 (12.5%) → Wizard — curses a rival (multiplayer only)
 */
import { clampStat } from "./economy";
import { ITEM_LABEL } from "./constants";
import type { EventResult, ItemType, Player } from "./types";
import type { Rng } from "./rng";
import { clonePlayer, hasItem, nextKey } from "./util";

export interface TombResolution {
  player: Player;
  result: EventResult;
  startCombat: boolean;
  /** Set when a Wizard is found — the reducer curses a random rival. */
  castWizard: boolean;
}

export function resolveTomb(active: Player, rng: Rng): TombResolution {
  const player = clonePlayer(active);
  const r1 = rng.rand0to15();

  if (r1 <= 1) {
    return {
      player,
      startCombat: false,
      castWizard: false,
      result: { kind: "tomb", drum: "warrior-food-beast", messages: ["The tomb lies empty and silent."] },
    };
  }

  if (r1 <= 11) {
    return {
      player,
      startCombat: true,
      castWizard: false,
      result: {
        kind: "tomb",
        drum: "victory-warriors-brigands",
        moveEvent: "brigands",
        messages: ["Brigands guard the tomb! Defend yourself."],
      },
    };
  }

  // Treasure (12–15): gold first.
  const gold = rng.range(13, 20);
  player.gold = clampStat(player.gold + gold);
  const messages = [`You unearth treasure: +${gold} gold!`];
  const itemsGained: ItemType[] = [];
  let castWizard = false;

  const r2 = rng.rand0to15();
  if (r2 <= 9) {
    // Key — only if this region still owes one and the player isn't full up.
    const key = player.flags.regionKeyAvailable ? nextKey(player) : null;
    if (key) {
      player.inventory.add(key);
      player.flags.regionKeyAvailable = false;
      itemsGained.push(key);
      messages.push(`Among the treasure lies the ${ITEM_LABEL[key]}!`);
    }
  } else if (r2 <= 11) {
    player.inventory.add("pegasus");
    itemsGained.push("pegasus");
    messages.push("A Pegasus answers your call — ride it to anywhere in a kingdom!");
  } else if (r2 <= 13) {
    if (!hasItem(player, "sword")) {
      player.inventory.add("sword");
      itemsGained.push("sword");
      messages.push("You claim a Dragon Sword — death to dragons!");
    }
  } else {
    // Wizard — the reducer will curse a rival (multiplayer only).
    castWizard = true;
    messages.push("A Wizard's spirit stirs... it seeks a rival to curse!");
  }

  return {
    player,
    startCombat: false,
    castWizard,
    result: {
      kind: "tomb",
      drum: "scout-healer-gold",
      messages,
      deltas: { gold },
      itemsGained,
    },
  };
}
