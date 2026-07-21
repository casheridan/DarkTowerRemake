import { motion } from "framer-motion";
import type { GameState } from "../engine";
import { towerArtFrame } from "../ui/towerArt";
import type { TowerPresentation } from "../ui/presentation";
import { TowerArtwork } from "./TowerArtwork";
import "./DragonPlacement.css";

export function DragonPlacement({
  game,
  presentation,
}: {
  game: GameState;
  presentation: TowerPresentation;
}) {
  const remaining = game.dragonPlacement?.candidateIds.length ?? 0;
  return (
    <motion.div
      className="dragon-place"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <h2 className="dragon-place__title">🐉 Place the Dragon</h2>
      {presentation === "original" && (
        <TowerArtwork frame={towerArtFrame("dragon-sword-pegasus", 0)} compact />
      )}
      <p className="dragon-place__intro">
        Choose a glowing empty territory without a building. No player may enter it until
        the Dragon attacks again and is moved.
      </p>
      <div className="dragon-place__count">{remaining} legal territories</div>
      <p className="dragon-place__hint">Select the destination directly on the board.</p>
    </motion.div>
  );
}
