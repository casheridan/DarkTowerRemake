/** Animated brigand / Tower battle: auto-counts off rounds, with a retreat option. */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { mustRetreat, type GameState } from "../engine";
import { useGame } from "../store/useGame";
import { CLEAN_CUE_SECONDS } from "../audio/sfx";
import { towerArtFrame } from "../ui/towerArt";
import type { TowerPresentation } from "../ui/presentation";
import { TowerArtwork } from "./TowerArtwork";
import "./Combat.css";

/** Brief silent beat after a counter lands, before the next round begins. */
export const COMBAT_ROUND_PADDING_MS = 180;

export function Combat({
  game,
  presentation,
}: {
  game: GameState;
  presentation: TowerPresentation;
}) {
  const dispatch = useGame((s) => s.dispatch);
  const combat = game.combat;
  const [displayedWarriors, setDisplayedWarriors] = useState(
    () => combat?.warriorsRemaining ?? 0
  );
  const [displayedBrigands, setDisplayedBrigands] = useState(
    () => combat?.brigandsRemaining ?? 0
  );
  const [displayedRoundCount, setDisplayedRoundCount] = useState(
    () => combat?.rounds.length ?? 0
  );
  const observedRoundCount = useRef(combat?.rounds.length ?? 0);

  // A resolved engine round starts its side-specific hit cue immediately. Hold
  // the old score on screen until that complete cue has played, then animate
  // only the side that was hit. Retreats have no round cue and update directly.
  useEffect(() => {
    if (!combat) return;
    const roundCount = combat.rounds.length;
    if (roundCount <= observedRoundCount.current) {
      setDisplayedWarriors(combat.warriorsRemaining);
      setDisplayedBrigands(combat.brigandsRemaining);
      setDisplayedRoundCount(roundCount);
      return;
    }

    observedRoundCount.current = roundCount;
    const lastRound = combat.rounds[roundCount - 1];
    const cueSeconds = lastRound.playerWonRound
      ? CLEAN_CUE_SECONDS.winRound
      : CLEAN_CUE_SECONDS.loseRound;
    const reveal = window.setTimeout(() => {
      setDisplayedWarriors(combat.warriorsRemaining);
      setDisplayedBrigands(combat.brigandsRemaining);
      setDisplayedRoundCount(roundCount);
    }, cueSeconds * 1000);
    return () => window.clearTimeout(reveal);
  }, [combat]);

  // Let every monophonic cue finish. The counter then lands, holds for a short
  // beat, and only then does the engine resolve the following round.
  useEffect(() => {
    if (!combat || combat.over) return;
    const forced = mustRetreat(combat, game.players.length);
    const lastRound = combat.rounds[combat.rounds.length - 1];
    const cueSeconds = !lastRound
      ? CLEAN_CUE_SECONDS.battle
      : lastRound.playerWonRound
        ? CLEAN_CUE_SECONDS.winRound
        : CLEAN_CUE_SECONDS.loseRound;
    const t = setTimeout(() => {
      dispatch(forced ? { type: "COMBAT_RETREAT" } : { type: "COMBAT_ROUND" });
    }, cueSeconds * 1000 + COMBAT_ROUND_PADDING_MS);
    return () => clearTimeout(t);
  }, [combat, game.players.length, dispatch]);

  if (!combat) return null;
  const isTower = combat.source === "tower";
  const last = combat.rounds[combat.rounds.length - 1];
  const scoreSettled = displayedRoundCount >= combat.rounds.length;
  const displayFrame =
    isTower && combat.over && combat.playerWon
      ? towerArtFrame("victory-warriors-brigands", 0)
      : towerArtFrame("victory-warriors-brigands", 2);

  return (
    <div className={`combat ${isTower ? "combat--tower" : ""}`}>
      <h2 className="combat__title">{isTower ? "⚔️ The Final Battle" : "⚔️ Brigands!"}</h2>
      {presentation === "original" && <TowerArtwork frame={displayFrame} compact />}

      <div className="combat__scoreboard">
        <Side label="Your Warriors" value={displayedWarriors} tint="var(--dt-gold)" />
        <div className="combat__vs">VS</div>
        <Side label="Brigands" value={displayedBrigands} tint="var(--dt-led)" />
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

      {!combat.over || !scoreSettled ? (
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
