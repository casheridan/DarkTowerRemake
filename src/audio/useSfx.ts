/** Plays original-unit captures (with synthesized fallbacks) from game state. */
import { useEffect, useRef } from "react";
import type { EventResult, GameState } from "../engine";
import {
  CLEAN_CUE_SECONDS,
  sfx,
  setMuted,
  setSfxPresentation,
  type SfxName,
} from "./sfx";
import type { Settings } from "../store/useGame";

/** Pure event-to-cue mapping, exported so the routing can be regression-tested. */
export function eventSfxName(event: EventResult): SfxName | null {
  if (event.itemsGained?.includes("pegasus")) return "pegasus";
  if (event.itemsGained?.some((item) => item.endsWith("Key"))) return "key";

  switch (event.moveEvent) {
    case "dragon":
      return (event.deltas?.gold ?? 0) > 0 || (event.deltas?.warriors ?? 0) > 0
        ? "dragonKill"
        : "dragon";
    case "plague":
      // The appliance plays the Plague cue even when a Healer reverses the loss.
      return "plague";
    case "lost":
      return "lost";
    case "brigands":
      return event.kind === "tomb" ? "tombBattle" : "brigands";
    case "safe":
      return "safe";
  }

  const message = event.messages.join(" ").toLowerCase();
  switch (event.kind) {
    case "sanctuary":
      return "sanctuary";
    case "tomb":
      if (message.includes("empty") || message.includes("nothing")) return "tombNothing";
      return (event.deltas?.gold ?? 0) > 0 ? "gold" : "move";
    case "combat":
      return (event.deltas?.gold ?? 0) > 0 ? "gold" : "move";
    case "bazaar":
      return event.purchase ? null : "bazaarClosed";
    case "frontier":
      return event.drum === "wizard-bazaarclosed-keymissing" ? "keyMissing" : "frontier";
    case "starvation":
      return "starving";
    case "darkTower":
      if (message.includes("wrong") || message.includes("reject")) return "keyMissing";
      if (message.includes("opens") || message.includes("to battle")) return null;
      return "key";
    case "move":
    default:
      return "move";
  }
}

/** Replay the complete appliance cue for the Tower's Repeat key. */
export function playEventSfx(event: EventResult): void {
  const cue = eventSfxName(event);
  if (cue) sfx[cue]();
}

/** Reveal cue after a Tomb/Ruin's door suspense has completed. */
export function playTombRevealSfx(event: EventResult): void {
  const cue = eventSfxName(event);
  if (cue && cue !== "tombBattle" && cue !== "tombNothing") sfx[cue]();
}

export function useSfx(game: GameState | null, settings: Settings) {
  useEffect(() => setMuted(settings.muted), [settings.muted]);
  useEffect(
    () => setSfxPresentation(settings.towerPresentation),
    [settings.towerPresentation]
  );

  // The physical unit ticks on every valid panel press. Clear has its own
  // distinctive hi/lo cue; SVG territories receive the same panel tick.
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const button = target.closest("button");
      const territory = target.closest(
        ".terr--reach, .terr--flight, .terr--dragon-target, .board__tower-group--ready"
      );
      if (!button && !territory) return;
      if (button && (button as HTMLButtonElement).disabled) return;
      const label = button?.textContent?.trim().toLowerCase() ?? "";
      (label.includes("clear") || label.includes("cancel pegasus") ? sfx.clear : sfx.click)();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const phase = game?.phase ?? null;
  const lastEvent = game?.lastEvent ?? null;
  const combat = game?.combat ?? null;
  const combatIntroUntil = useRef(0);

  // Resolved event sounds. Game-over owns its cue so a fatal event does not
  // play two recordings at the same time.
  useEffect(() => {
    if (!lastEvent || phase === "gameOver") return;
    if (lastEvent.kind === "tomb") {
      const message = lastEvent.messages.join(" ").toLowerCase();
      if (message.includes("empty") || message.includes("nothing")) sfx.tombNothing();
      else sfx.tombDoor();
      return;
    }
    playEventSfx(lastEvent);
  }, [lastEvent, phase]);

  // Phase-entry sounds cover actions that intentionally do not create an
  // EventResult (entering the Bazaar and first opening the Dark Tower).
  const previousPhase = useRef(phase);
  useEffect(() => {
    const previous = previousPhase.current;
    if (phase === previous) return;

    if (phase === "bazaar") {
      sfx.bazaar();
    } else if (phase === "darkTower") {
      sfx.darkTower();
    } else if (phase === "combat") {
      const isTombBattle = lastEvent?.kind === "tomb";
      const introSeconds = isTombBattle
        ? CLEAN_CUE_SECONDS.tombDoor + CLEAN_CUE_SECONDS.battle
        : CLEAN_CUE_SECONDS.battle;
      combatIntroUntil.current = Date.now() + introSeconds * 1000;
      // Roadside and tomb combat already received their cue via lastEvent.
      if (combat?.source === "tower") sfx.brigands();
    } else if (phase === "gameOver") {
      (game?.winnerId === null ? sfx.defeat : sfx.victory)();
    }

    previousPhase.current = phase;
  }, [phase, lastEvent, combat?.source, game?.winnerId]);

  // Per-round hit sounds. Let the original battle/tomb intro finish first;
  // the appliance itself was monophonic and never layered these cues.
  const roundCount = combat?.rounds.length ?? 0;
  const previousRounds = useRef(0);
  useEffect(() => {
    if (!combat) {
      previousRounds.current = 0;
      return;
    }
    if (roundCount > previousRounds.current && Date.now() >= combatIntroUntil.current) {
      const last = combat.rounds[roundCount - 1];
      if (last) (last.playerWonRound ? sfx.winRound : sfx.loseRound)();
    }
    previousRounds.current = roundCount;
  }, [roundCount, combat]);

  // Turn hand-off cues also cover actions that finish without an encounter,
  // notably Rest and Pegasus flight. Starvation and flight get their specific
  // original-unit captures instead of the generic end-turn chirp.
  const turnOwner = game ? `${game.turn}:${game.currentPlayerIndex}` : null;
  const logLength = game?.log.length ?? 0;
  const turnSnapshot = useRef({ owner: turnOwner, logLength });
  useEffect(() => {
    const previous = turnSnapshot.current;
    if (game && previous.owner && turnOwner !== previous.owner && phase !== "gameOver") {
      const recent = game.log.slice(Math.min(previous.logLength, game.log.length));
      const text = recent.map((entry) => entry.text).join(" ").toLowerCase();
      if (text.includes("pegasus lands")) sfx.pegasus();
      else if (text.includes("starves") || text.includes("provisions run dry")) sfx.starving();
      else sfx.endTurn();
    }
    turnSnapshot.current = { owner: turnOwner, logLength };
  }, [turnOwner, logLength, phase, game]);
}
