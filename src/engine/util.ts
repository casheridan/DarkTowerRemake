/** Small immutable helpers for working with Player objects. */
import type { ItemType, Player } from "./types";

export function clonePlayer(p: Player): Player {
  return {
    ...p, // position is a string id, copied by the spread
    inventory: new Set(p.inventory),
    flags: { ...p.flags },
  };
}

export function hasItem(p: Player, item: ItemType): boolean {
  return p.inventory.has(item);
}

/** Returns a clone with the item added. */
export function withItem(p: Player, item: ItemType): Player {
  const next = clonePlayer(p);
  next.inventory.add(item);
  return next;
}

/** Returns a clone with the item removed. */
export function withoutItem(p: Player, item: ItemType): Player {
  const next = clonePlayer(p);
  next.inventory.delete(item);
  return next;
}

const KEYS: ItemType[] = ["brassKey", "silverKey", "goldKey"];

/** How many keys the player holds (0–3). */
export function keysFound(p: Player): number {
  return KEYS.filter((k) => p.inventory.has(k)).length;
}

/** The next key the player should acquire (brass → silver → gold), or null. */
export function nextKey(p: Player): ItemType | null {
  const n = keysFound(p);
  return n < KEYS.length ? KEYS[n] : null;
}

export function hasAllKeys(p: Player): boolean {
  return keysFound(p) === KEYS.length;
}
