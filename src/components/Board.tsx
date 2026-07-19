/**
 * The board map: a 2D graph of irregular territories, the central Dark Tower,
 * and player pawns. On your turn, click a territory to *select* it — the Tower
 * panel then lights the actions available there (Move, a building, or a
 * frontier crossing); the matching Tower button commits it. Scroll to pan,
 * pinch/Ctrl+scroll to zoom, right-drag to pan.
 */
import { useRef } from "react";
import { motion } from "framer-motion";
import {
  BOARD,
  BOARD_CENTER,
  BOARD_RADIUS,
  BOARD_SIZE,
  KINGDOM_ORDER,
  hasAllKeys,
  isTowerAdjacent,
  neighborsOf,
  pegasusDestinations,
  type GameState,
} from "../engine";
import { BUILDING_META, KINGDOM_META } from "../ui/labels";
import { usePanZoom } from "../ui/usePanZoom";
import { useGame } from "../store/useGame";
import "./Board.css";

const C = BOARD_CENTER;

function polyPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";
}

export function Board({ game }: { game: GameState }) {
  const select = useGame((s) => s.select);
  const selected = useGame((s) => s.selected);
  const dispatch = useGame((s) => s.dispatch);
  const pegasusMode = useGame((s) => s.pegasusMode);
  const svgRef = useRef<SVGSVGElement>(null);
  const pz = usePanZoom(svgRef, BOARD_SIZE);

  const active = game.players[game.currentPlayerIndex];
  const canAct = game.phase === "playing";
  const reachable = new Set(canAct && !pegasusMode ? neighborsOf(active.position) : []);
  const flightReachable = new Set(
    canAct && pegasusMode ? pegasusDestinations(active) : []
  );
  const allKeys = hasAllKeys(active);
  const towerReady = canAct && !pegasusMode && allKeys && isTowerAdjacent(active.position);

  const clickTerritory = (id: string) => {
    if (!canAct) return;
    if (pegasusMode) {
      if (!flightReachable.has(id)) {
        select(null);
        return;
      }
      // Flight lands immediately but consumes the whole turn. Buildings at the
      // destination therefore cannot be used until this player's next turn.
      dispatch({ type: "PEGASUS_FLY", to: id });
      return;
    }
    // Only your own square or a reachable neighbour can be acted on; a stray
    // click elsewhere clears the selection back to your own square.
    if (id === active.position || reachable.has(id)) select(id);
    else select(null);
  };

  return (
    <div className="board-wrap">
      <div className="board-zoom">
        <button className="board-zoom-btn" onClick={() => pz.zoomBy(0.75)} title="Zoom in">+</button>
        <button className="board-zoom-btn" onClick={() => pz.zoomBy(1.333)} title="Zoom out">−</button>
        <button className="board-zoom-btn board-zoom-btn--txt" onClick={pz.reset} title="Reset view">
          {pz.pct}%
        </button>
      </div>
      <svg
        ref={svgRef}
        className="board"
        viewBox={pz.viewBox}
        role="img"
        aria-label="Dark Tower board"
        onMouseDown={pz.onPanStart}
        onMouseMove={pz.onPanMove}
        onMouseUp={pz.onPanEnd}
        onMouseLeave={pz.onPanEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <clipPath id="discClip">
            <circle cx={C} cy={C} r={BOARD_RADIUS} />
          </clipPath>
          <radialGradient id="towerGlow" cx="50%" cy="38%" r="62%">
            <stop offset="0%" stopColor="#4a4458" />
            <stop offset="70%" stopColor="#1b1822" />
            <stop offset="100%" stopColor="#0c0a10" />
          </radialGradient>
        </defs>

        <circle cx={C} cy={C} r={BOARD_RADIUS + 6} className="board__disc" />

        <g clipPath="url(#discClip)">
          {BOARD.order.map((id) => {
            const t = BOARD.territories[id];
            if (t.polygon.length === 0) return null;
            const isHere = active.position === id;
            const canGo = reachable.has(id);
            const canFly = flightReachable.has(id);
            return (
              <path
                key={id}
                d={polyPath(t.polygon)}
                className={[
                  "terr",
                  isHere ? "terr--here" : "",
                  canGo ? "terr--reach" : "",
                  canFly ? "terr--flight" : "",
                  selected === id ? "terr--selected" : "",
                  t.building ? "terr--bld" : "",
                  t.lane ? "terr--lane" : "",
                  t.darkTowerRegion ? "terr--dtr" : "",
                ].join(" ")}
                style={{ fill: t.lane ? "var(--dt-parchment-dark)" : `var(${KINGDOM_META[t.kingdom].colorVar})` }}
                onClick={() => clickTerritory(id)}
              />
            );
          })}

          {BOARD.order.map((id) => {
            const t = BOARD.territories[id];
            if (!t.building) return null;
            return (
              <text key={`b-${id}`} x={t.cx} y={t.cy + 6} textAnchor="middle" className="terr__icon">
                {BUILDING_META[t.building].icon}
              </text>
            );
          })}
        </g>

        {KINGDOM_ORDER.map((k) => {
          const cells = BOARD.order.filter(
            (id) =>
              !BOARD.territories[id].lane &&
              BOARD.territories[id].kingdom === k &&
              BOARD.territories[id].polygon.length > 0
          );
          if (!cells.length) return null;
          const x = cells.reduce((s, id) => s + BOARD.territories[id].cx, 0) / cells.length;
          const y = cells.reduce((s, id) => s + BOARD.territories[id].cy, 0) / cells.length;
          return (
            <text key={`kn-${k}`} x={x} y={y} textAnchor="middle" className="board__kname">
              {KINGDOM_META[k].name}
            </text>
          );
        })}

        <g
          className={`board__tower-group ${towerReady ? "board__tower-group--ready" : ""}`}
          onClick={() => towerReady && dispatch({ type: "OPEN_TOWER" })}
        >
          <circle cx={C} cy={C} r={BOARD.towerRadius + 6} className="board__tower-base" />
          <circle cx={C} cy={C} r={BOARD.towerRadius} fill="url(#towerGlow)" className="board__tower" />
          <text x={C} y={C - 4} textAnchor="middle" className="board__tower-icon">🗼</text>
          <text x={C} y={C + 20} textAnchor="middle" className="board__tower-label">DARK TOWER</text>
        </g>

        {game.players.map((p) => {
          const here = BOARD.territories[p.position];
          if (!here) return null;
          const sharers = game.players.filter((q) => q.position === p.position);
          const order = sharers.findIndex((q) => q.id === p.id);
          const spread = (order - (sharers.length - 1) / 2) * 16;
          const isActive = p.id === active.id;
          return (
            <motion.g
              key={`pawn-${p.id}`}
              initial={false}
              animate={{ x: here.cx + spread, y: here.cy - 6 }}
              transition={{ type: "spring", stiffness: 220, damping: 24 }}
            >
              <circle
                r={isActive ? 12 : 9}
                className={`board__pawn ${isActive ? "board__pawn--active" : ""}`}
                style={{ fill: `var(${KINGDOM_META[KINGDOM_ORDER[p.id]].colorVar})` }}
              />
              <text textAnchor="middle" y={4} className="board__pawn-label">
                {p.name.charAt(0).toUpperCase()}
              </text>
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
