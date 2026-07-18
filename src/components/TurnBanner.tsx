/** Brief "whose turn" banner for hotseat play (multiplayer only). */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { KINGDOM_ORDER, type GameState } from "../engine";
import { KINGDOM_META } from "../ui/labels";
import "./TurnBanner.css";

export function TurnBanner({ game }: { game: GameState }) {
  const [visible, setVisible] = useState(false);
  const prev = useRef(game.currentPlayerIndex);

  useEffect(() => {
    if (game.players.length < 2) return;
    if (game.currentPlayerIndex !== prev.current) {
      prev.current = game.currentPlayerIndex;
      if (game.phase === "playing") {
        setVisible(true);
        const t = setTimeout(() => setVisible(false), 1500);
        return () => clearTimeout(t);
      }
    }
  }, [game.currentPlayerIndex, game.phase, game.players.length]);

  const player = game.players[game.currentPlayerIndex];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="turn-banner"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -30 }}
        >
          <span
            className="turn-banner__crest"
            style={{ background: `var(${KINGDOM_META[KINGDOM_ORDER[player.id]].colorVar})` }}
          />
          <span className="turn-banner__text">{player.name}&rsquo;s turn</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
