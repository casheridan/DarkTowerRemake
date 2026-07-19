/** Keyboard positions matching the Tower's physical 3×4 keypad, row by row. */
export const TOWER_SHORTCUTS = [
  "1", "2", "3",
  "q", "w", "e",
  "a", "s", "d",
  "z", "x", "c",
] as const;

export const TOWER_SHORTCUT_LABELS = [
  "Yes / Buy", "Repeat", "No / End",
  "Haggle", "Bazaar", "Clear",
  "Tomb / Ruin", "Move", "Citadel / Sanctuary",
  "Dark Tower", "Frontier", "Inventory",
] as const;

export function towerShortcutIndex(key: string): number {
  return TOWER_SHORTCUTS.indexOf(
    key.toLowerCase() as (typeof TOWER_SHORTCUTS)[number]
  );
}
