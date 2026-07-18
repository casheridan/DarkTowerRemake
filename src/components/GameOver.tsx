/** Victory screen shown when a player conquers the Dark Tower. */
import { motion } from "framer-motion";
import { KINGDOM_ORDER, type GameState } from "../engine";
import { KINGDOM_META } from "../ui/labels";
import { useGame } from "../store/useGame";
import "./GameOver.css";

export function GameOver({ game }: { game: GameState }) {
  const newGameQuit = useGame((s) => s.quitToMenu);
  const winner = game.players.find((p) => p.id === game.winnerId);

  return (
    <div className="over">
      <motion.div
        className="over__card"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 140, damping: 16 }}
      >
        <motion.div
          className="over__crown"
          animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.15, 1] }}
          transition={{ repeat: Infinity, duration: 2.5 }}
        >
          👑
        </motion.div>
        <h1 className="over__title">VICTORY</h1>
        {winner && (
          <p className="over__winner">
            <span
              className="over__crest"
              style={{ background: `var(${KINGDOM_META[KINGDOM_ORDER[winner.id]].colorVar})` }}
            />
            {winner.name} has conquered the Dark Tower!
          </p>
        )}
        <p className="over__sub">
          The evil is vanquished and the realm is saved after {game.turn}{" "}
          {game.turn === 1 ? "turn" : "turns"}.
        </p>
        <button className="over__again" onClick={newGameQuit}>
          New Quest
        </button>
      </motion.div>
    </div>
  );
}
