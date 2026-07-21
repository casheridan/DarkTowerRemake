/** Main play surface: board map + tower control panel + player HUD. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "./Board";
import { Tower } from "./Tower";
import { Hud } from "./Hud";
import { Combat } from "./Combat";
import { DarkTower } from "./DarkTower";
import { GameOver } from "./GameOver";
import { TurnBanner } from "./TurnBanner";
import { TombSequence } from "./TombSequence";
import { WizardSelection } from "./WizardSelection";
import { DragonPlacement } from "./DragonPlacement";
import { useSfx } from "../audio/useSfx";
import { preloadOriginalAudio } from "../audio/sfx";
import { preloadTowerArtwork } from "../ui/towerArt";
import { useGame } from "../store/useGame";
import "./GameScreen.css";

export function GameScreen() {
  const game = useGame((s) => s.game)!;
  const settings = useGame((s) => s.settings);
  const toggleOdds = useGame((s) => s.toggleOdds);
  const toggleMute = useGame((s) => s.toggleMute);
  const setTowerPresentation = useGame((s) => s.setTowerPresentation);
  const quit = useGame((s) => s.quitToMenu);
  const [originalAssetsReady, setOriginalAssetsReady] = useState(false);
  const [loadingOriginal, setLoadingOriginal] = useState(
    settings.towerPresentation === "original"
  );
  const presentationRequest = useRef(0);
  const effectivePresentation =
    settings.towerPresentation === "original" && !originalAssetsReady
      ? "clean"
      : settings.towerPresentation;

  useSfx(game, { ...settings, towerPresentation: effectivePresentation });

  const warmOriginal = useCallback(async () => {
    if (originalAssetsReady) return;
    await Promise.all([preloadTowerArtwork(), preloadOriginalAudio()]);
    setOriginalAssetsReady(true);
    setLoadingOriginal(false);
  }, [originalAssetsReady]);

  useEffect(() => {
    // Warm the archive after the first paint. Pointer/focus handlers below also
    // start it immediately if the player reaches the switch first.
    const begin = () => void warmOriginal();
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(begin, { timeout: 500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(begin, 0);
    return () => window.clearTimeout(id);
  }, [warmOriginal]);

  const chooseOriginal = () => {
    if (originalAssetsReady) {
      setTowerPresentation("original");
      return;
    }
    const request = ++presentationRequest.current;
    setLoadingOriginal(true);
    void warmOriginal().finally(() => {
      if (presentationRequest.current !== request) return;
      setLoadingOriginal(false);
      setTowerPresentation("original");
    });
  };

  const chooseClean = () => {
    presentationRequest.current += 1;
    setLoadingOriginal(false);
    setTowerPresentation("clean");
  };

  const towerPanel = game.phase === "combat" ? (
    <Combat game={game} presentation={effectivePresentation} />
  ) : game.phase === "dragonPlacement" ? (
    <DragonPlacement game={game} presentation={effectivePresentation} />
  ) : game.phase === "wizard" ? (
    <WizardSelection game={game} presentation={effectivePresentation} />
  ) : game.phase === "darkTower" ? (
    <DarkTower game={game} presentation={effectivePresentation} />
  ) : (
    <Tower
      game={game}
      showOdds={settings.showOdds}
      presentation={effectivePresentation}
    />
  );
  const sideContent = (
    <>
      {towerPanel}
      <Hud game={game} />
    </>
  );

  return (
    <div className="game">
      <header className="game__bar">
        <h1 className="game__logo">DARK TOWER</h1>
        <div className="game__bar-right">
          <div className="presentation-switch" role="group" aria-label="Tower presentation">
            <button
              className={`chip presentation-switch__choice ${
                effectivePresentation === "clean" ? "chip--on" : ""
              }`}
              onClick={chooseClean}
              title="Lightweight recreated display and synthesized tower sounds"
            >
              Clean
            </button>
            <button
              className={`chip presentation-switch__choice ${
                effectivePresentation === "original" ? "chip--on" : ""
              }`}
              onClick={chooseOriginal}
              onPointerEnter={() => void warmOriginal()}
              onFocus={() => void warmOriginal()}
              title="Original carousel scans and appliance recordings"
            >
              {loadingOriginal ? "Loading…" : "Original"}
            </button>
          </div>
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
          {game.lastEvent?.kind === "tomb" ? (
            <TombSequence
              event={game.lastEvent}
              presentation={effectivePresentation}
            >
              {sideContent}
            </TombSequence>
          ) : (
            sideContent
          )}
        </aside>
      </main>

      {game.phase === "gameOver" && (
        <GameOver game={game} presentation={effectivePresentation} />
      )}
      <TurnBanner game={game} />
    </div>
  );
}
