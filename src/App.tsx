/** Top-level router: setup menu ↔ map editor ↔ game screen. */
import { Setup } from "./components/Setup";
import { GameScreen } from "./components/GameScreen";
import { MapEditor } from "./components/MapEditor";
import { useGame } from "./store/useGame";

export default function App() {
  const game = useGame((s) => s.game);
  const editing = useGame((s) => s.editing);
  if (editing) return <MapEditor />;
  return game ? <GameScreen /> : <Setup />;
}
