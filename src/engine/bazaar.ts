/**
 * The Bazaar (asm `LA98`, ~3826–4160) — sequential, incremental haggle-shop.
 *
 * Prices rolled on entry (the ROM's price buffer):
 *   Warriors 5–8 · Food 1 · Beast/Scout/Healer 17–26 (each).
 *
 * Items are offered one at a time (Warrior → Food → Beast → Scout → Healer,
 * skipping gear you already own). For the item on display you may:
 *   - **Haggle** (before choosing): a 0–15 roll drops the price by 1 on a roll
 *     under the threshold — 12 first haggle of the visit (75%), 8 after (50%);
 *     otherwise (or on a 1-gold item) the merchant SLAMS the bazaar shut.
 *   - **Yes/Buy**: begin/continue an incremental purchase. Each Yes adds one to
 *     the quantity; if the running total ever exceeds your gold, the bazaar
 *     closes instantly and the purchase is lost.
 *   - **No/End**: if a purchase is pending, confirm it and CLOSE the bazaar —
 *     one completed transaction per visit. With nothing pending, No/End just
 *     passes to the next item (and closes once past the last one).
 */
import { clampStat } from "./economy";
import type { BazaarState, BazaarWare, ItemType, Player } from "./types";
import type { Rng } from "./rng";
import { clonePlayer } from "./util";

const GEAR: Record<"beast" | "scout" | "healer", ItemType> = {
  beast: "beast",
  scout: "scout",
  healer: "healer",
};
const ALL_WARES: BazaarWare[] = ["warrior", "food", "beast", "scout", "healer"];

export const WARE_LABEL: Record<BazaarWare, string> = {
  warrior: "Warrior",
  food: "Food",
  beast: "Beast",
  scout: "Scout",
  healer: "Healer",
};

export function isGear(w: BazaarWare): w is "beast" | "scout" | "healer" {
  return w === "beast" || w === "scout" || w === "healer";
}

export function currentWare(b: BazaarState): BazaarWare | null {
  return b.index >= 0 && b.index < b.sequence.length ? b.sequence[b.index] : null;
}

/** Max you can hold of a ware in one purchase (gear is one-per-customer). */
function maxQty(w: BazaarWare): number {
  return isGear(w) ? 1 : 99;
}

export function createBazaar(player: Player, rng: Rng): BazaarState {
  const prices: Record<BazaarWare, number> = {
    warrior: rng.range(5, 8),
    food: 1,
    beast: rng.range(17, 26),
    scout: rng.range(17, 26),
    healer: rng.range(17, 26),
  };
  const sequence = ALL_WARES.filter((w) => !(isGear(w) && player.inventory.has(GEAR[w])));
  return {
    prices,
    freshHaggle: true,
    sequence,
    index: 0,
    qty: 0,
    closed: false,
    note: undefined,
  };
}

export interface BazaarOutcome {
  bazaar: BazaarState;
  player: Player;
  /** Non-null when the visit ends this step (the reducer then ends the turn). */
  ended: string | null;
}

/** Haggle the item on display. Only meaningful before an incremental purchase. */
export function bazaarHaggle(bazaar: BazaarState, player: Player, rng: Rng): BazaarOutcome {
  const ware = currentWare(bazaar);
  if (!ware || bazaar.closed || bazaar.qty > 0) return { bazaar, player, ended: null };
  const price = bazaar.prices[ware];

  if (price <= 1) {
    return {
      bazaar: { ...bazaar, closed: true },
      player,
      ended: "“One gold?! Out of my bazaar!” The merchant slams the gate shut.",
    };
  }

  const roll = rng.rand0to15();
  const threshold = bazaar.freshHaggle ? 12 : 8; // 75% first haggle, 50% after
  if (roll < threshold) {
    return {
      bazaar: {
        ...bazaar,
        prices: { ...bazaar.prices, [ware]: price - 1 },
        freshHaggle: false,
        note: `Haggled the ${WARE_LABEL[ware]} down to ${price - 1} gold.`,
      },
      player,
      ended: null,
    };
  }
  return {
    bazaar: { ...bazaar, freshHaggle: false, closed: true },
    player,
    ended: "You push too hard — the merchant slams the bazaar shut.",
  };
}

/** Yes/Buy — start or grow the incremental purchase of the current item. */
export function bazaarYes(bazaar: BazaarState, player: Player): BazaarOutcome {
  const ware = currentWare(bazaar);
  if (!ware || bazaar.closed) return { bazaar, player, ended: null };
  const price = bazaar.prices[ware];

  if (bazaar.qty >= maxQty(ware)) {
    // Gear: only one can be carried — nudge them to confirm with No/End.
    return {
      bazaar: { ...bazaar, note: `You can only carry one ${WARE_LABEL[ware]}. Press No/End to confirm.` },
      player,
      ended: null,
    };
  }

  const nextQty = bazaar.qty + 1;
  const total = nextQty * price;
  if (total > player.gold) {
    return {
      bazaar: { ...bazaar, closed: true },
      player,
      ended: `You can't cover ${total} gold — the merchant slams the bazaar shut!`,
    };
  }
  return {
    bazaar: {
      ...bazaar,
      qty: nextQty,
      note: `${nextQty} × ${WARE_LABEL[ware]} = ${total} gold (you have ${player.gold}).`,
    },
    player,
    ended: null,
  };
}

/**
 * No/End — with a pending purchase, complete the transaction and close the
 * bazaar (one deal per visit). With nothing pending, pass to the next item.
 */
export function bazaarNo(bazaar: BazaarState, player: Player): BazaarOutcome {
  const ware = currentWare(bazaar);
  if (!ware || bazaar.closed) return { bazaar, player, ended: null };

  if (bazaar.qty >= 1) {
    const price = bazaar.prices[ware];
    const total = bazaar.qty * price;
    const nextPlayer = clonePlayer(player);
    nextPlayer.gold = clampStat(nextPlayer.gold - total);
    if (ware === "warrior") nextPlayer.warriors = clampStat(nextPlayer.warriors + bazaar.qty);
    else if (ware === "food") nextPlayer.food = clampStat(nextPlayer.food + bazaar.qty);
    else nextPlayer.inventory.add(GEAR[ware]);
    return {
      bazaar: { ...bazaar, closed: true, qty: 0 },
      player: nextPlayer,
      ended: `Trade complete — bought ${bazaar.qty} × ${WARE_LABEL[ware]} for ${total} gold. The bazaar closes.`,
    };
  }

  // Nothing bought — move on to the next item, or leave when past the last.
  const nextIndex = bazaar.index + 1;
  if (nextIndex >= bazaar.sequence.length) {
    return { bazaar: { ...bazaar, closed: true, qty: 0 }, player, ended: "You buy nothing and leave the bazaar." };
  }
  return { bazaar: { ...bazaar, index: nextIndex, qty: 0, note: undefined }, player, ended: null };
}
