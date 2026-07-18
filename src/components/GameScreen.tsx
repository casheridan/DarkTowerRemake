/** Main play surface: board map + tower control panel + player HUD. */
import { Board } from "./Board";
import { Tower } from "./Tower";
import { Hud } from "./Hud";
import { Combat } from "./Combat";
import { DarkTower } from "./DarkTower";
import { GameOver } from "./GameOver";
import { TurnBanner } from "./TurnBanner";
import { useSfx } from "../audio/useSfx";
import { useGame } from "../store/useGame";
import "./GameScreen.css";

export function GameScreen() {
  const game = useGame((s) => s.game)!;
  const settings = useGame((s) => s.settings);
  const toggleOdds = useGame((s) => s.toggleOdds);
  const toggleMute = useGame((s) => s.toggleMute);
  const quit = useGame((s) => s.quitToMenu);

  useSfx(game, settings);

  return (
    <div className="game">
      <header className="game__bar">
        <h1 className="game__logo">DARK TOWER</h1>
        <div className="game__bar-right">
          <button
            className={`chip ${settings.showOdds ? "chip--on" : ""}`}
            onClick={toggleOdds}
            title="Reveal the exact disassembly-derived odds"
          >
            🎲 Odds
          </button>
          <button className="chip" onClick={toggleMute} title="Mute / unmute">
            {settings.muted ? "🔇" : "🔊"}
          </button>
          <button className="chip" onClick={quit} title="Quit to menu">
            ⏻ Menu
          </button>
        </div>
      </header>

      <main className="game__main">
        <section className="game__board">
          <Board game={game} />
        </section>
        <aside className="game__side">
          {game.phase === "combat" ? (
            <Combat game={game} />
          ) : game.phase === "darkTower" ? (
            <DarkTower game={game} />
          ) : (
            <Tower game={game} showOdds={settings.showOdds} />
          )}
          <Hud game={game} />
        </aside>
      </main>

      {game.phase === "gameOver" && <GameOver game={game} />}
      <TurnBanner game={game} />
    </div>
  );
}
