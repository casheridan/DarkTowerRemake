/** Animated brigand / Tower battle: auto-counts off rounds, with a retreat option. */
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { mustRetreat, type GameState } from "../engine";
import { useGame } from "../store/useGame";
import "./Combat.css";

export function Combat({ game }: { game: GameState }) {
  const dispatch = useGame((s) => s.dispatch);
  const combat = game.combat;

  // Auto-play the count-off, ~700ms per round, until the battle ends.
  useEffect(() => {
    if (!combat || combat.over) return;
    const forced = mustRetreat(combat, game.players.length);
    const t = setTimeout(() => {
      dispatch(forced ? { type: "COMBAT_RETREAT" } : { type: "COMBAT_ROUND" });
    }, 700);
    return () => clearTimeout(t);
  }, [combat, game.players.length, dispatch]);

  if (!combat) return null;
  const isTower = combat.source === "tower";
  const last = combat.rounds[combat.rounds.length - 1];

  return (
    <div className={`combat ${isTower ? "combat--tower" : ""}`}>
      <h2 className="combat__title">{isTower ? "⚔️ The Final Battle" : "⚔️ Brigands!"}</h2>

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

      {!combat.over ? (
        <div className="combat__actions">
          <span className="combat__fighting">⚔ Fighting…</span>
          <button className="combat__retreat" onClick={() => dispatch({ type: "COMBAT_RETREAT" })}>
            Retreat (−1 warrior)
          </button>
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
