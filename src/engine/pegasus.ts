/**
 * Pegasus movement.
 *
 * The physical game tracks this reward with a token rather than in the tower's
 * RAM. It is discarded after one flight. Selecting a legal territory lands the
 * pawn there and consumes the turn; any building action waits until that
 * player's following turn.
 */
import { BOARD, isLane, kingdomOf, neighborsOf } from "./board";
import { nextKingdom } from "./constants";
import type { Player } from "./types";
import { clonePlayer, hasAllKeys } from "./util";

export type PegasusDestinationKind = "current" | "next";

/** Return whether a territory is a legal current/next-kingdom flight target. */
export function pegasusDestinationKind(
  player: Player,
  to: string
): PegasusDestinationKind | null {
  if (!player.inventory.has("pegasus") || to === player.position || isLane(to)) return null;
  const territory = BOARD.territories[to];
  if (!territory) return null;

  // As in normal movement, a player may never enter another ruler's Citadel.
  if (territory.building === "citadel" && territory.kingdom !== player.home) return null;

  if (territory.kingdom === player.lastKingdom) return "current";
  const mayLeave = !player.flags.regionKeyAvailable || hasAllKeys(player);
  if (mayLeave && territory.kingdom === nextKingdom(player.lastKingdom)) return "next";
  return null;
}

/** Every territory currently selectable after pressing the Pegasus control. */
export function pegasusDestinations(player: Player): string[] {
  return BOARD.order.filter((id) => {
    const kind = pegasusDestinationKind(player, id);
    if (!kind) return false;
    return kind === "current" || pegasusFrontierFor(player, id) !== null;
  });
}

/** Find the permanent frontier connecting the current and selected kingdoms. */
export function pegasusFrontierFor(player: Player, to: string): string | null {
  if (pegasusDestinationKind(player, to) !== "next") return null;
  const destinationKingdom = kingdomOf(to);
  if (isLane(player.position)) {
    const kingdoms = new Set(
      neighborsOf(player.position)
        .filter((neighbor) => !isLane(neighbor))
        .map(kingdomOf)
    );
    return kingdoms.has(player.lastKingdom) && kingdoms.has(destinationKingdom)
      ? player.position
      : null;
  }
  return (
    BOARD.order.find((id) => {
      if (!isLane(id)) return false;
      const kingdoms = new Set(
        neighborsOf(id)
          .filter((neighbor) => !isLane(neighbor))
          .map(kingdomOf)
      );
      return kingdoms.has(player.lastKingdom) && kingdoms.has(destinationKingdom);
    }) ?? null
  );
}

/** Land a legal flight, consume its token, and update kingdom progress. */
export function landPegasus(player: Player, to: string): Player | null {
  const kind = pegasusDestinationKind(player, to);
  if (!kind || (kind === "next" && !pegasusFrontierFor(player, to))) return null;

  const moved = clonePlayer(player);
  moved.position = to;
  moved.inventory.delete("pegasus");
  if (kind === "next") {
    moved.previousKingdom = player.lastKingdom;
    moved.lastKingdom = kingdomOf(to);
    moved.flags.regionKeyAvailable = !hasAllKeys(player);
    moved.flags.citadelVisited = false;
  }
  return moved;
}
