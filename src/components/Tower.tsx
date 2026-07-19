/**
 * The Tower control panel — the 1981 unit's electronics: a drum/LED window plus
 * the authentic 3×4, 12-key keypad (asm ~679):
 *
 *   Yes/Buy      Repeat     No/End
 *   Haggle       Bazaar     Clear
 *   Tomb/Ruin    Move       Sanctuary/Citadel
 *   Dark Tower   Frontier   Inventory
 *
 * Keys light up only when they apply. Tap a territory on the board to select it,
 * then press Move / a building / Frontier to act there. No/End completes your
 * turn (and drives the bazaar). Combat and the Tower's riddle use their own
 * panels. There is no "rest" — you take an action, then No/End to pass along.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { playEventSfx } from "../audio/useSfx";
import {
  buildingOf,
  currentWare,
  hasAllKeys,
  isCrossing,
  isLane,
  isTowerAdjacent,
  kingdomOf,
  neighborsOf,
  ITEM_LABEL,
  WARE_LABEL,
  isGear,
  type BazaarWare,
  type GameAction,
  type GameState,
  type ItemType,
  type MoveEventType,
  type Player,
} from "../engine";
import { DRUM_LAMPS, MOVE_EVENT_LAMP, MOVE_EVENT_META } from "../ui/labels";
import type { TowerPresentation } from "../ui/presentation";
import {
  TOWER_SHORTCUT_LABELS,
  TOWER_SHORTCUTS,
  towerShortcutIndex,
} from "../ui/towerShortcuts";
import {
  eventArtFrames,
  itemArtFrame,
  TOWER_ART_SOURCE,
  wareArtFrame,
} from "../ui/towerArt";
import { useGame } from "../store/useGame";
import { TowerArtwork } from "./TowerArtwork";
import "./Tower.css";

interface KeyDef {
  label: string;
  on: boolean;
  run: () => void;
}

const WARE_ICON: Record<BazaarWare, string> = {
  warrior: "🗡️",
  food: "🍖",
  beast: "🐎",
  scout: "🧭",
  healer: "⚕️",
};

export function Tower({
  game,
  showOdds,
  presentation,
}: {
  game: GameState;
  showOdds: boolean;
  presentation: TowerPresentation;
}) {
  const dispatch = useGame((s) => s.dispatch);
  const selected = useGame((s) => s.selected);
  const select = useGame((s) => s.select);
  const pegasusMode = useGame((s) => s.pegasusMode);
  const setPegasusMode = useGame((s) => s.setPegasusMode);
  const [showInv, setShowInv] = useState(false);
  const [repeatTick, setRepeatTick] = useState(0);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const keysRef = useRef<KeyDef[]>([]);
  const shortcutHelpRef = useRef(false);

  // Checking inventory is a free glance — never a turn. Close it the moment you
  // act (phase leaves "playing") or the turn passes to another player, so it
  // can't linger over the drum and make it feel like it cost a move.
  useEffect(() => {
    setShowInv(false);
  }, [game.phase, game.currentPlayerIndex]);

  const active = game.players[game.currentPlayerIndex];
  const pos = active.position;
  const phase = game.phase;
  const playing = phase === "playing";
  const inEncounter = phase === "encounter";
  const bz = phase === "bazaar" ? game.bazaar : null;
  const buying = !!bz && bz.qty > 0;
  const bazaarWare = bz ? currentWare(bz) : null;
  const canHaggle = !!bz && !!bazaarWare && bz.prices[bazaarWare] > 1;
  const allKeys = hasAllKeys(active);

  // The square whose actions we surface: the player's tap, or their own square.
  const target = selected ?? pos;
  const isHere = target === pos;
  const adjacent = neighborsOf(pos).includes(target);
  const targetBuilding = buildingOf(target);
  const targetLane = isLane(target);
  const crossing = adjacent && isCrossing(pos, target);
  const onLane = isLane(pos);
  // From a lane you may only cross forward — into a kingdom you're not tied to
  // and didn't come from.
  const forwardCross =
    onLane &&
    adjacent &&
    !targetLane &&
    kingdomOf(target) !== active.lastKingdom &&
    kingdomOf(target) !== active.previousKingdom;

  const canUseBuilding = (types: string[]) =>
    playing &&
    !pegasusMode &&
    !!targetBuilding &&
    types.includes(targetBuilding) &&
    (isHere || (adjacent && !targetLane && !crossing));
  const toArg = isHere ? undefined : target;

  // The Dark Tower behaves like a building: open it from a tower-adjacent square
  // you're on, or by stepping onto an adjacent one (same kingdom).
  const canOpenTower =
    playing &&
    !pegasusMode &&
    allKeys &&
    ((isHere && isTowerAdjacent(pos)) ||
      (adjacent && isTowerAdjacent(target) && !targetLane && !crossing));

  const sancLabel = targetBuilding === "citadel" ? "Citadel" : "Sanctuary";
  const tombLabel = targetBuilding === "ruin" ? "Ruin" : "Tomb";
  const act = (a: GameAction) => () => dispatch(a);

  // The 12 keys, in physical grid order (row-major, 3 columns).
  const keys: KeyDef[] = [
    { label: "Yes / Buy", on: !!bz && !bz.closed, run: act({ type: "BAZAAR_YES" }) },
    {
      label: "Repeat",
      on: !!game.lastEvent,
      run: () => {
        setShowInv(false);
        setRepeatTick((t) => t + 1);
        if (game.lastEvent) playEventSfx(game.lastEvent);
      },
    },
    { label: "No / End", on: inEncounter || !!bz, run: bz ? act({ type: "BAZAAR_NO" }) : act({ type: "ACK_EVENT" }) },

    { label: "Haggle", on: canHaggle && !buying && !bz?.closed, run: act({ type: "BAZAAR_HAGGLE" }) },
    { label: "Bazaar", on: canUseBuilding(["bazaar"]), run: act({ type: "ENTER_BAZAAR", to: toArg }) },
    { label: "Clear", on: (playing && (selected !== null || pegasusMode)) || showInv, run: () => { select(null); setPegasusMode(false); setShowInv(false); } },

    { label: tombLabel, on: canUseBuilding(["tomb", "ruin"]), run: act({ type: "VISIT_TOMB", to: toArg }) },
    // Move handles same-kingdom travel AND advancing forward off a frontier.
    { label: "Move", on: playing && !pegasusMode && adjacent && !targetLane && (!crossing || forwardCross), run: act({ type: "MOVE_TO", to: target }) },
    { label: sancLabel, on: canUseBuilding(["sanctuary", "citadel"]), run: act({ type: "VISIT_SANCTUARY", to: toArg }) },

    { label: "Dark Tower", on: canOpenTower, run: act({ type: "OPEN_TOWER", to: toArg }) },
    // Frontier just steps you onto the border strip; Move carries you off it.
    { label: "Frontier", on: playing && !pegasusMode && adjacent && targetLane, run: act({ type: "MOVE_TO", to: target }) },
    { label: "Inventory", on: true, run: () => setShowInv((v) => !v) },
  ];
  keysRef.current = keys;
  shortcutHelpRef.current = showShortcutHelp;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      if (event.code === "Slash") {
        event.preventDefault();
        setShowShortcutHelp((visible) => !visible);
        return;
      }
      if (event.key === "Escape" && shortcutHelpRef.current) {
        event.preventDefault();
        setShowShortcutHelp(false);
        return;
      }
      if (shortcutHelpRef.current) return;

      const index = towerShortcutIndex(event.key);
      if (index < 0) return;
      const key = keysRef.current[index];
      if (!key?.on) return;

      event.preventDefault();
      key.run();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <div className="tower">
      <div className="tower__cap" />
      <div className="tower__turn">
        <span className="tower__turn-label">TURN {game.turn}</span>
        <span className="tower__active" style={{ color: "var(--dt-gold)" }}>
          {active.name}
        </span>
      </div>

      {bz ? (
        <BazaarView bazaar={bz} player={active} presentation={presentation} />
      ) : showInv ? (
        <InventoryView player={active} presentation={presentation} />
      ) : (
        <DrumWindow game={game} repeatTick={repeatTick} presentation={presentation} />
      )}

      {playing && !showInv && active.inventory.has("pegasus") && (
        <button
          className={`tower__pegasus ${pegasusMode ? "tower__pegasus--on" : ""}`}
          onClick={() => setPegasusMode(!pegasusMode)}
        >
          {pegasusMode ? "✕ Cancel Pegasus" : "🐎 Use Pegasus"}
        </button>
      )}

      {playing && !showInv && (
        <p className="tower__travel-hint">
          {pegasusMode
            ? "🐎 Choose a glowing territory. You will land there and your turn will end."
            : hint(isHere, adjacent, targetBuilding, targetLane, crossing, forwardCross, canOpenTower && !isHere)}
        </p>
      )}

      <div className="tower__keypad">
        {keys.map((k, i) => (
          <button
            key={i}
            className={`keycap ${k.on ? "keycap--on" : ""}`}
            disabled={!k.on}
            onClick={k.run}
            aria-keyshortcuts={TOWER_SHORTCUTS[i]}
          >
            {k.label}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {showShortcutHelp && (
          <motion.div
            className="shortcut-help"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setShowShortcutHelp(false)}
          >
            <motion.section
              className="shortcut-help__dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="shortcut-help-title"
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 6 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <span>TOWER CONTROLS</span>
                  <h2 id="shortcut-help-title">Keyboard Shortcuts</h2>
                </div>
                <button
                  className="shortcut-help__close"
                  onClick={() => setShowShortcutHelp(false)}
                  aria-label="Close keyboard shortcuts"
                  autoFocus
                >
                  ×
                </button>
              </header>
              <div className="shortcut-help__grid">
                {TOWER_SHORTCUTS.map((shortcut, index) => (
                  <div className="shortcut-help__key" key={shortcut}>
                    <kbd>{shortcut.toUpperCase()}</kbd>
                    <span>{TOWER_SHORTCUT_LABELS[index]}</span>
                  </div>
                ))}
              </div>
              <p>Press / or Escape to close.</p>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {showOdds && playing && (
        <div className="tower__odds">
          <span>Move odds:</span> Lost 18.75% · Dragon 12.5% · Plague 18.75% · Brigands 18.75% ·
          Safe 31.25%
        </div>
      )}
      {presentation === "original" && (
        <a
          className="tower__archive-credit"
          href={TOWER_ART_SOURCE}
          target="_blank"
          rel="noreferrer"
        >
          Archival display art &amp; tower audio: Well of Souls
        </a>
      )}
    </div>
  );
}

function hint(
  isHere: boolean,
  adjacent: boolean,
  building: string | undefined,
  lane: boolean,
  crossing: boolean,
  forwardCross: boolean,
  towerReach: boolean
): string {
  if (isHere) {
    return building
      ? "▶ You're on a building — press its lit key, or tap a neighbour to travel."
      : "▶ Tap a glowing neighbour, then press Move.";
  }
  if (!adjacent) return "▶ Tap a glowing territory next to you.";
  if (lane) return "▶ Frontier selected — press Frontier to step onto it.";
  if (towerReach) return "▶ Press Dark Tower to move in and face the riddle — or Move to just travel there.";
  if (forwardCross) return "▶ Press Move to advance into the kingdom ahead (no going back).";
  if (crossing) return "✕ The frontier is one-way — you can't turn back.";
  if (building) return "▶ Press Move to travel there, or the building key to travel and act.";
  return "▶ Press Move to travel to the selected territory.";
}

function BazaarView({
  bazaar,
  player,
  presentation,
}: {
  bazaar: NonNullable<GameState["bazaar"]>;
  player: Player;
  presentation: TowerPresentation;
}) {
  const ware = currentWare(bazaar);
  if (!ware) return null;
  const frame = wareArtFrame(ware);
  const price = bazaar.prices[ware];
  const buying = bazaar.qty > 0;
  const total = bazaar.qty * price;
  return (
    <div className="drum drum--bazaar">
      <div className="bz-head">
        <span>🛒 Bazaar</span>
        <span className="bz-gold">🪙 {player.gold}</span>
      </div>
      <div className="bz-progress">
        Item {bazaar.index + 1} of {bazaar.sequence.length}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={ware}
          className="bz-item"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
        >
          {presentation === "original" ? (
            <TowerArtwork frame={frame} compact />
          ) : (
            <div className="bz-icon" aria-hidden="true">{WARE_ICON[ware]}</div>
          )}
          <div className="bz-name">{WARE_LABEL[ware]}</div>
          <div className="bz-price">
            {price} gold {isGear(ware) ? "" : "each"}
          </div>
        </motion.div>
      </AnimatePresence>
      {buying ? (
        <div className="bz-tally">
          Buying <strong>{bazaar.qty}</strong> = <strong>{total}</strong> gold — press No/End to buy
          and leave the Bazaar
        </div>
      ) : (
        <p className="bz-note">
          {bazaar.note ??
            (price === 1
              ? "Already at the minimum price — use Yes/Buy, or No/End to pass."
              : "Haggle, Yes/Buy to buy, or No/End to pass.")}
        </p>
      )}
    </div>
  );
}

function InventoryView({
  player,
  presentation,
}: {
  player: Player;
  presentation: TowerPresentation;
}) {
  const KEYS: ItemType[] = ["brassKey", "silverKey", "goldKey"];
  const gear = (["sword", "scout", "healer", "beast", "pegasus"] as ItemType[]).filter((i) =>
    player.inventory.has(i)
  );
  const keys = KEYS.filter((k) => player.inventory.has(k));
  const ownedFrames = [...gear, ...keys]
    .map((item) => itemArtFrame(item))
    .filter((frame) => frame !== null);
  return (
    <div className="drum drum--inv">
      <div className="inv-title">INVENTORY</div>
      <div className="inv-stats">
        <span>🗡️ {player.warriors} warriors</span>
        <span>🪙 {player.gold} gold</span>
        <span>🍖 {player.food} food</span>
      </div>
      <div className="inv-line">
        <span className="inv-label">Gear</span>
        <span>{gear.length ? gear.map((i) => ITEM_LABEL[i]).join(" · ") : "—"}</span>
      </div>
      <div className="inv-line">
        <span className="inv-label">Keys</span>
        <span>{keys.length ? keys.map((k) => ITEM_LABEL[k]).join(" · ") : "none yet"}</span>
      </div>
      {presentation === "original" && ownedFrames.length > 0 && (
        <div className="inv-art-grid">
          {ownedFrames.map((frame) => (
            <figure key={frame.src} className="inv-art">
              <img
                src={frame.src}
                alt={`${frame.label} tower artwork`}
                draggable={false}
                decoding="sync"
                loading="eager"
              />
              <figcaption>{frame.label}</figcaption>
            </figure>
          ))}
        </div>
      )}
      <p className="inv-hint">Press Inventory again (or Clear) to close.</p>
    </div>
  );
}

function DrumWindow({
  game,
  repeatTick,
  presentation,
}: {
  game: GameState;
  repeatTick: number;
  presentation: TowerPresentation;
}) {
  const ev = game.lastEvent;
  const move = ev?.moveEvent;
  const frames = useMemo(() => eventArtFrames(ev), [ev]);
  const [frameIndex, setFrameIndex] = useState(0);
  const frame = frames.length ? frames[frameIndex % frames.length] : null;
  const drumKey = frame?.drum ?? ev?.drum ?? "warrior-food-beast";
  const lamps = DRUM_LAMPS[drumKey];
  const isPurchase = !!ev?.purchase;
  const isReward =
    ev?.kind === "combat" || (ev?.kind === "tomb" && (ev.deltas?.gold ?? 0) > 0);
  const litLamp = frame?.lamp ?? (move ? MOVE_EVENT_LAMP[move] : -1);
  const meta = move ? MOVE_EVENT_META[move] : null;
  const cleanLabel =
    frame?.label ??
    meta?.label ??
    (ev?.kind === "tomb"
      ? "Tomb / Ruin"
      : ev?.kind === "frontier"
        ? "Frontier"
        : ev
          ? "Event"
          : "Ready");

  useEffect(() => {
    setFrameIndex(0);
    if (frames.length < 2) return;
    const timer = window.setInterval(
      () => setFrameIndex((index) => (index + 1) % frames.length),
      1500
    );
    return () => window.clearInterval(timer);
  }, [frames, repeatTick]);

  return (
    <div className="drum">
      <AnimatePresence mode="wait">
        <motion.div
          key={(ev?.messages?.[0] ?? "idle") + repeatTick}
          className="drum__face"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.22 }}
        >
          {meta ? (
            <div className="drum__headline" style={{ color: meta.tint }}>
              {meta.label.toUpperCase()}
            </div>
          ) : isPurchase ? (
            <div className="drum__headline" style={{ color: "var(--dt-gold)" }}>
              PURCHASE COMPLETE
            </div>
          ) : isReward ? (
            <div className="drum__headline" style={{ color: "var(--dt-gold)" }}>
              TREASURE
            </div>
          ) : ev?.kind === "tomb" ? (
            <div className="drum__headline" style={{ color: "var(--dt-parchment)" }}>
              TOMB / RUIN
            </div>
          ) : (
            <div className="drum__idle">Choose your move</div>
          )}
          {presentation === "clean" ? (
            <div className="drum__clean-window" aria-live="polite">
              <span>
                {isPurchase ? "PURCHASE" : isReward ? "REWARD" : meta ? "ENCOUNTER" : "TOWER"}
              </span>
              <strong>{cleanLabel.toUpperCase()}</strong>
              {frames.length > 1 && (
                <small>{frameIndex + 1} / {frames.length}</small>
              )}
            </div>
          ) : frame ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={frame.src}
                className="drum__art-stage"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <TowerArtwork frame={frame} />
                {frames.length > 1 && (
                  <span className="drum__frame-count">
                    {frameIndex + 1}/{frames.length}
                  </span>
                )}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="drum__dark-window" aria-label="Tower display is dark">
              <span>DARK TOWER</span>
            </div>
          )}
          <div className="drum__lamps">
            {lamps.map((l, i) => (
              <div key={l} className={`lamp ${i === litLamp ? "lamp--on" : ""}`}>
                <span className="lamp__dot" />
                <span className="lamp__txt">{l}</span>
              </div>
            ))}
          </div>
          {ev?.messages?.length ? (
            <div className="drum__msgs">
              {ev.messages.map((m, i) => (
                <p key={i}>{m}</p>
              ))}
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export type { MoveEventType };
