/**
 * Resource economy — food consumption, starvation, stat clamping, and the
 * dragon's "take". All calibrated to `reference/darktower.asm`.
 */
import { MAX_STAT } from "./constants";

/** Clamp any stat to the hardware's 0–99 BCD range. */
export function clampStat(n: number): number {
  return Math.max(0, Math.min(MAX_STAT, Math.round(n)));
}

/**
 * Food consumed per turn (asm ~1648–1660):
 *   ≤15 warriors → 1, 16–30 → 2, 31–45 → 3, … i.e. ceil(warriors / 15).
 * Zero warriors consume nothing.
 */
export function foodConsumed(warriors: number): number {
  if (warriors <= 0) return 0;
  return Math.ceil(warriors / 15);
}

export interface FoodResult {
  food: number;
  warriors: number;
  consumed: number;
  starved: boolean;
  /** Low-food warning fires when remaining food < 4× consumption (asm L4EF). */
  lowFood: boolean;
}

/**
 * Apply end-of-turn food consumption (asm ~1648–1745).
 * If the party can't be fed, food is clamped to 0 and one warrior starves
 * (asm L4C0 subtracts exactly 1 warrior and plays the death march).
 */
export function applyFood(warriors: number, food: number): FoodResult {
  const consumed = foodConsumed(warriors);
  let newFood = food - consumed;
  let newWarriors = warriors;
  let starved = false;

  if (newFood < 0) {
    newFood = 0;
    newWarriors = clampStat(warriors - 1);
    starved = true;
  }

  const lowFood = !starved && newFood < consumed * 4;
  return {
    food: newFood,
    warriors: newWarriors,
    consumed,
    starved,
    lowFood,
  };
}

/**
 * Gold-carrying capacity (asm `L5BB` ~2027–2056): each warrior carries 6 bags,
 * and a Beast adds 50 — capped at the hardware's 99. Gold beyond what your
 * warriors can carry is left behind (checked as the turn is processed).
 */
export function goldCapacity(warriors: number, hasBeast: boolean): number {
  return Math.min(MAX_STAT, warriors * 6 + (hasBeast ? 50 : 0));
}

/**
 * How much of a resource the dragon takes (asm `L6C0`, ~2450). The ROM
 * approximates one-quarter of the value via per-digit bit math; the manual and
 * the disassembly comment both state the intent plainly: the dragon takes ¼ of
 * the player's warriors and ¼ of their gold.
 */
export function dragonTake(value: number): number {
  return Math.floor(value / 4);
}
