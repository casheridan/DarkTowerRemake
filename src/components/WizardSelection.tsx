import { motion } from "framer-motion";
import type { GameState } from "../engine";
import { dragonTake } from "../engine";
import { useGame } from "../store/useGame";
import { towerArtFrame } from "../ui/towerArt";
import type { TowerPresentation } from "../ui/presentation";
import { TowerArtwork } from "./TowerArtwork";
import "./WizardSelection.css";

export function WizardSelection({
  game,
  presentation,
}: {
  game: GameState;
  presentation: TowerPresentation;
}) {
  const dispatch = useGame((state) => state.dispatch);
  const selection = game.wizardSelection;
  if (!selection) return null;

  const targetId = selection.candidateIds[selection.index];
  const target = game.players.find((player) => player.id === targetId);
  if (!target) return null;

  const warriors = dragonTake(target.warriors);
  const gold = dragonTake(target.gold);

  return (
    <motion.div
      className="wizard-choice"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <h2 className="wizard-choice__title">Wizard’s Curse</h2>
      {presentation === "original" && (
        <TowerArtwork frame={towerArtFrame("wizard-bazaarclosed-keymissing", 0)} compact />
      )}
      <div className="wizard-choice__display" aria-label={`Curse player ${target.id + 1}`}>
        C–P{target.id + 1}
      </div>
      <p className="wizard-choice__target">Curse {target.name}?</p>
      <p className="wizard-choice__effect">
        Steal {warriors} {warriors === 1 ? "warrior" : "warriors"} and {gold} gold;
        {" "}{target.name} also loses their next turn.
      </p>
      <div className="wizard-choice__actions">
        <button onClick={() => dispatch({ type: "WIZARD_NEXT" })}>No / Next</button>
        <button
          className="wizard-choice__confirm"
          onClick={() => dispatch({ type: "WIZARD_CONFIRM" })}
        >
          Yes / Curse
        </button>
      </div>
      <button
        className="wizard-choice__cancel"
        onClick={() => dispatch({ type: "WIZARD_CANCEL" })}
      >
        Clear — release the Wizard
      </button>
    </motion.div>
  );
}
