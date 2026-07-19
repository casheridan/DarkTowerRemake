/**
 * In-app Map Editor.
 *
 * Two authoring modes, one map:
 *  - **Seed mode** (legacy): place tagged points; tidy Voronoi cells are generated.
 *  - **Drawn mode**: draw each territory's border by hand (Draw tool). Vertices
 *    snap to neighbouring borders so touching territories share edges exactly,
 *    and adjacency derives from that real border contact. "Convert to drawn"
 *    turns the current generated map into editable polygons.
 *
 * The four frontiers stay permanent separators (width/rotation adjustable);
 * regions of different kingdoms can never connect. Links tool overrides
 * adjacency; the photo backdrop is transformable; wheel zooms, drag pans.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BOARD_CENTER,
  BOARD_RADIUS,
  BOARD_SIZE,
  DEFAULT_FRONTIER_WIDTH,
  DEFAULT_TOWER_RADIUS,
  KINGDOM_ORDER,
  MAX_FRONTIER_ROTATION,
  MAX_FRONTIER_WIDTH,
  MAX_TOWER_RADIUS,
  MIN_FRONTIER_WIDTH,
  MIN_TOWER_RADIUS,
  buildBoard,
  emptyLinks,
  loadBoardMap,
  proceduralSeeds,
  traceBorderPath,
  type AuthoredMap,
  type AuthoredSeed,
  type DrawnRegion,
  type KingdomId,
  type MapLinks,
  type TerritoryType,
} from "../engine";
import { BUILDING_META, KINGDOM_META } from "../ui/labels";
import {
  clearMap,
  loadMap,
  parseMapJson,
  saveMap,
  serializeMap,
} from "../store/mapStorage";
import { useGame } from "../store/useGame";
import "./MapEditor.css";

const C = BOARD_CENTER;
type Pt = [number, number];

/** A draft vertex; `on` is set when it lies on another territory's border. */
interface DraftPt {
  p: Pt;
  on?: { rid: string; edge: number; t: number };
}

const KINGDOM_CENTER: Record<KingdomId, number> = {
  arisilon: -45,
  brynthia: 45,
  durnin: 135,
  zenon: 225,
};
const TARGET_COUNT: Record<KingdomId, number> = {
  arisilon: 28,
  brynthia: 31,
  durnin: 28,
  zenon: 32,
};

const TYPES: { type: TerritoryType; label: string; icon: string; color: string }[] = [
  { type: "plain", label: "Plain", icon: "•", color: "#cdbf9a" },
  { type: "citadel", label: "Citadel", icon: BUILDING_META.citadel.icon, color: "var(--dt-gold)" },
  { type: "bazaar", label: "Bazaar", icon: BUILDING_META.bazaar.icon, color: "#7fd07f" },
  { type: "sanctuary", label: "Sanctuary", icon: BUILDING_META.sanctuary.icon, color: "#7fb6ff" },
  { type: "tomb", label: "Tomb", icon: BUILDING_META.tomb.icon, color: "#c79bff" },
  { type: "ruin", label: "Ruin", icon: BUILDING_META.ruin.icon, color: "#ffb060" },
  { type: "darkTower", label: "Dark-Tower region", icon: "✦", color: "var(--dt-led)" },
];
const TYPE_COLOR = Object.fromEntries(TYPES.map((t) => [t.type, t.color])) as Record<
  TerritoryType,
  string
>;

type Tool = "draw" | "place" | "move" | "delete" | "links" | "kingdom";

interface PhotoPrefs {
  opacity: number;
  scale: number;
  rot: number;
  x: number;
  y: number;
}
const PHOTO_KEY = "darktower.editor.photo";
const PHOTO_DEFAULT: PhotoPrefs = { opacity: 0.4, scale: 1, rot: 0, x: 0, y: 0 };
function loadPhotoPrefs(): PhotoPrefs {
  try {
    const raw = localStorage.getItem(PHOTO_KEY);
    if (!raw) return { ...PHOTO_DEFAULT };
    return { ...PHOTO_DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...PHOTO_DEFAULT };
  }
}

function angDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}
function polyPath(points: Pt[]): string {
  if (!points.length) return "";
  return (
    points.map((p, i) => `${i ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z"
  );
}
function newId(): string {
  return `t${Math.random().toString(36).slice(2, 9)}`;
}
function samePair(p: [string, string], x: string, y: string): boolean {
  return (p[0] === x && p[1] === y) || (p[0] === y && p[1] === x);
}
function hasPair(arr: [string, string][], x: string, y: string): boolean {
  return arr.some((p) => samePair(p, x, y));
}
function dropPair(arr: [string, string][], x: string, y: string): [string, string][] {
  return arr.filter((p) => !samePair(p, x, y));
}
function meanOf(pts: Pt[]): Pt {
  return [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ];
}

interface View {
  x: number;
  y: number;
  w: number;
}

interface EditorNotice {
  text: string;
  tone: "error" | "success";
}

export function MapEditor() {
  const setEditing = useGame((s) => s.setEditing);
  const saved = useMemo(() => loadMap(), []);
  const [seeds, setSeeds] = useState<AuthoredSeed[]>(saved?.seeds ?? proceduralSeeds());
  const [regions, setRegions] = useState<DrawnRegion[]>(saved?.regions ?? []);
  const [links, setLinks] = useState<MapLinks>(saved?.links ?? emptyLinks());
  const [towerRadius, setTowerRadius] = useState(saved?.towerRadius ?? DEFAULT_TOWER_RADIUS);
  const [frontierWidth, setFrontierWidth] = useState(
    saved?.frontierWidth ?? DEFAULT_FRONTIER_WIDTH
  );
  const [frontierRotation, setFrontierRotation] = useState(saved?.frontierRotation ?? 0);
  const [tool, setToolRaw] = useState<Tool>("draw");
  const [placeType, setPlaceType] = useState<TerritoryType>("plain");
  const [kingdomBrush, setKingdomBrush] = useState<KingdomId>("arisilon");
  const [photo, setPhoto] = useState<PhotoPrefs>(loadPhotoPrefs);
  const [view, setView] = useState<View>({ x: 0, y: 0, w: BOARD_SIZE });
  const [draft, setDraft] = useState<DraftPt[]>([]);
  const [hoverSnap, setHoverSnap] = useState<DraftPt | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [notice, setNoticeState] = useState<EditorNotice | null>(null);
  const setNotice = (text: string | null, tone: EditorNotice["tone"] = "error") =>
    setNoticeState(text ? { text, tone } : null);
  const dragIndex = useRef<number | null>(null); // seed being dragged (seed mode)
  const kingdomPainting = useRef(false); // dragging the Kingdom brush across cells
  const vertexDrag = useRef<{ rid: string; idx: number } | null>(null);
  const bodyDrag = useRef<{ rid: string; lx: number; ly: number } | null>(null);
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number; k: number } | null>(
    null
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const drawnMode = regions.length > 0;

  useEffect(() => {
    try {
      localStorage.setItem(PHOTO_KEY, JSON.stringify(photo));
    } catch {
      /* ignore */
    }
  }, [photo]);

  // Wheel zoom (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ctm = el.getScreenCTM();
      if (!ctm) return;
      if (e.ctrlKey || e.metaKey) {
        // Pinch (trackpads report it as ctrl+wheel) or Ctrl/Cmd+scroll → zoom.
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
        setView((v) => {
          const factor = Math.exp(e.deltaY * 0.01);
          const w = Math.min(BOARD_SIZE * 1.25, Math.max(90, v.w * factor));
          const k = w / v.w;
          return { x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k, w };
        });
      } else {
        // Two-finger scroll (or a mouse wheel) → pan.
        const s = 1 / ctm.a; // screen px → board units
        setView((v) => ({ ...v, x: v.x + e.deltaX * s, y: v.y + e.deltaY * s }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const map: AuthoredMap = useMemo(() => {
    const m: AuthoredMap = { towerRadius, seeds, links, frontierWidth, frontierRotation };
    if (regions.length) m.regions = regions;
    return m;
  }, [towerRadius, seeds, links, frontierWidth, frontierRotation, regions]);
  const preview = useMemo(() => buildBoard(map), [map]);
  const base = useMemo(
    () => buildBoard({ ...map, links: emptyLinks() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [towerRadius, seeds, regions, frontierWidth, frontierRotation]
  );

  /** All current borders (regions + frontier strips) for anchor tracing. */
  const borderPolys = useMemo(
    () => preview.order.map((id) => ({ id, polygon: preview.territories[id].polygon })),
    [preview]
  );

  const counts = useMemo(() => {
    const c = { arisilon: 0, brynthia: 0, durnin: 0, zenon: 0 } as Record<KingdomId, number>;
    if (drawnMode) for (const r of regions) c[r.kingdom]++;
    else for (const s of seeds) c[s.kingdom]++;
    return c;
  }, [drawnMode, regions, seeds]);

  const detectKingdom = (cx: number, cy: number): KingdomId => {
    const a = (Math.atan2(cy - C, cx - C) * 180) / Math.PI;
    let best: KingdomId = "arisilon";
    let bd = Infinity;
    for (const k of KINGDOM_ORDER) {
      const d = angDiff(a, KINGDOM_CENTER[k] + frontierRotation);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  };

  /**
   * Screen → board coordinates via the SVG's real transform matrix. Exact even
   * when CSS letterboxes the svg element (the old rect-based math drifted more
   * the farther the cursor was from the board centre).
   */
  const toPoint = (e: { clientX: number; clientY: number }): Pt => {
    const ctm = svgRef.current!.getScreenCTM();
    if (!ctm) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  };

  /**
   * Snap a point to the nearest border (vertex or edge) of any territory —
   * frontier strips included — within a zoom-aware tolerance. Returns the
   * snapped point plus which border it landed on, so drawing can trace it.
   */
  const snapForDraw = (raw: Pt, excludeRid: string | null): DraftPt => {
    const kz = view.w / BOARD_SIZE;
    const edgeTol = 9 * kz;
    const vertexTol = 12 * kz;
    let best: DraftPt = { p: raw };
    let bd = edgeTol;
    let bv = vertexTol;
    let vHit: DraftPt | null = null;
    for (const id of preview.order) {
      if (id === excludeRid) continue;
      const poly = preview.territories[id].polygon;
      if (poly.length < 2) continue;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        // corner candidate
        const dv = Math.hypot(raw[0] - a[0], raw[1] - a[1]);
        if (dv < bv) {
          bv = dv;
          vHit = { p: [a[0], a[1]], on: { rid: id, edge: i, t: 0 } };
        }
        // edge candidate
        const vx = b[0] - a[0];
        const vy = b[1] - a[1];
        const len = vx * vx + vy * vy;
        const t = len
          ? Math.max(0, Math.min(1, ((raw[0] - a[0]) * vx + (raw[1] - a[1]) * vy) / len))
          : 0;
        const px = a[0] + t * vx;
        const py = a[1] + t * vy;
        const d = Math.hypot(raw[0] - px, raw[1] - py);
        if (d < bd) {
          bd = d;
          best = { p: [px, py], on: { rid: id, edge: i, t } };
        }
      }
    }
    // Corners win with a slight bias — shared vertices are the glue of the map.
    if (vHit && bv < bd + 5 * kz) return vHit;
    return best;
  };

  const purgeLinksFor = (id: string) =>
    setLinks((l) => ({
      add: l.add.filter((p) => p[0] !== id && p[1] !== id),
      remove: l.remove.filter((p) => p[0] !== id && p[1] !== id),
    }));

  const setTool = (t: Tool) => {
    setToolRaw(t);
    setLinkFrom(null);
    setNotice(null);
    setDraft([]);
    setHoverSnap(null);
    setSelectedRegion(null);
  };

  // ---- draw tool -----------------------------------------------------------

  const closeDraft = () => {
    if (draft.length < 2) {
      setDraft([]);
      return;
    }
    let pts = draft.map((d) => d.p);
    // If the outline started and ended anchored on borders, trace the shortest
    // route home along the existing borders — across as many territories and
    // frontiers as it takes. One drawn line across a pocket's mouth is enough
    // to close the whole territory.
    const first = draft[0];
    const last = draft[draft.length - 1];
    if (first.on && last.on) {
      const closing = traceBorderPath(borderPolys, last.on, first.on);
      if (closing) pts = [...pts, ...closing];
    }
    if (pts.length < 3) {
      setNotice(
        "Can't close yet — draw at least 3 points, or anchor both ends on connected borders."
      );
      return;
    }
    const [mx, my] = meanOf(pts);
    setRegions((rs) => [
      ...rs,
      { id: newId(), kingdom: detectKingdom(mx, my), type: placeType, polygon: pts },
    ]);
    setDraft([]);
    setNotice(null);
  };
  const closeDraftRef = useRef(closeDraft);
  closeDraftRef.current = closeDraft;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDraft([]);
      else if (e.key === "Enter") closeDraftRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const addDraftPoint = (e: React.MouseEvent) => {
    const hit = snapForDraw(toPoint(e), null);
    const closeTol = 10 * (view.w / BOARD_SIZE);
    if (
      draft.length >= 3 &&
      Math.hypot(hit.p[0] - draft[0].p[0], hit.p[1] - draft[0].p[1]) < closeTol
    ) {
      closeDraft();
      return;
    }
    // Consecutive anchors on the SAME territory trace along its border, so the
    // shared stretch is exact. Anchors on different territories stay a straight
    // line — that's you drawing the new border across a gap (Close does the
    // border-tracing back home).
    let trace: Pt[] = [];
    const last = draft[draft.length - 1];
    if (last?.on && hit.on && last.on.rid === hit.on.rid) {
      trace = traceBorderPath(borderPolys, last.on, hit.on) ?? [];
    }
    setDraft((d) => [...d, ...trace.map((p) => ({ p })), hit]);
  };

  // ---- pointer handlers ----------------------------------------------------

  const beginPan = (e: React.MouseEvent) => {
    const ctm = svgRef.current!.getScreenCTM();
    panRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      vx: view.x,
      vy: view.y,
      k: ctm ? 1 / ctm.a : view.w / svgRef.current!.getBoundingClientRect().width,
    };
  };

  const onBackgroundDown = (e: React.MouseEvent) => {
    // Right-button drag pans from anywhere, with any tool.
    if (e.button === 2) {
      beginPan(e);
      return;
    }
    if (tool === "draw") {
      if (e.button !== 0) {
        beginPan(e);
        return;
      }
      addDraftPoint(e);
      return;
    }
    if (tool === "place" && !drawnMode) {
      const [cx, cy] = toPoint(e);
      const r = Math.hypot(cx - C, cy - C);
      if (r > BOARD_RADIUS - 4 || r < towerRadius + 6) return;
      setSeeds((s) => [
        ...s,
        { id: newId(), kingdom: detectKingdom(cx, cy), type: placeType, cx, cy },
      ]);
      return;
    }
    if (tool === "move") setSelectedRegion(null);
    beginPan(e);
  };

  const handleLinkClick = (id: string) => {
    if (!linkFrom) {
      setLinkFrom(id);
      setNotice(null);
      return;
    }
    if (linkFrom === id) {
      setLinkFrom(null);
      return;
    }
    const a = preview.territories[linkFrom];
    const b = preview.territories[id];
    if (!a || !b) return;
    if (a.lane && b.lane) {
      setNotice("Frontiers can't link to each other.");
      setLinkFrom(null);
      return;
    }
    if (!a.lane && !b.lane && a.kingdom !== b.kingdom) {
      setNotice("Different kingdoms can only meet at a frontier.");
      setLinkFrom(null);
      return;
    }
    toggleLink(linkFrom, id);
    setLinkFrom(null);
    setNotice(null);
  };

  const toggleLink = (x: string, y: string) => {
    const baseHas = base.territories[x]?.neighbors.includes(y) ?? false;
    setLinks((l) => {
      const inAdd = hasPair(l.add, x, y);
      const inRemove = hasPair(l.remove, x, y);
      const current = inAdd || (baseHas && !inRemove);
      if (current) {
        return {
          add: dropPair(l.add, x, y),
          remove: baseHas
            ? [...dropPair(l.remove, x, y), [x, y] as [string, string]]
            : dropPair(l.remove, x, y),
        };
      }
      return {
        remove: dropPair(l.remove, x, y),
        add: baseHas
          ? dropPair(l.add, x, y)
          : [...dropPair(l.add, x, y), [x, y] as [string, string]],
      };
    });
  };

  const onLineDown = (e: React.MouseEvent, key: string) => {
    if (e.button === 2) return; // bubble up → right-drag pan
    e.stopPropagation();
    const [a, b] = key.split("|");
    toggleLink(a, b);
    setLinkFrom(null);
    setNotice(null);
  };

  const deleteRegion = (id: string) => {
    purgeLinksFor(id);
    setRegions((rs) => rs.filter((r) => r.id !== id));
    if (selectedRegion === id) setSelectedRegion(null);
  };

  const retagRegion = (id: string) =>
    setRegions((rs) => rs.map((r) => (r.id === id ? { ...r, type: placeType } : r)));

  /** Assign the currently-brushed kingdom to a territory (region or seed cell). */
  const paintKingdom = (id: string) => {
    const t = preview.territories[id];
    if (!t || t.lane) return;
    if (drawnMode) {
      setRegions((rs) => rs.map((r) => (r.id === id ? { ...r, kingdom: kingdomBrush } : r)));
    } else {
      const idx = seeds.findIndex((s) => s.id === id);
      if (idx >= 0) setSeeds((s) => s.map((sd, i) => (i === idx ? { ...sd, kingdom: kingdomBrush } : sd)));
    }
  };

  const onCellEnter = (id: string) => {
    if (tool === "kingdom" && kingdomPainting.current) paintKingdom(id);
  };

  const onCellDown = (e: React.MouseEvent, id: string) => {
    if (e.button === 2) return; // bubble up → right-drag pan
    const t = preview.territories[id];
    if (tool === "links") {
      e.stopPropagation();
      handleLinkClick(id);
      return;
    }
    if (tool === "kingdom") {
      if (t?.lane) return;
      e.stopPropagation();
      paintKingdom(id);
      kingdomPainting.current = true;
      return;
    }
    if (t?.lane || !drawnMode) return; // lanes & seed mode fall through
    if (tool === "place") {
      e.stopPropagation();
      retagRegion(id);
    } else if (tool === "delete") {
      e.stopPropagation();
      deleteRegion(id);
    } else if (tool === "move") {
      e.stopPropagation();
      setSelectedRegion(id);
      const [px, py] = toPoint(e);
      bodyDrag.current = { rid: id, lx: px, ly: py };
    }
    // draw: no stopPropagation — clicks pass through to add vertices anywhere
  };

  const onMarkerDown = (e: React.MouseEvent, i: number) => {
    if (e.button === 2) return; // bubble up → right-drag pan
    e.stopPropagation();
    const seed = seeds[i];
    if (tool === "links") {
      handleLinkClick(seed.id);
    } else if (tool === "delete") {
      purgeLinksFor(seed.id);
      setSeeds((s) => s.filter((_, idx) => idx !== i));
    } else if (tool === "move") {
      dragIndex.current = i;
    } else if (tool === "place") {
      setSeeds((s) => s.map((sd, idx) => (idx === i ? { ...sd, type: placeType } : sd)));
    } else if (tool === "kingdom") {
      setSeeds((s) => s.map((sd, idx) => (idx === i ? { ...sd, kingdom: kingdomBrush } : sd)));
    }
  };

  const onMove = (e: React.MouseEvent) => {
    if (tool === "draw" && !panRef.current) {
      setHoverSnap(snapForDraw(toPoint(e), null));
    }
    if (dragIndex.current != null) {
      const [cx, cy] = toPoint(e);
      const i = dragIndex.current;
      setSeeds((s) =>
        s.map((sd, idx) => (idx === i ? { ...sd, kingdom: detectKingdom(cx, cy), cx, cy } : sd))
      );
      return;
    }
    if (vertexDrag.current) {
      const { rid, idx } = vertexDrag.current;
      const p = snapForDraw(toPoint(e), rid).p;
      setRegions((rs) =>
        rs.map((r) =>
          r.id === rid
            ? { ...r, polygon: r.polygon.map((pt, i) => (i === idx ? p : pt)) }
            : r
        )
      );
      return;
    }
    if (bodyDrag.current) {
      const [px, py] = toPoint(e);
      const { rid, lx, ly } = bodyDrag.current;
      const dx = px - lx;
      const dy = py - ly;
      bodyDrag.current = { rid, lx: px, ly: py };
      setRegions((rs) =>
        rs.map((r) => {
          if (r.id !== rid) return r;
          const polygon = r.polygon.map(([x, y]) => [x + dx, y + dy] as Pt);
          const [mx, my] = meanOf(polygon);
          return { ...r, polygon, kingdom: detectKingdom(mx, my) };
        })
      );
      return;
    }
    const pan = panRef.current;
    if (pan) {
      setView((v) => ({
        ...v,
        x: pan.vx - (e.clientX - pan.sx) * pan.k,
        y: pan.vy - (e.clientY - pan.sy) * pan.k,
      }));
    }
  };
  const endDrag = () => {
    dragIndex.current = null;
    kingdomPainting.current = false;
    vertexDrag.current = null;
    bodyDrag.current = null;
    panRef.current = null;
  };

  const zoomBy = (factor: number) =>
    setView((v) => {
      const w = Math.min(BOARD_SIZE * 1.25, Math.max(90, v.w * factor));
      const cx = v.x + v.w / 2;
      const cy = v.y + v.w / 2;
      return { x: cx - w / 2, y: cy - w / 2, w };
    });
  const zoomReset = () => setView({ x: 0, y: 0, w: BOARD_SIZE });

  // ---- map lifecycle ---------------------------------------------------------

  const convertToDrawn = () => {
    const regs: DrawnRegion[] = preview.order
      .filter((id) => !preview.territories[id].lane)
      .map((id) => {
        const t = preview.territories[id];
        return {
          id,
          kingdom: t.kingdom,
          type: (t.darkTowerRegion
            ? "darkTower"
            : (t.building ?? "plain")) as TerritoryType,
          polygon: t.polygon.map((p) => [p[0], p[1]] as Pt),
        };
      })
      .filter((r) => r.polygon.length >= 3);
    setRegions(regs);
    setSeeds([]);
    setNotice("Converted the generated map into drawn regions — edit borders with Move.");
  };

  const clearAll = () => {
    setSeeds([]);
    setRegions([]);
    setLinks(emptyLinks());
    setDraft([]);
    setLinkFrom(null);
    setSelectedRegion(null);
  };
  const startDefault = () => {
    setSeeds(proceduralSeeds());
    setRegions([]);
    setLinks(emptyLinks());
    setTowerRadius(DEFAULT_TOWER_RADIUS);
    setFrontierWidth(DEFAULT_FRONTIER_WIDTH);
    setFrontierRotation(0);
    setDraft([]);
    setLinkFrom(null);
    setSelectedRegion(null);
  };
  const commit = (play: boolean) => {
    saveMap(map);
    loadBoardMap(map);
    if (play) setEditing(false);
  };
  const resetDefault = () => {
    clearMap();
    loadBoardMap(null);
    startDefault();
  };
  const exportJson = () => {
    const blob = new Blob([serializeMap(map, true)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "darktower-map.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const importJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    try {
      const imported = parseMapJson(await file.text());
      setSeeds(imported.seeds);
      setRegions(imported.regions ?? []);
      setLinks(imported.links);
      setTowerRadius(imported.towerRadius);
      setFrontierWidth(imported.frontierWidth ?? DEFAULT_FRONTIER_WIDTH);
      setFrontierRotation(imported.frontierRotation ?? 0);
      setDraft([]);
      setHoverSnap(null);
      setLinkFrom(null);
      setSelectedRegion(null);
      setNotice(`Imported ${file.name}. Review the map, then Save to keep it.`, "success");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The map could not be imported.");
    }
  };

  const linkLines = useMemo(() => {
    if (tool !== "links") return [];
    const out: { key: string; x1: number; y1: number; x2: number; y2: number; added: boolean }[] =
      [];
    for (const id of preview.order) {
      const t = preview.territories[id];
      for (const n of t.neighbors) {
        if (n === "tower" || n < id) continue;
        const o = preview.territories[n];
        if (!o) continue;
        out.push({
          key: `${id}|${n}`,
          x1: t.cx,
          y1: t.cy,
          x2: o.cx,
          y2: o.cy,
          added: hasPair(links.add, id, n),
        });
      }
    }
    return out;
  }, [tool, preview, links.add]);

  const selected = selectedRegion ? regions.find((r) => r.id === selectedRegion) : null;
  const photoTransform = `translate(${C + photo.x} ${C + photo.y}) rotate(${photo.rot}) scale(${photo.scale}) translate(${-C} ${-C})`;

  return (
    <div className="editor">
      <div className="editor__stage">
        <div className="editor__zoom">
          <button className="ed-zoom-btn" onClick={() => zoomBy(0.75)} title="Zoom in">
            +
          </button>
          <button className="ed-zoom-btn" onClick={() => zoomBy(1.333)} title="Zoom out">
            −
          </button>
          <button className="ed-zoom-btn ed-zoom-btn--txt" onClick={zoomReset} title="Reset view">
            {Math.round((BOARD_SIZE / view.w) * 100)}%
          </button>
        </div>
        <svg
          ref={svgRef}
          className="editor__svg"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.w}`}
          onMouseDown={onBackgroundDown}
          onMouseMove={onMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onContextMenu={(e) => e.preventDefault()}
        >
          <defs>
            <clipPath id="edClip">
              <circle cx={C} cy={C} r={BOARD_RADIUS} />
            </clipPath>
          </defs>
          <circle cx={C} cy={C} r={BOARD_RADIUS + 4} className="editor__disc" />
          <g clipPath="url(#edClip)">
            <g transform={photoTransform} opacity={photo.opacity}>
              <image
                href="/board-photo.png"
                x={C - BOARD_RADIUS}
                y={C - BOARD_RADIUS}
                width={BOARD_RADIUS * 2}
                height={BOARD_RADIUS * 2}
                preserveAspectRatio="xMidYMid slice"
              />
            </g>
            {preview.order.map((id) => {
              const t = preview.territories[id];
              if (!t.polygon.length) return null;
              return (
                <path
                  key={id}
                  d={polyPath(t.polygon)}
                  className={[
                    "ed-cell",
                    t.lane ? "ed-cell--lane" : "",
                    linkFrom === id ? "ed-cell--linkfrom" : "",
                    selectedRegion === id ? "ed-cell--selected" : "",
                    tool === "links" ? "ed-cell--linkable" : "",
                  ].join(" ")}
                  style={{
                    fill: t.lane
                      ? "var(--dt-parchment-dark)"
                      : `var(${KINGDOM_META[t.kingdom].colorVar})`,
                  }}
                  onMouseDown={(e) => onCellDown(e, id)}
                  onMouseEnter={() => onCellEnter(id)}
                />
              );
            })}
            {linkLines.map((l) => (
              <g key={l.key}>
                <line
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  className={`ed-link ${l.added ? "ed-link--added" : ""}`}
                />
                <line
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  className="ed-link-hit"
                  onMouseDown={(e) => onLineDown(e, l.key)}
                />
              </g>
            ))}
          </g>
          <circle cx={C} cy={C} r={towerRadius} className="editor__tower" />
          <text x={C} y={C + 4} textAnchor="middle" className="editor__tower-label">
            TOWER
          </text>

          {/* Kingdom name labels — centred on each kingdom's actual territories,
              so re-painting a kingdom moves its label to match. */}
          {KINGDOM_ORDER.map((k) => {
            const cells = preview.order.filter(
              (id) =>
                !preview.territories[id].lane &&
                preview.territories[id].kingdom === k &&
                preview.territories[id].polygon.length > 0
            );
            let x: number;
            let y: number;
            if (cells.length) {
              x = cells.reduce((s, id) => s + preview.territories[id].cx, 0) / cells.length;
              y = cells.reduce((s, id) => s + preview.territories[id].cy, 0) / cells.length;
            } else {
              const ang = ((KINGDOM_CENTER[k] + frontierRotation) * Math.PI) / 180;
              x = C + BOARD_RADIUS * 0.66 * Math.cos(ang);
              y = C + BOARD_RADIUS * 0.66 * Math.sin(ang);
            }
            return (
              <text
                key={`kl-${k}`}
                x={x}
                y={y}
                textAnchor="middle"
                className={`ed-kingdom-label ${tool === "kingdom" ? "ed-kingdom-label--active" : ""}`}
              >
                {KINGDOM_META[k].name}
              </text>
            );
          })}

          {/* Seed markers (seed mode only) */}
          {!drawnMode &&
            seeds.map((s, i) => (
              <g key={s.id} onMouseDown={(e) => onMarkerDown(e, i)} className="ed-marker">
                <circle
                  cx={s.cx}
                  cy={s.cy}
                  r={s.type === "plain" ? 5 : 9}
                  style={{ fill: TYPE_COLOR[s.type] }}
                />
                {s.type !== "plain" && (
                  <text x={s.cx} y={s.cy + 4} textAnchor="middle" className="ed-marker__icon">
                    {TYPES.find((t) => t.type === s.type)!.icon}
                  </text>
                )}
              </g>
            ))}

          {/* Region type icons (drawn mode) */}
          {drawnMode &&
            preview.order.map((id) => {
              const t = preview.territories[id];
              if (t.lane || !t.polygon.length) return null;
              const icon = t.darkTowerRegion
                ? "✦"
                : t.building
                  ? BUILDING_META[t.building].icon
                  : null;
              if (!icon) return null;
              return (
                <text
                  key={`icon-${id}`}
                  x={t.cx}
                  y={t.cy + 5}
                  textAnchor="middle"
                  className="ed-region-icon"
                >
                  {icon}
                </text>
              );
            })}

          {/* Vertex handles for the selected region (Move tool) */}
          {tool === "move" &&
            selected &&
            selected.polygon.map((p, i) => (
              <circle
                key={`v-${i}`}
                cx={p[0]}
                cy={p[1]}
                r={5 * Math.min(1.6, view.w / BOARD_SIZE + 0.4)}
                className="ed-vertex"
                onMouseDown={(e) => {
                  if (e.button === 2) return; // bubble up → right-drag pan
                  e.stopPropagation();
                  vertexDrag.current = { rid: selected.id, idx: i };
                }}
              />
            ))}

          {/* In-progress drawing */}
          {draft.length > 0 && (
            <g>
              <path
                d={draft.map((d, i) => `${i ? "L" : "M"} ${d.p[0]} ${d.p[1]}`).join(" ")}
                className="ed-draft__line"
              />
              {hoverSnap && (
                <line
                  x1={draft[draft.length - 1].p[0]}
                  y1={draft[draft.length - 1].p[1]}
                  x2={hoverSnap.p[0]}
                  y2={hoverSnap.p[1]}
                  className="ed-draft__preview"
                />
              )}
              {draft.map((d, i) => (
                <circle
                  key={i}
                  cx={d.p[0]}
                  cy={d.p[1]}
                  r={i === 0 ? 6 : 4}
                  className={i === 0 ? "ed-draft__first" : "ed-draft__pt"}
                />
              ))}
            </g>
          )}
          {/* Snap cursor: filled gold dot = corner anchor; ring + lit segment = border-line anchor */}
          {tool === "draw" && hoverSnap && (
            <g>
              {hoverSnap.on &&
                hoverSnap.on.t > 0 &&
                (() => {
                  const poly = preview.territories[hoverSnap.on!.rid]?.polygon;
                  if (!poly || poly.length < 2) return null;
                  const a = poly[hoverSnap.on!.edge % poly.length];
                  const b = poly[(hoverSnap.on!.edge + 1) % poly.length];
                  return (
                    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="ed-snap-edge" />
                  );
                })()}
              <circle
                cx={hoverSnap.p[0]}
                cy={hoverSnap.p[1]}
                r={hoverSnap.on ? (hoverSnap.on.t === 0 ? 7 : 5.5) : 4}
                className={`ed-snap ${
                  hoverSnap.on
                    ? hoverSnap.on.t === 0
                      ? "ed-snap--vertex"
                      : "ed-snap--anchor"
                    : ""
                }`}
              />
            </g>
          )}
        </svg>
      </div>

      <aside className="editor__panel">
        <h2>Map Editor</h2>
        <p className="editor__hint">
          <strong>Draw</strong>: click around a territory's border, then click the first
          point (or press Enter) to close it. Vertices snap to neighbouring borders, and
          touching territories connect automatically. Two-finger scroll or right-drag to
          pan; pinch, Ctrl+scroll, or the buttons to zoom.
        </p>

        <div className="editor__group">
          <label>Tool</label>
          <div className="editor__row">
            {(["draw", "place", "kingdom", "move", "delete", "links"] as Tool[]).map((t) => (
              <button
                key={t}
                className={`ed-btn ed-btn--tool ${tool === t ? "ed-btn--on" : ""}`}
                onClick={() => setTool(t)}
              >
                {t === "draw"
                  ? "Draw"
                  : t === "place"
                    ? drawnMode
                      ? "Tag"
                      : "Place"
                    : t === "kingdom"
                      ? "Kingdom"
                      : t === "move"
                        ? "Move"
                        : t === "delete"
                          ? "Delete"
                          : "Links"}
              </button>
            ))}
          </div>
          {tool === "draw" && (
            <>
              <p className="editor__tooltip">
                {draft.length >= 2 && draft[0].on && draft[draft.length - 1].on
                  ? `${draft.length} points, both ends anchored — Close will trace the rest of the border for you.`
                  : draft.length
                    ? `${draft.length} point${draft.length === 1 ? "" : "s"} — close by clicking the first point or pressing Enter.`
                    : "Click to outline. A gold dot = corner anchor, a gold line = border anchor. Anchor both ends and one line can close a whole territory."}
              </p>
              <div className="editor__row" style={{ marginTop: "0.4rem" }}>
                <button
                  className="ed-btn"
                  disabled={
                    !(
                      draft.length >= 3 ||
                      (draft.length === 2 && !!draft[0].on && !!draft[1].on)
                    )
                  }
                  onClick={closeDraft}
                >
                  Close shape
                </button>
                <button className="ed-btn" disabled={!draft.length} onClick={() => setDraft([])}>
                  Cancel (Esc)
                </button>
              </div>
            </>
          )}
          {tool === "links" && (
            <p className="editor__tooltip">
              {linkFrom
                ? "Now click the second territory…"
                : "Click two territories to toggle a connection — or click a line to cut it."}
            </p>
          )}
          {tool === "move" && drawnMode && (
            <p className="editor__tooltip">
              Click a territory to select it, drag its white handles to reshape, or drag its
              body to move it.
            </p>
          )}
          {tool === "kingdom" && (
            <p className="editor__tooltip">
              Pick a kingdom below, then click (or drag across) territories to assign them to it.
              This sets who owns the land and where that kingdom's ruler starts.
            </p>
          )}
        </div>

        {notice && (
          <div
            className={`editor__notice editor__notice--${notice.tone}`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </div>
        )}

        {(tool === "draw" || tool === "place") && (
          <div className="editor__group">
            <label>{drawnMode && tool === "place" ? "Tag clicked territory as" : "Territory type"}</label>
            <div className="editor__types">
              {TYPES.map((t) => (
                <button
                  key={t.type}
                  className={`ed-type ${placeType === t.type ? "ed-type--on" : ""}`}
                  onClick={() => setPlaceType(t.type)}
                  style={{ borderColor: t.color }}
                >
                  <span style={{ color: t.color }}>{t.icon}</span> {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {tool === "kingdom" && (
          <div className="editor__group">
            <label>Assign clicked land to</label>
            <div className="editor__types">
              {KINGDOM_ORDER.map((k) => (
                <button
                  key={k}
                  className={`ed-type ${kingdomBrush === k ? "ed-type--on" : ""}`}
                  onClick={() => setKingdomBrush(k)}
                  style={{ borderColor: `var(${KINGDOM_META[k].colorVar})` }}
                >
                  <span
                    className="ed-count__crest"
                    style={{ background: `var(${KINGDOM_META[k].colorVar})` }}
                  />{" "}
                  {KINGDOM_META[k].name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="editor__group">
          <label>Dark Tower size — {towerRadius}px</label>
          <input
            type="range"
            min={MIN_TOWER_RADIUS}
            max={MAX_TOWER_RADIUS}
            step={2}
            value={towerRadius}
            onChange={(e) => setTowerRadius(Number(e.target.value))}
          />
        </div>

        <div className="editor__group">
          <label>Frontier width — {frontierWidth}°</label>
          <input
            type="range"
            min={MIN_FRONTIER_WIDTH}
            max={MAX_FRONTIER_WIDTH}
            step={0.5}
            value={frontierWidth}
            onChange={(e) => setFrontierWidth(Number(e.target.value))}
          />
          <label>Frontier rotation — {frontierRotation}°</label>
          <input
            type="range"
            min={-MAX_FRONTIER_ROTATION}
            max={MAX_FRONTIER_ROTATION}
            step={0.5}
            value={frontierRotation}
            onChange={(e) => setFrontierRotation(Number(e.target.value))}
          />
        </div>

        <div className="editor__group">
          <label>Photo — opacity {Math.round(photo.opacity * 100)}%</label>
          <input
            type="range"
            min={0}
            max={0.85}
            step={0.05}
            value={photo.opacity}
            onChange={(e) => setPhoto((p) => ({ ...p, opacity: Number(e.target.value) }))}
          />
          <label>Photo scale — {photo.scale.toFixed(2)}×</label>
          <input
            type="range"
            min={0.4}
            max={2.5}
            step={0.01}
            value={photo.scale}
            onChange={(e) => setPhoto((p) => ({ ...p, scale: Number(e.target.value) }))}
          />
          <label>Photo rotation — {photo.rot}°</label>
          <input
            type="range"
            min={-180}
            max={180}
            step={0.5}
            value={photo.rot}
            onChange={(e) => setPhoto((p) => ({ ...p, rot: Number(e.target.value) }))}
          />
          <label>Photo X — {photo.x}px</label>
          <input
            type="range"
            min={-250}
            max={250}
            step={1}
            value={photo.x}
            onChange={(e) => setPhoto((p) => ({ ...p, x: Number(e.target.value) }))}
          />
          <label>Photo Y — {photo.y}px</label>
          <input
            type="range"
            min={-250}
            max={250}
            step={1}
            value={photo.y}
            onChange={(e) => setPhoto((p) => ({ ...p, y: Number(e.target.value) }))}
          />
          <button className="ed-btn" onClick={() => setPhoto({ ...PHOTO_DEFAULT })}>
            Reset photo
          </button>
        </div>

        <div className="editor__group">
          <label>Counts (placed / target)</label>
          <div className="editor__counts">
            {KINGDOM_ORDER.map((k) => (
              <div key={k} className="ed-count">
                <span
                  className="ed-count__crest"
                  style={{ background: `var(${KINGDOM_META[k].colorVar})` }}
                />
                {KINGDOM_META[k].name}
                <strong className={counts[k] === TARGET_COUNT[k] ? "ok" : ""}>
                  {counts[k]}/{TARGET_COUNT[k]}
                </strong>
              </div>
            ))}
          </div>
        </div>

        <div className="editor__actions">
          {!drawnMode && (
            <button className="ed-btn" onClick={convertToDrawn}>
              Convert to drawn
            </button>
          )}
          <button className="ed-btn" onClick={startDefault}>
            Start from default
          </button>
          <button className="ed-btn" onClick={clearAll}>
            Clear all
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            onChange={importJson}
            hidden
          />
          <button className="ed-btn" onClick={() => importInputRef.current?.click()}>
            Import JSON
          </button>
          <button className="ed-btn" onClick={exportJson}>
            Export JSON
          </button>
          <button className="ed-btn ed-btn--warn" onClick={resetDefault}>
            Reset to default map
          </button>
        </div>

        <div className="editor__primary">
          <button className="ed-save" onClick={() => commit(false)}>
            Save
          </button>
          <button className="ed-play" onClick={() => commit(true)}>
            Save &amp; Play
          </button>
        </div>
        <button className="editor__back" onClick={() => setEditing(false)}>
          ← Back to menu (unsaved changes are discarded)
        </button>
      </aside>
    </div>
  );
}
