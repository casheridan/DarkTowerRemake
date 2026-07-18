/** Plays sound effects in response to game-state changes. */
import { useEffect, useRef } from "react";
import type { GameState } from "../engine";
import { sfx, setMuted } from "./sfx";
import type { Settings } from "../store/useGame";

export function useSfx(game: GameState | null, settings: Settings) {
  useEffect(() => setMuted(settings.muted), [settings.muted]);

  // Encounter / action sounds — fire once per resolved event.
  const lastEvent = game?.lastEvent ?? null;
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.itemsGained?.some((i) => i.endsWith("Key"))) {
      sfx.key();
      return;
    }
    if (lastEvent.moveEvent) {
      sfx[lastEvent.moveEvent]?.();
      return;
    }
    switch (lastEvent.kind) {
      case "sanctuary":
        sfx.gold();
        break;
      case "tomb":
        sfx.gold();
        break;
      case "bazaar":
        sfx.lost();
        break; // bazaar closed
      case "darkTower":
        sfx.key();
        break;
      default:
        sfx.move();
    }
  }, [lastEvent]);

  // Per-round combat beeps.
  const roundCount = game?.combat?.rounds.length ?? 0;
  const prevRounds = useRef(0);
  useEffect(() => {
    if (!game?.combat) {
      prevRounds.current = 0;
      return;
    }
    if (roundCount > prevRounds.current) {
      const last = game.combat.rounds[roundCount - 1];
      if (last) (last.playerWonRound ? sfx.winRound : sfx.loseRound)();
    }
    prevRounds.current = roundCount;
  }, [roundCount, game?.combat]);

  // Tower battle fanfare on entry.
  const towerStage = game?.towerStage ?? null;
  useEffect(() => {
    if (towerStage === "battle") sfx.brigands();
  }, [towerStage]);

  // Combat end + game end.
  const phase = game?.phase;
  const combatOver = game?.combat?.over ?? false;
  const playerWon = game?.combat?.playerWon ?? null;
  useEffect(() => {
    if (phase === "gameOver") sfx.victory();
  }, [phase]);
  useEffect(() => {
    if (combatOver && playerWon === false) sfx.defeat();
  }, [combatOver, playerWon]);
}
