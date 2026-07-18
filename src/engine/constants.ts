/**
 * Authoritative game constants, calibrated to `reference/darktower.asm`.
 * Every magic number here has a cited source in the disassembly.
 */
import type { Difficulty, ItemType, KeyType, KingdomId, MoveEventType } from "./types";

/** Plain-text item names for engine-generated log/result messages. */
export const ITEM_LABEL: Record<ItemType, string> = {
  sword: "Dragon Sword",
  scout: "Scout",
  healer: "Healer",
  beast: "Beast",
  pegasus: "Pegasus",
  brassKey: "Brass Key",
  silverKey: "Silver Key",
  goldKey: "Gold Key",
};

/** Starting resources (asm ~1413–1426): 10 warriors, 30 gold, 25 food. */
export const STARTING_WARRIORS = 10;
export const STARTING_GOLD = 30;
export const STARTING_FOOD = 25;

/** All counters are 2-digit BCD on the real hardware → hard cap of 99. */
export const MAX_STAT = 99;

/** Plague kills 2 warriors (asm ~2317: 4/1=0, 4/2=2). */
export const PLAGUE_WARRIOR_LOSS = 2;

/** Dragon's default hoard when defeated with a Sword (asm ~1306–1309): 2 warriors, 6 gold. */
export const DRAGON_TREASURE = { warriors: 2, gold: 6 } as const;

/** Sanctuary tops a starving party up to 5–8 warriors when they have ≤4 (asm ~2677). */
export const SANCTUARY_MIN_WARRIORS = 4;
export const SANCTUARY_WARRIOR_BONUS = { min: 5, max: 8 } as const;

/**
 * The DOMOVE move-event distribution (asm ~2107–2548). A uniform 4-bit roll
 * (0–15) is classified into one of five outcomes. These ranges are the exact
 * branch boundaries in the ROM.
 */
export const MOVE_EVENT_RANGES: { event: MoveEventType; min: number; max: number }[] = [
  { event: "lost", min: 0, max: 2 }, // 3/16 = 18.75%
  { event: "dragon", min: 3, max: 4 }, // 2/16 = 12.5%
  { event: "plague", min: 5, max: 7 }, // 3/16 = 18.75%
  { event: "brigands", min: 8, max: 10 }, // 3/16 = 18.75%
  { event: "safe", min: 11, max: 15 }, // 5/16 = 31.25%
];

/** Classify a 0–15 roll into its move event (faithful to the ROM branches). */
export function classifyMoveRoll(roll: number): MoveEventType {
  const hit = MOVE_EVENT_RANGES.find((r) => roll >= r.min && roll <= r.max);
  return hit ? hit.event : "safe";
}

/** Tower-defense brigand counts by difficulty (asm ~400, ~1340; wiki-confirmed). */
export const DIFFICULTY_TOWER_BRIGANDS: Record<Difficulty, { min: number; max: number }> = {
  1: { min: 17, max: 32 },
  2: { min: 33, max: 64 },
  3: { min: 17, max: 64 },
  // Level 4 — the ROM's test mode (asm L4INIT ~1278): a fixed garrison of 16.
  4: { min: 16, max: 16 },
};

/** Bazaar price ranges (reference/Dark Tower Info.txt, RAM file 7). */
export const BAZAAR_PRICES: Record<
  "warrior" | "beast" | "scout" | "healer",
  { min: number; max: number }
> = {
  warrior: { min: 1, max: 5 },
  beast: { min: 15, max: 25 },
  scout: { min: 10, max: 20 },
  healer: { min: 10, max: 20 },
};

/** The four kingdoms, in clockwise board order. */
export const KINGDOMS: {
  id: KingdomId;
  name: string;
  colorVar: string;
}[] = [
  { id: "arisilon", name: "Arisilon", colorVar: "--dt-arisilon" },
  { id: "brynthia", name: "Brynthia", colorVar: "--dt-brynthia" },
  { id: "durnin", name: "Durnin", colorVar: "--dt-durnin" },
  { id: "zenon", name: "Zenon", colorVar: "--dt-zenon" },
];

export const KINGDOM_ORDER: KingdomId[] = ["arisilon", "brynthia", "durnin", "zenon"];

export function nextKingdom(k: KingdomId): KingdomId {
  const i = KINGDOM_ORDER.indexOf(k);
  return KINGDOM_ORDER[(i + 1) % KINGDOM_ORDER.length];
}

export function prevKingdom(k: KingdomId): KingdomId {
  const i = KINGDOM_ORDER.indexOf(k);
  return KINGDOM_ORDER[(i - 1 + KINGDOM_ORDER.length) % KINGDOM_ORDER.length];
}

/** The three keys, in the fixed acquisition order brass → silver → gold. */
export const KEY_ORDER: KeyType[] = ["brassKey", "silverKey", "goldKey"];
