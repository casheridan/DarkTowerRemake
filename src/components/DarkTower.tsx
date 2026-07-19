/**
 * The Riddle of the Keys — guess the Tower's secret key order one lock at a time
 * (asm ~3691). A correct key advances to the next lock; a wrong one casts you
 * out and ends your turn. Get the first two right and the third is automatic.
 */
import { motion } from "framer-motion";
import type { GameState, KeyType } from "../engine";
import { ITEM_META, KEY_TINT } from "../ui/labels";
import { itemArtFrame } from "../ui/towerArt";
import type { TowerPresentation } from "../ui/presentation";
import { useGame } from "../store/useGame";
import "./DarkTower.css";

const KEYS: KeyType[] = ["brassKey", "silverKey", "goldKey"];
const tint = (k: KeyType) => KEY_TINT[k as keyof typeof KEY_TINT];

export function DarkTower({
  game,
  presentation,
}: {
  game: GameState;
  presentation: TowerPresentation;
}) {
  const dispatch = useGame((s) => s.dispatch);
  const step = game.riddleStep;
  const placed = game.keyRiddleOrder.slice(0, step); // locks you've already opened
  const candidates = KEYS.filter((k) => !placed.includes(k));
  const feedback = game.lastEvent?.kind === "darkTower" ? game.lastEvent.messages[0] : null;

  return (
    <motion.div className="riddle" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
      <h2 className="riddle__title">🗼 The Riddle of the Keys</h2>
      <p className="riddle__intro">
        Open the locks in the Tower's secret order, one key at a time. A wrong key and the
        Tower casts you out — your turn ends. Get the first two right and the last is forced.
      </p>

      <div className="riddle__slots">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`riddle__slot ${i === step ? "riddle__slot--active" : ""} ${
              i > 1 ? "riddle__slot--auto" : ""
            }`}
          >
            {i < step ? (
              <span style={{ color: tint(placed[i]) }}>🗝</span>
            ) : i === step ? (
              <span className="riddle__slot-q">?</span>
            ) : i > 1 ? (
              <span className="riddle__slot-empty">auto</span>
            ) : (
              <span className="riddle__slot-empty">{i + 1}</span>
            )}
          </div>
        ))}
      </div>

      <p className="riddle__prompt">Which key opens lock {step + 1}?</p>

      <div className="riddle__keys">
        {candidates.map((k) => (
          <button
            key={k}
            className="riddle__key"
            onClick={() => dispatch({ type: "GUESS_KEY", key: k })}
            style={{ borderColor: tint(k) }}
          >
            {presentation === "original" ? (
              <img
                className="riddle__key-art"
                src={itemArtFrame(k)?.src}
                alt=""
                draggable={false}
                decoding="async"
              />
            ) : (
              <span className="riddle__key-symbol" aria-hidden="true">🗝</span>
            )}
            <span>{ITEM_META[k].label}</span>
          </button>
        ))}
      </div>

      {feedback && <div className="riddle__feedback">{feedback}</div>}

      <button className="riddle__leave" onClick={() => dispatch({ type: "LEAVE_TOWER" })}>
        Retreat from the Tower
      </button>
    </motion.div>
  );
}
