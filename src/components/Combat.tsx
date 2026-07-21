/** Animated brigand / Tower battle: auto-counts off rounds, with a retreat option. */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { mustRetreat, type GameState } from "../engine";
import { useGame } from "../store/useGame";
import { towerArtFrame } from "../ui/towerArt";
import { combatCueSeconds, combatStepDelayMs } from "../ui/combatTiming";
import type { TowerPresentation } from "../ui/presentation";
import { TowerArtwork } from "./TowerArtwork";
import "./Combat.css";

export function Combat({
  game,
  presentation,
}: {
  game: GameState;
  presentation: TowerPresentation;
}) {
  const dispatch = useGame((s) => s.dispatch);
  const combat = game.combat;
  const [resultReady, setResultReady] = useState(() => combat?.over ?? false);
  const observedRoundCount = useRef(combat?.rounds.length ?? 0);

  // The engine result, counter animation, and hit cue all begin on the same
  // render. Only the final message waits, so it cannot cut off the last cue.
  useEffect(() => {
    if (!combat) return;
    const roundCount = combat.rounds.length;
    const resolvedNewRound = roundCount > observedRoundCount.current;
    observedRoundCount.current = Math.max(observedRoundCount.current, roundCount);

    if (!combat.over) {
      setResultReady(false);
      return;
    }

    // Retreats do not generate a round cue and may settle immediately.
    if (!resolvedNewRound) {
      setResultReady(true);
      return;
    }

    setResultReady(false);
    const lastRound = combat.rounds[roundCount - 1];
    const reveal = window.setTimeout(
      () => setResultReady(true),
      Math.round(combatCueSeconds(lastRound) * 1000)
    );
    return () => window.clearTimeout(reveal);
  }, [combat]);

  // Let every monophonic cue finish, hold its updated counter for a readable
  // beat, and only then resolve the following round.
  useEffect(() => {
    if (!combat || combat.over) return;
    const forced = mustRetreat(combat, game.players.length);
    const lastRound = combat.rounds[combat.rounds.length - 1];
    const t = setTimeout(() => {
      dispatch(forced ? { type: "COMBAT_RETREAT" } : { type: "COMBAT_ROUND" });
    }, combatStepDelayMs(lastRound));
    return () => clearTimeout(t);
  }, [combat, game.players.length, dispatch]);

  if (!combat) return null;
  const isTower = combat.source === "tower";
  const last = combat.rounds[combat.rounds.length - 1];
  const displayFrame =
    isTower && combat.over && combat.playerWon
      ? towerArtFrame("victory-warriors-brigands", 0)
      : towerArtFrame("victory-warriors-brigands", 2);

  return (
    <div className={`combat ${isTower ? "combat--tower" : ""}`}>
      <h2 className="combat__title">{isTower ? "⚔️ The Final Battle" : "⚔️ Brigands!"}</h2>
      {presentation === "original" && <TowerArtwork frame={displayFrame} compact />}

      <div className="combat__scoreboard">
        <Side label="Your Warriors" value={combat.warriorsRemaining} tint="var(--dt-gold)" />
        <div className="combat__vs">VS</div>
        <Side label="Brigands" value={combat.brigandsRemaining} tint="var(--dt-led)" />
      </div>

      <AnimatePresence mode="wait">
        {last && (
          <motion.div
            key={last.round}
            className={`combat__round ${last.playerWonRound ? "win" : "lose"}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            Round {last.round}: {last.playerWonRound ? "You drive them back!" : "They break your line — a warrior falls."}
          </motion.div>
        )}
      </AnimatePresence>

      {!combat.over || !resultReady ? (
        <div className="combat__actions">
          <span className="combat__fighting">
            {combat.over ? "Resolving…" : "⚔ Fighting…"}
          </span>
          {!combat.over && (
            <button className="combat__retreat" onClick={() => dispatch({ type: "COMBAT_RETREAT" })}>
              Retreat (−1 warrior)
            </button>
          )}
        </div>
      ) : (
        <motion.div
          className="combat__result"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className={combat.playerWon ? "combat__win-msg" : "combat__lose-msg"}>
            {combat.playerWon
              ? isTower
                ? "The Dark Tower falls — VICTORY!"
                : "The brigands are routed!"
              : isTower
                ? "The Tower's defenders hold. Regroup and return."
                : "Your party is driven off."}
          </p>
          <button className="combat__continue" onClick={() => dispatch({ type: "COMBAT_END" })}>
            Continue ▸
          </button>
        </motion.div>
      )}
    </div>
  );
}

function Side({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div className="combat__side">
      <motion.div
        key={value}
        className="combat__num"
        style={{ color: tint }}
        initial={{ scale: 1.5 }}
        animate={{ scale: 1 }}
      >
        {value}
      </motion.div>
      <div className="combat__label">{label}</div>
    </div>
  );
}
