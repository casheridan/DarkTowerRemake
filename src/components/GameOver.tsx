/** Victory screen shown when a player conquers the Dark Tower. */
import { motion } from "framer-motion";
import { KINGDOM_ORDER, type GameState } from "../engine";
import { KINGDOM_META } from "../ui/labels";
import { towerArtFrame } from "../ui/towerArt";
import type { TowerPresentation } from "../ui/presentation";
import { useGame } from "../store/useGame";
import { TowerArtwork } from "./TowerArtwork";
import "./GameOver.css";

export function GameOver({
  game,
  presentation,
}: {
  game: GameState;
  presentation: TowerPresentation;
}) {
  const newGameQuit = useGame((s) => s.quitToMenu);
  const winner = game.players.find((p) => p.id === game.winnerId);
  const defeated = !winner;
  const fallen = game.players[game.currentPlayerIndex];
  const displayFrame = defeated
    ? towerArtFrame("victory-warriors-brigands", 1)
    : towerArtFrame("victory-warriors-brigands", 0);

  return (
    <div className={`over ${defeated ? "over--defeat" : ""}`}>
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
          {defeated ? "☠️" : "👑"}
        </motion.div>
        <h1 className="over__title">{defeated ? "DEFEAT" : "VICTORY"}</h1>
        {presentation === "original" && (
          <TowerArtwork frame={displayFrame} dimmed={defeated} />
        )}
        {winner && (
          <p className="over__winner">
            <span
              className="over__crest"
              style={{ background: `var(${KINGDOM_META[KINGDOM_ORDER[winner.id]].colorVar})` }}
            />
            {winner.name} has conquered the Dark Tower!
          </p>
        )}
        {defeated ? (
          <>
            <p className="over__winner">{fallen.name}'s last warrior has fallen.</p>
            <p className="over__sub">The quest ends with a score of 00.</p>
          </>
        ) : (
          <>
            <div className="over__score" aria-label={`Final score ${winner?.score ?? 0}`}>
              {String(winner?.score ?? 0).padStart(2, "0")}
            </div>
            <p className="over__sub">
              Final score · {winner?.turnsTaken ?? 0} completed{" "}
              {winner?.turnsTaken === 1 ? "turn" : "turns"}
            </p>
          </>
        )}
        <button className="over__again" onClick={newGameQuit}>
          New Quest
        </button>
      </motion.div>
    </div>
  );
}
