import { describe, expect, it } from "vitest";
import {
  BOARD,
  BOARD_CENTER,
  MAX_TOWER_RADIUS,
  MIN_TOWER_RADIUS,
  buildBoard,
  citadelId,
  emptyLinks,
  isLane,
  neighborsOf,
  proceduralSeeds,
} from "../board";
import { traceBorderPath, walkBorder, type DrawnRegion } from "../board";
import { KINGDOM_ORDER } from "../constants";
import type { BuildingType, KingdomId } from "../types";

const sq = (x: number, y: number, s: number): [number, number][] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];
const region = (
  id: string,
  x: number,
  y: number,
  extra: Partial<DrawnRegion> = {}
): DrawnRegion => ({
  id,
  kingdom: "arisilon",
  type: "plain",
  polygon: sq(x, y, 50),
  ...extra,
});

const EXPECTED_COUNT: Record<KingdomId, number> = {
  arisilon: 28,
  brynthia: 31,
  durnin: 28,
  zenon: 32,
};

const realTerritories = (k: KingdomId) =>
  BOARD.order.map((id) => BOARD.territories[id]).filter((t) => !t.lane && t.kingdom === k);

describe("board structure (default map)", () => {
  it("matches the physical per-kingdom territory counts", () => {
    for (const k of KINGDOM_ORDER) {
      expect(realTerritories(k).length).toBe(EXPECTED_COUNT[k]);
    }
  });

  it("gives every kingdom a citadel + four buildings + a dark-tower region", () => {
    const needed: BuildingType[] = ["citadel", "bazaar", "sanctuary", "tomb", "ruin"];
    for (const k of KINGDOM_ORDER) {
      const terrs = realTerritories(k);
      const buildings = terrs.map((t) => t.building).filter(Boolean);
      for (const b of needed) expect(buildings).toContain(b);
      expect(terrs.some((t) => t.darkTowerRegion)).toBe(true);
    }
  });

  it("places each citadel on the outer rim", () => {
    for (const k of KINGDOM_ORDER) {
      const terrs = realTerritories(k);
      const radius = (t: (typeof terrs)[number]) =>
        Math.hypot(t.cx - BOARD_CENTER, t.cy - BOARD_CENTER);
      const citadel = terrs.find((t) => t.building === "citadel")!;
      const avg = terrs.reduce((s, t) => s + radius(t), 0) / terrs.length;
      expect(radius(citadel)).toBeGreaterThan(avg);
    }
  });

  it("frontiers are hard separators — no region ever borders another kingdom's region", () => {
    for (const id of BOARD.order) {
      const t = BOARD.territories[id];
      if (t.lane) continue;
      for (const n of t.neighbors) {
        if (n === "tower" || isLane(n)) continue;
        expect(BOARD.territories[n].kingdom).toBe(t.kingdom);
      }
    }
  });

  it("connects each kingdom to a frontier", () => {
    for (const k of KINGDOM_ORDER) {
      expect(realTerritories(k).some((t) => t.neighbors.some((n) => isLane(n)))).toBe(true);
    }
  });

  it("borders the Dark Tower from every kingdom (via its dark-tower region only)", () => {
    for (const k of KINGDOM_ORDER) {
      const withTower = realTerritories(k).filter((t) => t.neighbors.includes("tower"));
      expect(withTower.length).toBe(1);
      expect(withTower[0].darkTowerRegion).toBe(true);
    }
  });

  it("is fully connected — every territory and the Tower reachable from a citadel", () => {
    const start = citadelId("arisilon");
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of neighborsOf(cur)) {
        if (!seen.has(n)) {
          seen.add(n);
          if (n !== "tower") queue.push(n);
        }
      }
    }
    expect(seen.has("tower")).toBe(true);
    for (const id of BOARD.order) expect(seen.has(id)).toBe(true);
    const reached = new Set(
      [...seen]
        .filter((s) => s !== "tower")
        .map((s) => BOARD.territories[s])
        .filter((t) => t && !t.lane)
        .map((t) => t.kingdom)
    );
    expect(reached.size).toBe(4);
  });
});

describe("authored maps", () => {
  it("an empty map is just the four frontiers", () => {
    const b = buildBoard({ towerRadius: 80, seeds: [], links: emptyLinks() });
    expect(b.order).toEqual(["frontier-0", "frontier-1", "frontier-2", "frontier-3"]);
    expect(b.towerRadius).toBe(80);
  });

  it("clamps the tower radius", () => {
    const seeds = proceduralSeeds();
    expect(buildBoard({ towerRadius: 999, seeds, links: emptyLinks() }).towerRadius).toBe(
      MAX_TOWER_RADIUS
    );
    expect(buildBoard({ towerRadius: 1, seeds, links: emptyLinks() }).towerRadius).toBe(
      MIN_TOWER_RADIUS
    );
  });

  it("applies add/remove link overrides (both directions)", () => {
    const seeds = proceduralSeeds();
    const base = buildBoard({ towerRadius: 58, seeds, links: emptyLinks() });
    const arisilon = seeds.filter((s) => s.kingdom === "arisilon");
    // find a same-kingdom pair NOT adjacent in base
    let addPair: [string, string] | null = null;
    outer: for (const a of arisilon) {
      for (const b of arisilon) {
        if (a.id !== b.id && !base.territories[a.id].neighbors.includes(b.id)) {
          addPair = [a.id, b.id];
          break outer;
        }
      }
    }
    // and an adjacent pair to remove
    const remFrom = arisilon.find((s) =>
      base.territories[s.id].neighbors.some((n) => !n.startsWith("frontier") && n !== "tower")
    )!;
    const remTo = base.territories[remFrom.id].neighbors.find(
      (n) => !n.startsWith("frontier") && n !== "tower"
    )!;

    const b2 = buildBoard({
      towerRadius: 58,
      seeds,
      links: { add: addPair ? [addPair] : [], remove: [[remFrom.id, remTo]] },
    });
    if (addPair) {
      expect(b2.territories[addPair[0]].neighbors).toContain(addPair[1]);
      expect(b2.territories[addPair[1]].neighbors).toContain(addPair[0]);
    }
    expect(b2.territories[remFrom.id].neighbors).not.toContain(remTo);
    expect(b2.territories[remTo].neighbors).not.toContain(remFrom.id);
  });

  it("applies frontier rotation and width", () => {
    const seeds = proceduralSeeds();
    const rotated = buildBoard({
      towerRadius: 58,
      seeds,
      links: emptyLinks(),
      frontierRotation: 10,
      frontierWidth: 12,
    });
    const f0 = rotated.territories["frontier-0"];
    const ang = (Math.atan2(f0.cy - BOARD_CENTER, f0.cx - BOARD_CENTER) * 180) / Math.PI;
    expect(Math.abs(ang - 10)).toBeLessThan(0.5);

    // Wider strips → farther-apart outer corners than the default width.
    const narrow = buildBoard({ towerRadius: 58, seeds, links: emptyLinks(), frontierWidth: 3 });
    const wideOuter = Math.hypot(
      f0.polygon[1][0] - f0.polygon[2][0],
      f0.polygon[1][1] - f0.polygon[2][1]
    );
    const n0 = narrow.territories["frontier-0"];
    const narrowOuter = Math.hypot(
      n0.polygon[1][0] - n0.polygon[2][0],
      n0.polygon[1][1] - n0.polygon[2][1]
    );
    expect(wideOuter).toBeGreaterThan(narrowOuter);
  });

  it("rejects cross-kingdom region↔region add links (drawn separator invariant)", () => {
    const seeds = proceduralSeeds();
    const a = seeds.find((s) => s.kingdom === "arisilon")!;
    const b = seeds.find((s) => s.kingdom === "brynthia")!;
    const board = buildBoard({ towerRadius: 58, seeds, links: { add: [[a.id, b.id]], remove: [] } });
    expect(board.territories[a.id].neighbors).not.toContain(b.id);
    expect(board.territories[b.id].neighbors).not.toContain(a.id);
  });
});

describe("walkBorder", () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it("takes the shorter way around and excludes endpoints", () => {
    expect(walkBorder(square, { edge: 0, t: 0.5 }, { edge: 1, t: 0.5 })).toEqual([[10, 0]]);
    expect(walkBorder(square, { edge: 1, t: 0.5 }, { edge: 0, t: 0.5 })).toEqual([[10, 0]]);
  });

  it("returns nothing for two positions on the same edge", () => {
    expect(walkBorder(square, { edge: 0, t: 0.25 }, { edge: 0, t: 0.75 })).toEqual([]);
  });

  it("handles vertex-to-vertex walks", () => {
    // v1 → v3: both ways are equal length; forward passes v2.
    expect(walkBorder(square, { edge: 1, t: 0 }, { edge: 3, t: 0 })).toEqual([[10, 10]]);
  });
});

describe("traceBorderPath", () => {
  // Two triangles sharing the vertex (10,0) — the user's "third triangle" case.
  const tri1: [number, number][] = [
    [0, 0],
    [10, 0],
    [5, 8],
  ];
  const tri2: [number, number][] = [
    [10, 0],
    [20, 0],
    [15, 8],
  ];
  const polys = [
    { id: "t1", polygon: tri1 },
    { id: "t2", polygon: tri2 },
  ];

  it("crosses between different territories through shared points", () => {
    const path = traceBorderPath(
      polys,
      { rid: "t1", edge: 0, t: 0.5 },
      { rid: "t2", edge: 0, t: 0.5 }
    );
    expect(path).toEqual([[10, 0]]); // via the shared vertex
  });

  it("connects two anchors on the same edge directly", () => {
    const path = traceBorderPath(
      polys,
      { rid: "t1", edge: 0, t: 0.2 },
      { rid: "t1", edge: 0, t: 0.8 }
    );
    expect(path).toEqual([]);
  });

  it("returns null when the borders are not connected", () => {
    const far = [
      { id: "a", polygon: tri1 },
      {
        id: "b",
        polygon: [
          [100, 100],
          [110, 100],
          [105, 108],
        ] as [number, number][],
      },
    ];
    expect(
      traceBorderPath(far, { rid: "a", edge: 0, t: 0.5 }, { rid: "b", edge: 0, t: 0.5 })
    ).toBeNull();
  });
});

describe("drawn regions", () => {
  it("derives adjacency from shared borders — but not from corner touches", () => {
    const regions = [region("a", 430, 200), region("b", 480, 200), region("d", 480, 250)];
    const b = buildBoard({ towerRadius: 58, seeds: [], links: emptyLinks(), regions });
    expect(b.territories["a"].neighbors).toContain("b"); // shared edge x=480
    expect(b.territories["b"].neighbors).toContain("a");
    expect(b.territories["a"].neighbors).not.toContain("d"); // corner touch only
    expect(b.territories["b"].neighbors).toContain("d"); // shared edge y=250
  });

  it("takes precedence over seeds when present", () => {
    const b = buildBoard({
      towerRadius: 58,
      seeds: proceduralSeeds(),
      links: emptyLinks(),
      regions: [region("only", 430, 200)],
    });
    const nonLane = b.order.filter((id) => !b.territories[id].lane);
    expect(nonLane).toEqual(["only"]);
  });

  it("darkTower regions border the Tower; lane-crossing regions link to the frontier", () => {
    const dt = region("dt", 430, 250, { type: "darkTower" });
    const cross = region("cross", 450, 335); // straddles the 0° axis → clipped by frontier-0
    const b = buildBoard({ towerRadius: 58, seeds: [], links: emptyLinks(), regions: [dt, cross] });
    expect(b.territories["dt"].neighbors).toContain("tower");
    expect(b.territories["cross"].neighbors).toContain("frontier-0");
    expect(b.territories["frontier-0"].neighbors).toContain("cross");
  });

  it("links territories that share a border line even without shared corners (T-junction)", () => {
    const x = region("x", 430, 200); // right edge x=480, y 200–250
    const tj: DrawnRegion = {
      id: "tj",
      kingdom: "arisilon",
      type: "plain",
      polygon: [
        [480, 210],
        [520, 210],
        [520, 240],
        [480, 240],
      ],
    };
    const b = buildBoard({ towerRadius: 58, seeds: [], links: emptyLinks(), regions: [x, tj] });
    expect(b.territories["x"].neighbors).toContain("tj");
    expect(b.territories["tj"].neighbors).toContain("x");
  });

  it("does not link a frontier from a single touching corner", () => {
    // A diamond whose bottom tip pokes ~2px past the frontier-0 boundary —
    // point contact, not a shared line.
    const poke: DrawnRegion = {
      id: "poke",
      kingdom: "arisilon",
      type: "plain",
      polygon: [
        [595, 309.13],
        [605, 319.13],
        [595, 329.13],
        [585, 319.13],
      ],
    };
    const b = buildBoard({ towerRadius: 58, seeds: [], links: emptyLinks(), regions: [poke] });
    expect(b.territories["poke"].neighbors).not.toContain("frontier-0");
  });

  it("never connects drawn regions of different kingdoms directly", () => {
    // Same shared edge, but tagged to different kingdoms — must not connect.
    const a = region("a", 430, 200);
    const b = region("b", 480, 200, { kingdom: "brynthia" });
    const board = buildBoard({ towerRadius: 58, seeds: [], links: emptyLinks(), regions: [a, b] });
    expect(board.territories["a"].neighbors).not.toContain("b");
    expect(board.territories["b"]?.neighbors ?? []).not.toContain("a");
  });

  it("guarantees each kingdom a citadel even when the authored map tags none", () => {
    // A hand-drawn map that never tagged a citadel — players must still start on one.
    const regions = [
      region("ar-in", 470, 260, { kingdom: "arisilon" }),
      region("ar-rim", 560, 150, { kingdom: "arisilon" }), // farther from centre → the citadel
      region("br", 470, 470, { kingdom: "brynthia" }),
      region("du", 220, 470, { kingdom: "durnin" }),
      region("ze", 220, 150, { kingdom: "zenon" }),
    ];
    const b = buildBoard({ towerRadius: 58, seeds: [], links: emptyLinks(), regions });
    for (const k of KINGDOM_ORDER) {
      const cits = b.order.filter(
        (id) => b.territories[id].kingdom === k && b.territories[id].building === "citadel"
      );
      expect(cits.length).toBe(1); // exactly one, promoted from the rim-most square
    }
    // The rim-most arisilon square is the one chosen.
    expect(b.territories["ar-rim"].building).toBe("citadel");
    expect(b.territories["ar-in"].building).toBeUndefined();
  });

  it("does not override a citadel the authored map already tagged", () => {
    const regions = [
      region("keep", 470, 260, { kingdom: "arisilon", type: "citadel" }),
      region("rim", 560, 150, { kingdom: "arisilon" }), // farther out, but must stay plain
    ];
    const b = buildBoard({ towerRadius: 58, seeds: [], links: emptyLinks(), regions });
    expect(b.territories["keep"].building).toBe("citadel");
    expect(b.territories["rim"].building).toBeUndefined();
  });
});
