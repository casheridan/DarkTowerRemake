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
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
import { useGame } from "../store/useGame";
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

export function Tower({ game, showOdds }: { game: GameState; showOdds: boolean }) {
  const dispatch = useGame((s) => s.dispatch);
  const selected = useGame((s) => s.selected);
  const select = useGame((s) => s.select);
  const [showInv, setShowInv] = useState(false);
  const [repeatTick, setRepeatTick] = useState(0);

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
    !!targetBuilding &&
    types.includes(targetBuilding) &&
    (isHere || (adjacent && !targetLane && !crossing));
  const toArg = isHere ? undefined : target;

  // The Dark Tower behaves like a building: open it from a tower-adjacent square
  // you're on, or by stepping onto an adjacent one (same kingdom).
  const canOpenTower =
    playing &&
    allKeys &&
    ((isHere && isTowerAdjacent(pos)) ||
      (adjacent && isTowerAdjacent(target) && !targetLane && !crossing));

  const sancLabel = targetBuilding === "citadel" ? "Citadel" : "Sanctuary";
  const tombLabel = targetBuilding === "ruin" ? "Ruin" : "Tomb";
  const act = (a: GameAction) => () => dispatch(a);

  // The 12 keys, in physical grid order (row-major, 3 columns).
  const keys: KeyDef[] = [
    { label: "Yes / Buy", on: !!bz && !bz.closed, run: act({ type: "BAZAAR_YES" }) },
    { label: "Repeat", on: !!game.lastEvent, run: () => { setShowInv(false); setRepeatTick((t) => t + 1); } },
    { label: "No / End", on: inEncounter || !!bz, run: bz ? act({ type: "BAZAAR_NO" }) : act({ type: "ACK_EVENT" }) },

    { label: "Haggle", on: !!bz && !buying && !bz.closed, run: act({ type: "BAZAAR_HAGGLE" }) },
    { label: "Bazaar", on: canUseBuilding(["bazaar"]), run: act({ type: "ENTER_BAZAAR", to: toArg }) },
    { label: "Clear", on: (playing && selected !== null) || showInv, run: () => { select(null); setShowInv(false); } },

    { label: tombLabel, on: canUseBuilding(["tomb", "ruin"]), run: act({ type: "VISIT_TOMB", to: toArg }) },
    // Move handles same-kingdom travel AND advancing forward off a frontier.
    { label: "Move", on: playing && adjacent && !targetLane && (!crossing || forwardCross), run: act({ type: "MOVE_TO", to: target }) },
    { label: sancLabel, on: canUseBuilding(["sanctuary", "citadel"]), run: act({ type: "VISIT_SANCTUARY", to: toArg }) },

    { label: "Dark Tower", on: canOpenTower, run: act({ type: "OPEN_TOWER", to: toArg }) },
    // Frontier just steps you onto the border strip; Move carries you off it.
    { label: "Frontier", on: playing && adjacent && targetLane, run: act({ type: "MOVE_TO", to: target }) },
    { label: "Inventory", on: true, run: () => setShowInv((v) => !v) },
  ];

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
        <BazaarView bazaar={bz} player={active} />
      ) : showInv ? (
        <InventoryView player={active} />
      ) : (
        <DrumWindow game={game} repeatTick={repeatTick} />
      )}

      {playing && !showInv && (
        <p className="tower__travel-hint">
          {hint(isHere, adjacent, targetBuilding, targetLane, crossing, forwardCross, canOpenTower && !isHere)}
        </p>
      )}

      <div className="tower__keypad">
        {keys.map((k, i) => (
          <button
            key={i}
            className={`keycap ${k.on ? "keycap--on" : ""}`}
            disabled={!k.on}
            onClick={k.run}
          >
            {k.label}
          </button>
        ))}
      </div>

      {showOdds && playing && (
        <div className="tower__odds">
          <span>Move odds:</span> Lost 18.75% · Dragon 12.5% · Plague 18.75% · Brigands 18.75% ·
          Safe 31.25%
        </div>
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

function BazaarView({ bazaar, player }: { bazaar: NonNullable<GameState["bazaar"]>; player: Player }) {
  const ware = currentWare(bazaar);
  if (!ware) return null;
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
          <div className="bz-icon">{WARE_ICON[ware]}</div>
          <div className="bz-name">{WARE_LABEL[ware]}</div>
          <div className="bz-price">
            {price} gold {isGear(ware) ? "" : "each"}
          </div>
        </motion.div>
      </AnimatePresence>
      {buying ? (
        <div className="bz-tally">
          Buying <strong>{bazaar.qty}</strong> = <strong>{total}</strong> gold — press No/End to seal
          the deal
        </div>
      ) : (
        <p className="bz-note">{bazaar.note ?? "Haggle, Yes/Buy to buy, or No/End to pass on."}</p>
      )}
    </div>
  );
}

function InventoryView({ player }: { player: Player }) {
  const KEYS: ItemType[] = ["brassKey", "silverKey", "goldKey"];
  const gear = (["sword", "scout", "healer", "beast", "pegasus"] as ItemType[]).filter((i) =>
    player.inventory.has(i)
  );
  const keys = KEYS.filter((k) => player.inventory.has(k));
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
      <p className="inv-hint">Press Inventory again (or Clear) to close.</p>
    </div>
  );
}

function DrumWindow({ game, repeatTick }: { game: GameState; repeatTick: number }) {
  const ev = game.lastEvent;
  const move = ev?.moveEvent;
  const drumKey = ev?.drum ?? "warrior-food-beast";
  const lamps = DRUM_LAMPS[drumKey];
  const litLamp = move ? MOVE_EVENT_LAMP[move] : -1;
  const meta = move ? MOVE_EVENT_META[move] : null;

  return (
    <div className="drum">
      <AnimatePresence mode="wait">
        <motion.div
          key={drumKey + (ev?.messages?.[0] ?? "") + repeatTick}
          className="drum__face"
          initial={{ rotateX: -90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{ rotateX: 90, opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {meta ? (
            <div className="drum__headline" style={{ color: meta.tint }}>
              {meta.label.toUpperCase()}
            </div>
          ) : (
            <div className="drum__idle">Choose your move</div>
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
