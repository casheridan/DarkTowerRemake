/**
 * The board — a 2D territory graph authored in the Map Editor (or a procedural
 * default approximating the real 1981 board).
 *
 * Structure (see reference/board/board-photo.png):
 *  - Four kingdoms in the diagonal quadrants.
 *  - Four **frontier** strips along the cardinal axes, each ONE long territory
 *    from the rim to the central Tower. Frontiers are hard separators: regions
 *    of different kingdoms are never adjacent to each other — kingdoms connect
 *    only *through* a frontier. Frontiers always exist (an empty map is just
 *    the four frontiers + the Tower).
 *  - A resizable central Dark Tower; each kingdom's "dark tower region" is the
 *    sole entry point to the endgame.
 *
 * Adjacency:
 *  - Within a kingdom it is derived from the Voronoi tessellation — cells that
 *    visibly touch are connected (edges passing under the Tower are blocked).
 *  - Region↔frontier links are derived geometrically: any cell that abuts a
 *    frontier strip (i.e. got clipped by its boundary) connects to it.
 *  - The authored map can override everything via links.add / links.remove
 *    (validated: never region↔region across kingdoms, never frontier↔frontier).
 */
import { Delaunay } from "d3-delaunay";
import { KINGDOM_ORDER } from "./constants";
import type { BuildingType, KingdomId } from "./types";

export const BOARD_SIZE = 720;
export const BOARD_CENTER = BOARD_SIZE / 2;
export const BOARD_RADIUS = 340;
export const DEFAULT_TOWER_RADIUS = 58;
export const MIN_TOWER_RADIUS = 40;
export const MAX_TOWER_RADIUS = 140;
export const DEFAULT_FRONTIER_WIDTH = 7; // strip half-width in degrees
export const MIN_FRONTIER_WIDTH = 3;
export const MAX_FRONTIER_WIDTH = 16;
export const MAX_FRONTIER_ROTATION = 25; // ± degrees for the whole cross

export type TerritoryType =
  | "plain"
  | "citadel"
  | "bazaar"
  | "sanctuary"
  | "tomb"
  | "ruin"
  | "darkTower";

/** A user-placed (or procedurally generated) territory seed. Ids are stable. */
export interface AuthoredSeed {
  id: string;
  kingdom: KingdomId;
  type: TerritoryType;
  cx: number;
  cy: number;
}

/** Manual adjacency overrides, as pairs of territory ids. */
export interface MapLinks {
  add: [string, string][];
  remove: [string, string][];
}

/** A hand-drawn territory: exact border polygon + type. */
export interface DrawnRegion {
  id: string;
  kingdom: KingdomId;
  type: TerritoryType;
  polygon: [number, number][];
}

/** Everything the Map Editor authors. */
export interface AuthoredMap {
  towerRadius: number;
  seeds: AuthoredSeed[];
  links: MapLinks;
  /** Frontier strip half-width in degrees (default 7, clamped 3–16). */
  frontierWidth?: number;
  /** Rotation of the whole frontier cross in degrees (default 0, clamped ±25). */
  frontierRotation?: number;
  /** Hand-drawn territories. When present, they take precedence over seeds. */
  regions?: DrawnRegion[];
}

export function emptyLinks(): MapLinks {
  return { add: [], remove: [] };
}

export function defaultMap(): AuthoredMap {
  return { towerRadius: DEFAULT_TOWER_RADIUS, seeds: proceduralSeeds(), links: emptyLinks() };
}

export interface Territory {
  id: string;
  kingdom: KingdomId; // for frontiers: nominal only
  cx: number;
  cy: number;
  polygon: [number, number][];
  building?: BuildingType;
  lane: boolean; // a frontier strip
  darkTowerRegion: boolean;
  towerAdjacent: boolean;
  neighbors: string[];
}

export interface Board {
  territories: Record<string, Territory>;
  order: string[];
  towerRadius: number;
}

const KINGDOM_COUNT: Record<KingdomId, number> = {
  arisilon: 28,
  brynthia: 31,
  durnin: 28,
  zenon: 32,
};

const KINGDOM_CENTER_ANGLE: Record<KingdomId, number> = {
  arisilon: -45,
  brynthia: 45,
  durnin: 135,
  zenon: 225,
};

/** Base (unrotated) frontier axes. */
export const FRONTIER_ANGLES = [0, 90, 180, 270];

/** Frontier indices bounding each kingdom's quadrant. */
const KINGDOM_LANES: Record<KingdomId, [number, number]> = {
  arisilon: [3, 0], // 270° and 0°
  brynthia: [0, 1],
  durnin: [1, 2],
  zenon: [2, 3],
};

const SECTOR_HALF = 36;
const RING_RADII = [104, 146, 190, 232, 272, 316];
const RING_WEIGHTS = [1, 1.5, 2, 2.4, 2.7, 3];

// ---- geometry helpers ------------------------------------------------------

type Pt = [number, number];

function polar(r: number, deg: number): Pt {
  const rad = (deg * Math.PI) / 180;
  return [BOARD_CENTER + r * Math.cos(rad), BOARD_CENTER + r * Math.sin(rad)];
}
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
function shortestDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Clip a polygon against one frontier boundary line (the lane edge nearer the
 * given kingdom), keeping the kingdom's side. Returns whether anything was cut
 * — i.e. whether the cell abuts that frontier.
 */
function clipAtLane(
  poly: Pt[],
  laneAngle: number,
  centerAngle: number,
  halfW: number
): { poly: Pt[]; touched: boolean } {
  if (poly.length === 0) return { poly, touched: false };
  const c = centerAngle;
  const sign = shortestDelta(laneAngle, c) >= 0 ? 1 : -1;
  const psi = ((laneAngle + sign * halfW) * Math.PI) / 180;
  const dx = Math.cos(psi);
  const dy = Math.sin(psi);
  // Keep the side of the boundary that contains the kingdom centre direction.
  const cRad = (c * Math.PI) / 180;
  const refSign = Math.sign(dx * Math.sin(cRad) - dy * Math.cos(cRad)) || 1;
  const side = (p: Pt) => refSign * (dx * (p[1] - BOARD_CENTER) - dy * (p[0] - BOARD_CENTER));

  const out: Pt[] = [];
  const contacts: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    // Vertices lying on the lane edge, and points cut by it, are contacts.
    if (Math.abs(sa) < 2.5) contacts.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      const ip: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      out.push(ip);
      contacts.push(ip);
    }
  }
  // Touching a frontier means sharing a stretch of its edge — a lone corner or
  // single point of contact does NOT link (same rule as region↔region).
  let touched = false;
  for (let i = 0; i < contacts.length && !touched; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      if (Math.hypot(contacts[i][0] - contacts[j][0], contacts[i][1] - contacts[j][1]) >= 7) {
        touched = true;
        break;
      }
    }
  }
  return { poly: out, touched };
}

function frontierPolygon(angle: number, towerRadius: number, hw: number): Pt[] {
  return [
    polar(towerRadius + 2, angle - hw),
    polar(BOARD_RADIUS, angle - hw),
    polar(BOARD_RADIUS, angle + hw),
    polar(towerRadius + 2, angle + hw),
  ];
}

/** Area centroid of a polygon (falls back to the vertex mean when degenerate). */
function polygonCentroid(poly: Pt[]): Pt {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const f = x0 * y1 - x1 * y0;
    area += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(area) < 1e-6) {
    const mx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const my = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    return [mx, my];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = p[0] - a[0];
  const wy = p[1] - a[1];
  const len = vx * vx + vy * vy;
  const t = len ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len)) : 0;
  return Math.hypot(wx - t * vx, wy - t * vy);
}

function pointToPolyDist(p: Pt, poly: Pt[]): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    min = Math.min(min, pointSegDist(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return min;
}

/**
 * Do two drawn borders genuinely share a stretch of border? Vertices of one
 * lying on the other's boundary count as contact points; a real shared border
 * has contact points spread apart, while a mere corner touch clusters at one
 * spot (and doesn't connect).
 */
/** A position along a polygon border: on edge `edge`, at fraction `t` (0–1). */
export interface BorderPos {
  edge: number;
  t: number;
}

/**
 * The vertices passed when travelling along a polygon border from one position
 * to another (endpoints excluded), taking the shorter way around. The Map
 * Editor uses this to trace a new territory's border along an existing one so
 * the two share the border line exactly.
 */
export function walkBorder(poly: [number, number][], from: BorderPos, to: BorderPos): Pt[] {
  const n = poly.length;
  if (n < 2) return [];
  const edgeLen = (i: number) => {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  const cum: number[] = [0];
  for (let i = 0; i < n; i++) cum.push(cum[i] + edgeLen(i));
  const P = cum[n];
  if (P <= 0) return [];
  const pos = (bp: BorderPos) => cum[bp.edge] + bp.t * edgeLen(bp.edge);
  const sF = pos(from);
  const sT = pos(to);
  const fwd = (sT - sF + P) % P;
  const bwd = P - fwd;
  const out: Pt[] = [];
  if (fwd <= bwd) {
    for (let k = 1; k <= n; k++) {
      const i = (from.edge + k) % n;
      const rel = (cum[i] - sF + P) % P;
      if (rel >= fwd - 1e-6) break;
      if (rel > 1e-6) out.push([poly[i][0], poly[i][1]]);
    }
  } else {
    for (let k = 0; k < n; k++) {
      const i = (from.edge - k + n) % n;
      const rel = (sF - cum[i] + P) % P;
      if (rel >= bwd - 1e-6) break;
      if (rel > 1e-6) out.push([poly[i][0], poly[i][1]]);
    }
  }
  return out;
}

/** An anchor on a specific territory's border. */
export interface BorderAnchor {
  rid: string;
  edge: number;
  t: number;
}

/**
 * Shortest path along the union of territory borders between two anchors,
 * crossing between territories wherever their borders share points. Returns
 * the intermediate points (endpoints excluded), or null when the borders are
 * not connected. This is what lets a single drawn line close a territory whose
 * remaining boundary already exists as other territories' (or frontiers')
 * borders.
 */
export function traceBorderPath(
  polys: { id: string; polygon: [number, number][] }[],
  from: BorderAnchor,
  to: BorderAnchor
): Pt[] | null {
  const key = (p: Pt) => `${p[0].toFixed(2)}|${p[1].toFixed(2)}`;
  const pts = new Map<string, Pt>();
  const adj = new Map<string, { k: string; w: number }[]>();
  const node = (p: Pt): string => {
    const k = key(p);
    if (!pts.has(k)) {
      pts.set(k, p);
      adj.set(k, []);
    }
    return k;
  };
  const connect = (a: Pt, b: Pt) => {
    const ka = node(a);
    const kb = node(b);
    if (ka === kb) return;
    const w = Math.hypot(a[0] - b[0], a[1] - b[1]);
    adj.get(ka)!.push({ k: kb, w });
    adj.get(kb)!.push({ k: ka, w });
  };

  const byId = new Map(polys.map((p) => [p.id, p.polygon]));
  const anchorPoint = (a: BorderAnchor): Pt | null => {
    const poly = byId.get(a.rid);
    if (!poly || poly.length < 2) return null;
    const v0 = poly[a.edge % poly.length];
    const v1 = poly[(a.edge + 1) % poly.length];
    return [v0[0] + (v1[0] - v0[0]) * a.t, v0[1] + (v1[1] - v0[1]) * a.t];
  };
  const pFrom = anchorPoint(from);
  const pTo = anchorPoint(to);
  if (!pFrom || !pTo) return null;

  // Border segments, split where an anchor sits mid-edge.
  for (const { id, polygon } of polys) {
    if (polygon.length < 2) continue;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const splits: Pt[] = [];
      for (const [anchor, ap] of [
        [from, pFrom],
        [to, pTo],
      ] as [BorderAnchor, Pt][]) {
        if (
          anchor.rid === id &&
          anchor.edge % polygon.length === i &&
          anchor.t > 1e-6 &&
          anchor.t < 1 - 1e-6
        ) {
          splits.push(ap);
        }
      }
      splits.sort(
        (p1, p2) =>
          Math.hypot(p1[0] - a[0], p1[1] - a[1]) - Math.hypot(p2[0] - a[0], p2[1] - a[1])
      );
      let prev = a;
      for (const s of splits) {
        connect(prev, s);
        prev = s;
      }
      connect(prev, b);
    }
  }

  const start = key(pFrom);
  const goal = key(pTo);
  if (!adj.has(start) || !adj.has(goal)) return null;
  if (start === goal) return [];

  // Dijkstra — the graph is small (a few hundred nodes).
  const dist = new Map<string, number>([[start, 0]]);
  const prevOf = new Map<string, string>();
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [k, d] of dist) {
      if (!done.has(k) && d < best) {
        best = d;
        cur = k;
      }
    }
    if (cur == null) return null;
    if (cur === goal) break;
    done.add(cur);
    for (const { k, w } of adj.get(cur) ?? []) {
      const nd = best + w;
      if (nd < (dist.get(k) ?? Infinity)) {
        dist.set(k, nd);
        prevOf.set(k, cur);
      }
    }
  }
  const path: Pt[] = [];
  let cur = goal;
  while (cur !== start) {
    path.push(pts.get(cur)!);
    cur = prevOf.get(cur)!;
  }
  path.reverse();
  path.pop(); // exclude the destination anchor itself
  return path;
}

function regionsTouch(a: Pt[], b: Pt[], eps = 3.5, minSpread = 7): boolean {
  const matched: Pt[] = [];
  for (const v of a) if (pointToPolyDist(v, b) < eps) matched.push(v);
  for (const v of b) if (pointToPolyDist(v, a) < eps) matched.push(v);
  if (matched.length < 2) return false;
  let spread = 0;
  for (let i = 0; i < matched.length; i++) {
    for (let j = i + 1; j < matched.length; j++) {
      spread = Math.max(
        spread,
        Math.hypot(matched[i][0] - matched[j][0], matched[i][1] - matched[j][1])
      );
    }
  }
  return spread >= minSpread;
}

// ---- procedural default -----------------------------------------------------

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ringCounts(total: number): number[] {
  const sw = RING_WEIGHTS.reduce((a, b) => a + b, 0);
  const counts = RING_WEIGHTS.map((w) => Math.max(1, Math.floor((total * w) / sw)));
  let rem = total - counts.reduce((a, b) => a + b, 0);
  let i = counts.length - 1;
  while (rem > 0) {
    counts[i]++;
    rem--;
    i = i === 0 ? counts.length - 1 : i - 1;
  }
  while (rem < 0) {
    if (counts[i] > 1) {
      counts[i]--;
      rem++;
    }
    i = i === 0 ? counts.length - 1 : i - 1;
  }
  return counts;
}

/** Deterministic default seeds approximating the real board (stable ids p0…). */
export function proceduralSeeds(): AuthoredSeed[] {
  const jit = rng(0x5eed1234);
  const seeds: AuthoredSeed[] = [];
  for (const kingdom of KINGDOM_ORDER) {
    const center = KINGDOM_CENTER_ANGLE[kingdom];
    const counts = ringCounts(KINGDOM_COUNT[kingdom]);
    RING_RADII.forEach((baseR, ring) => {
      const n = counts[ring];
      for (let k = 0; k < n; k++) {
        const frac = n === 1 ? 0.5 : k / (n - 1);
        const angle = center - SECTOR_HALF + frac * (SECTOR_HALF * 2) + (jit() - 0.5) * 6;
        const r = baseR + (jit() - 0.5) * 22;
        const [cx, cy] = polar(r, angle);
        seeds.push({ id: `p${seeds.length}`, kingdom, type: "plain", cx, cy });
      }
    });
  }

  const tag = (k: KingdomId, targetR: number, targetA: number, type: TerritoryType) => {
    const [tx, ty] = polar(targetR, targetA);
    let best: AuthoredSeed | null = null;
    let bd = Infinity;
    for (const s of seeds) {
      if (s.kingdom !== k || s.type !== "plain") continue;
      const d = dist(s.cx, s.cy, tx, ty);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (best) best.type = type;
  };
  for (const k of KINGDOM_ORDER) {
    const c = KINGDOM_CENTER_ANGLE[k];
    tag(k, RING_RADII[0], c, "darkTower");
    tag(k, 316, c, "citadel");
    tag(k, 214, c, "bazaar");
    tag(k, 214, c - 20, "tomb");
    tag(k, 214, c + 20, "sanctuary");
    tag(k, 262, c + 20, "ruin");
  }
  return seeds;
}

// ---- builder -----------------------------------------------------------------

function canLink(a: Territory | undefined, b: Territory | undefined): boolean {
  if (!a || !b || a.id === b.id) return false;
  if (a.lane && b.lane) return false; // frontiers never chain together
  if (!a.lane && !b.lane && a.kingdom !== b.kingdom) return false; // separators!
  return true;
}

export function buildBoard(map: AuthoredMap): Board {
  const towerRadius = Math.max(
    MIN_TOWER_RADIUS,
    Math.min(MAX_TOWER_RADIUS, map.towerRadius || DEFAULT_TOWER_RADIUS)
  );
  const halfW = Math.max(
    MIN_FRONTIER_WIDTH,
    Math.min(MAX_FRONTIER_WIDTH, map.frontierWidth ?? DEFAULT_FRONTIER_WIDTH)
  );
  const rot = Math.max(
    -MAX_FRONTIER_ROTATION,
    Math.min(MAX_FRONTIER_ROTATION, map.frontierRotation ?? 0)
  );
  const laneAngles = FRONTIER_ANGLES.map((a) => a + rot);
  const seeds = map.seeds;
  const regions = map.regions ?? [];
  const territories: Record<string, Territory> = {};
  const order: string[] = [];
  const laneTouch = new Map<string, Set<number>>();

  if (regions.length > 0) {
    // Drawn mode — exact hand-drawn borders; adjacency from real border contact.
    for (const r of regions) {
      let poly = r.polygon.map((p) => [p[0], p[1]] as Pt);
      const touched = new Set<number>();
      // Clip each region against every frontier by its OWN position — never by
      // its kingdom label — so re-assigning a territory's kingdom is a pure
      // relabel and never chops the shape away. (Far lanes are no-ops.)
      const [rcx, rcy] = polygonCentroid(poly.length >= 3 ? poly : r.polygon);
      const ownAngle = (Math.atan2(rcy - BOARD_CENTER, rcx - BOARD_CENTER) * 180) / Math.PI;
      for (let fi = 0; fi < laneAngles.length; fi++) {
        const res = clipAtLane(poly, laneAngles[fi], ownAngle, halfW);
        poly = res.poly;
        if (res.touched) touched.add(fi);
      }
      laneTouch.set(r.id, touched);
      const [cx, cy] = polygonCentroid(poly.length >= 3 ? poly : r.polygon);
      const darkTowerRegion = r.type === "darkTower";
      territories[r.id] = {
        id: r.id,
        kingdom: r.kingdom,
        cx,
        cy,
        polygon: poly,
        building:
          r.type === "plain" || r.type === "darkTower" ? undefined : (r.type as BuildingType),
        lane: false,
        darkTowerRegion,
        towerAdjacent: darkTowerRegion,
        neighbors: darkTowerRegion ? ["tower"] : [],
      };
      order.push(r.id);
    }
    // Same-kingdom adjacency only — frontiers separate kingdoms.
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        if (regions[i].kingdom !== regions[j].kingdom) continue;
        const ta = territories[regions[i].id];
        const tb = territories[regions[j].id];
        if (ta.polygon.length < 3 || tb.polygon.length < 3) continue;
        if (regionsTouch(ta.polygon, tb.polygon)) {
          ta.neighbors.push(tb.id);
          tb.neighbors.push(ta.id);
        }
      }
    }
  } else if (seeds.length >= 3) {
    const pts = seeds.map((s) => [s.cx, s.cy] as Pt);
    const delaunay = Delaunay.from(pts);
    const voronoi = delaunay.voronoi([0, 0, BOARD_SIZE, BOARD_SIZE]);

    seeds.forEach((s, i) => {
      let poly = ((voronoi.cellPolygon(i)?.slice(0, -1) ?? []) as Pt[]).map(
        (p) => [p[0], p[1]] as Pt
      );
      const touched = new Set<number>();
      for (const fi of KINGDOM_LANES[s.kingdom]) {
        const res = clipAtLane(
          poly,
          laneAngles[fi],
          KINGDOM_CENTER_ANGLE[s.kingdom] + rot,
          halfW
        );
        poly = res.poly;
        if (res.touched) touched.add(fi);
      }
      laneTouch.set(s.id, touched);

      const neighbors: string[] = [];
      for (const j of delaunay.neighbors(i)) {
        if (seeds[j].kingdom !== s.kingdom) continue; // kingdoms meet only at frontiers
        const mx = (pts[i][0] + pts[j][0]) / 2;
        const my = (pts[i][1] + pts[j][1]) / 2;
        if (dist(mx, my, BOARD_CENTER, BOARD_CENTER) < towerRadius + 14) continue;
        neighbors.push(seeds[j].id);
      }
      const darkTowerRegion = s.type === "darkTower";
      if (darkTowerRegion) neighbors.push("tower");

      territories[s.id] = {
        id: s.id,
        kingdom: s.kingdom,
        cx: s.cx,
        cy: s.cy,
        polygon: poly,
        building:
          s.type === "plain" || s.type === "darkTower" ? undefined : (s.type as BuildingType),
        lane: false,
        darkTowerRegion,
        towerAdjacent: darkTowerRegion,
        neighbors,
      };
      order.push(s.id);
    });
  } else {
    // Degenerate (mid-editing): placeholder cells, no auto adjacency.
    for (const s of seeds) {
      const poly = Array.from({ length: 8 }, (_, k) => {
        const a = (k * 45 * Math.PI) / 180;
        return [s.cx + 26 * Math.cos(a), s.cy + 26 * Math.sin(a)] as Pt;
      });
      laneTouch.set(s.id, new Set());
      const darkTowerRegion = s.type === "darkTower";
      territories[s.id] = {
        id: s.id,
        kingdom: s.kingdom,
        cx: s.cx,
        cy: s.cy,
        polygon: poly,
        building:
          s.type === "plain" || s.type === "darkTower" ? undefined : (s.type as BuildingType),
        lane: false,
        darkTowerRegion,
        towerAdjacent: darkTowerRegion,
        neighbors: darkTowerRegion ? ["tower"] : [],
      };
      order.push(s.id);
    }
  }

  // The four frontier strips — always present, linked to every cell that abuts them.
  laneAngles.forEach((angle, fi) => {
    const id = `frontier-${fi}`;
    const [cx, cy] = polar((towerRadius + BOARD_RADIUS) / 2, angle);
    const neighbors: string[] = [];
    for (const tid of order) {
      if (laneTouch.get(tid)?.has(fi)) {
        neighbors.push(tid);
        territories[tid].neighbors.push(id);
      }
    }
    territories[id] = {
      id,
      kingdom: KINGDOM_ORDER[fi % KINGDOM_ORDER.length],
      cx,
      cy,
      polygon: frontierPolygon(angle, towerRadius, halfW),
      lane: true,
      darkTowerRegion: false,
      towerAdjacent: false,
      neighbors,
    };
    order.push(id);
  });

  // Manual overrides (validated).
  for (const [x, y] of map.links?.add ?? []) {
    const a = territories[x];
    const b = territories[y];
    if (canLink(a, b)) {
      a.neighbors.push(y);
      b.neighbors.push(x);
    }
  }
  for (const [x, y] of map.links?.remove ?? []) {
    if (territories[x]) territories[x].neighbors = territories[x].neighbors.filter((n) => n !== y);
    if (territories[y]) territories[y].neighbors = territories[y].neighbors.filter((n) => n !== x);
  }
  for (const t of Object.values(territories)) t.neighbors = [...new Set(t.neighbors)];

  // Guarantee every kingdom owns a citadel so a player can always start on one.
  // (Authored maps that never tagged one still get a sensible rim-most home.)
  for (const k of KINGDOM_ORDER) {
    const inK = order.filter(
      (id) => territories[id].kingdom === k && !territories[id].lane && !territories[id].darkTowerRegion
    );
    if (inK.length === 0 || inK.some((id) => territories[id].building === "citadel")) continue;
    const pool = inK.filter((id) => !territories[id].building);
    let best = (pool.length ? pool : inK)[0];
    let bestD = -1;
    for (const id of pool.length ? pool : inK) {
      const t = territories[id];
      const d = dist(t.cx, t.cy, BOARD_CENTER, BOARD_CENTER);
      if (d > bestD) {
        bestD = d;
        best = id;
      }
    }
    territories[best].building = "citadel";
  }

  return { territories, order, towerRadius };
}

// ---- live, swappable board ----------------------------------------------------

export let BOARD: Board = buildBoard(defaultMap());

/** Swap in an authored map; falls back to the default when null/too small to play. */
export function loadBoardMap(map: AuthoredMap | null): void {
  const usable =
    !!map && ((map.regions != null && map.regions.length >= 1) || map.seeds.length >= 3);
  BOARD = usable ? buildBoard(map!) : buildBoard(defaultMap());
  if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__DT_BOARD = () => BOARD;
}

if (import.meta.env?.DEV) (globalThis as Record<string, unknown>).__DT_BOARD = () => BOARD;

// ---- helpers -------------------------------------------------------------------

export function territory(id: string): Territory {
  return BOARD.territories[id];
}
export function kingdomOf(id: string): KingdomId {
  return BOARD.territories[id]?.kingdom;
}
export function buildingOf(id: string): BuildingType | undefined {
  return BOARD.territories[id]?.building;
}
export function neighborsOf(id: string): string[] {
  return BOARD.territories[id]?.neighbors ?? [];
}
export function isLane(id: string): boolean {
  return !!BOARD.territories[id]?.lane;
}
export function isCrossing(fromId: string, toId: string): boolean {
  const to = BOARD.territories[toId];
  const from = BOARD.territories[fromId];
  if (!to || !from) return false;
  if (to.lane) return false; // stepping onto the frontier is free
  if (from.lane) return true; // stepping off a frontier into a kingdom
  return from.kingdom !== to.kingdom;
}
export function citadelId(kingdom: KingdomId): string {
  return (
    // The home kingdom's citadel (buildBoard guarantees one exists per kingdom)…
    BOARD.order.find(
      (id) =>
        BOARD.territories[id].building === "citadel" && BOARD.territories[id].kingdom === kingdom
    ) ??
    // …else any square of the home kingdom…
    BOARD.order.find((id) => !BOARD.territories[id].lane && BOARD.territories[id].kingdom === kingdom) ??
    // …else *some* citadel (map missing this kingdom entirely) — never a random cell…
    BOARD.order.find((id) => BOARD.territories[id].building === "citadel") ??
    BOARD.order.find((id) => !BOARD.territories[id].lane) ??
    BOARD.order[0]
  );
}
export function isTowerAdjacent(id: string): boolean {
  return !!BOARD.territories[id]?.towerAdjacent;
}
