/**
 * Frontier crossing + the key gate (asm `S53D`, ~1835–1874).
 *
 * Crossing happens when you move into an adjacent territory in another kingdom.
 * The per-region "key not found" flag governs it:
 *   - flag clear (you've found this region's key) → cross; the new region then
 *     owes you a key — unless you already hold all three keys (free roaming).
 *   - flag set (region still owes a key) → blocked with "Key Missing", unless
 *     you already hold all three keys.
 */
import { kingdomOf } from "./board";
import type { EventResult, Player } from "./types";
import { clonePlayer, hasAllKeys } from "./util";

export function resolveFrontier(
  active: Player,
  targetId: string
): { player: Player; result: EventResult; blocked: boolean } {
  const player = clonePlayer(active);
  const allKeys = hasAllKeys(player);

  if (player.flags.regionKeyAvailable && !allKeys) {
    return {
      player,
      blocked: true,
      result: {
        kind: "frontier",
        drum: "wizard-bazaarclosed-keymissing",
        messages: ["KEY MISSING — find this kingdom's key before you cross the frontier."],
      },
    };
  }

  const dest = kingdomOf(targetId);
  player.position = targetId;
  player.flags.regionKeyAvailable = !allKeys; // the new region owes a key
  player.flags.citadelVisited = false; // re-arm the citadel bonus in new territory

  return {
    player,
    blocked: false,
    result: {
      kind: "frontier",
      drum: "goldkey-silverkey-brasskey",
      messages: [
        `You cross the frontier into ${dest.charAt(0).toUpperCase() + dest.slice(1)}.`,
        allKeys ? "With all three keys, you travel freely." : "Seek this kingdom's key.",
      ],
    },
  };
}
