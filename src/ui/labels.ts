/** Display metadata for items, buildings, and kingdoms (UI layer only). */
import type { BuildingType, ItemType, KingdomId, MoveEventType } from "../engine";

export const ITEM_META: Record<ItemType, { label: string; icon: string; desc: string }> = {
  sword: { label: "Dragon Sword", icon: "⚔️", desc: "Slay a dragon and claim its hoard (one use)." },
  scout: { label: "Scout", icon: "🧭", desc: "Never lose your way." },
  healer: { label: "Healer", icon: "⚕️", desc: "Wards off the plague." },
  beast: { label: "Beast", icon: "🐎", desc: "A loyal pack-beast for your caravan." },
  pegasus: { label: "Pegasus", icon: "🪽", desc: "Fly to any space in a kingdom (one use)." },
  brassKey: { label: "Brass Key", icon: "🗝️", desc: "First key to the Dark Tower." },
  silverKey: { label: "Silver Key", icon: "🗝️", desc: "Second key to the Dark Tower." },
  goldKey: { label: "Gold Key", icon: "🗝️", desc: "Third key to the Dark Tower." },
};

export const KEY_TINT: Record<"brassKey" | "silverKey" | "goldKey", string> = {
  brassKey: "var(--dt-brass)",
  silverKey: "var(--dt-silver)",
  goldKey: "var(--dt-gold)",
};

export const BUILDING_META: Record<BuildingType, { label: string; icon: string }> = {
  citadel: { label: "Citadel", icon: "🏰" },
  frontier: { label: "Frontier", icon: "🚩" },
  bazaar: { label: "Bazaar", icon: "🛒" },
  sanctuary: { label: "Sanctuary", icon: "⛪" },
  tomb: { label: "Tomb", icon: "⚰️" },
  ruin: { label: "Ruin", icon: "🏛️" },
  darkTower: { label: "Dark Tower", icon: "🗼" },
};

export const KINGDOM_META: Record<KingdomId, { name: string; colorVar: string }> = {
  arisilon: { name: "Arisilon", colorVar: "--dt-arisilon" },
  brynthia: { name: "Brynthia", colorVar: "--dt-brynthia" },
  durnin: { name: "Durnin", colorVar: "--dt-durnin" },
  zenon: { name: "Zenon", colorVar: "--dt-zenon" },
};

/** The three lamps printed on each rotating-drum position (asm RAM 0/0). */
export const DRUM_LAMPS: Record<string, [string, string, string]> = {
  "warrior-food-beast": ["Warrior", "Food", "Beast"],
  "scout-healer-gold": ["Scout", "Healer", "Gold"],
  "goldkey-silverkey-brasskey": ["Gold Key", "Silver Key", "Brass Key"],
  "dragon-sword-pegasus": ["Dragon", "Sword", "Pegasus"],
  "wizard-bazaarclosed-keymissing": ["Wizard", "Bazaar Closed", "Key Missing"],
  "victory-warriors-brigands": ["Victory", "Warriors", "Brigands"],
  "cursed-lost-plague": ["Cursed", "Lost", "Plague"],
};

/** Which of the three drum lamps a given move event lights (-1 = none). */
export const MOVE_EVENT_LAMP: Record<MoveEventType, number> = {
  dragon: 0, // Dragon (drum: Dragon/Sword/Pegasus)
  lost: 1, // Lost (drum: Cursed/Lost/Plague)
  plague: 2, // Plague (drum: Cursed/Lost/Plague)
  brigands: 2, // Brigands (drum: Victory/Warriors/Brigands)
  safe: -1,
};

export const MOVE_EVENT_META: Record<
  MoveEventType,
  { label: string; tint: string; odds: string }
> = {
  lost: { label: "Lost", tint: "var(--dt-amber)", odds: "18.75% (3/16)" },
  dragon: { label: "Dragon", tint: "var(--dt-led)", odds: "12.5% (2/16)" },
  plague: { label: "Plague", tint: "#7fd07f", odds: "18.75% (3/16)" },
  brigands: { label: "Brigands", tint: "var(--dt-led)", odds: "18.75% (3/16)" },
  safe: { label: "Safe Travel", tint: "var(--dt-amber-glow)", odds: "31.25% (5/16)" },
};
