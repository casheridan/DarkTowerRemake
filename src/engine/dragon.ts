import { BOARD } from "./board";
import type { GameState } from "./types";

/**
 * The physical Dragon pawn may occupy only an empty, ordinary territory: no
 * building, frontier, Dark Tower space, or player pawn.
 */
export function isLegalDragonTerritory(state: GameState, id: string): boolean {
  const territory = BOARD.territories[id];
  if (
    !territory ||
    territory.lane ||
    territory.building ||
    territory.darkTowerRegion ||
    territory.polygon.length === 0
  ) {
    return false;
  }
  return !state.players.some((player) => player.alive && player.position === id);
}

/** Every territory offered after the Dragon strikes, excluding its old lair. */
export function dragonPlacementTerritories(state: GameState): string[] {
  return BOARD.order.filter(
    (id) => id !== state.dragonPosition && isLegalDragonTerritory(state, id)
  );
}

export function isDragonBlocked(state: GameState, id: string): boolean {
  return state.dragonPosition === id;
}
