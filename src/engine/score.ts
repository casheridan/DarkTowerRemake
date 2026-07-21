/**
 * Final score translated from the ROM's LFFF routine (~5490). The tower starts
 * with 176 plus its defender count and a coarse quarter-weight, then subtracts
 * eight points for every completed turn and every warrior brought to the final
 * assault. Results outside the two-digit display are clamped to 00–99.
 */

/** L6C0's original BCD weighting (also used for Dragon/Wizard losses). */
export function romQuarterWeight(value: number): number {
  const amount = Math.max(0, Math.min(99, Math.floor(value)));
  const tens = Math.floor(amount / 10);
  const ones = amount % 10;
  const digitWeight = (digit: number) => (digit >= 8 ? 3 : digit >= 4 ? 1 : 0);

  let weighted = digitWeight(ones);
  if ((tens & 1) !== 0) weighted += 2;
  if ((tens & 2) !== 0) weighted += 5;
  weighted += digitWeight(tens) * 10;
  return weighted;
}

export interface ScoreInput {
  towerBrigands: number;
  /** Completed turns before the winning Dark Tower attempt. */
  turnsTaken: number;
  /** Warriors present when the final battle began, before casualties. */
  warriorsAtTower: number;
}

export function calculateScore({ towerBrigands, turnsTaken, warriorsAtTower }: ScoreInput): number {
  const base = 176 + towerBrigands + romQuarterWeight(towerBrigands);
  const penalty = 8 * (Math.max(0, turnsTaken) + Math.max(0, warriorsAtTower));
  return Math.max(0, Math.min(99, base - penalty));
}
