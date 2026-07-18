import { describe, expect, it } from "vitest";
import { createGame } from "../setup";
import { reduce } from "../reducer";
import { createRng } from "../rng";
import { BOARD, buildingOf, citadelId, isLane, isTowerAdjacent, kingdomOf, neighborsOf } from "../board";
import type { GameState } from "../types";
import { scriptedRng } from "./helpers";

function twoPlayerGame() {
  return createGame(
    { players: [{ name: "Ann" }, { name: "Bo" }], difficulty: 1 },
    createRng(1)
  );
}

// A same-kingdom neighbour of Ann's starting citadel (a normal move, no crossing).
const START = citadelId("arisilon");
const STEP = neighborsOf(START).find(
  (n) => n !== "tower" && !isLane(n) && kingdomOf(n) === "arisilon"
)!;

/** A plain square that neighbours a building of the given type (same kingdom). */
function squareBeside(building: string): { building: string; from: string } {
  for (const id of BOARD.order) {
    if (BOARD.territories[id].building !== building) continue;
    const nb = neighborsOf(id).find(
      (n) =>
        n !== "tower" && !isLane(n) && kingdomOf(n) === kingdomOf(id) && !buildingOf(n)
    );
    if (nb) return { building: id, from: nb };
  }
  throw new Error(`no plain square beside a ${building}`);
}

/** Put the active player on a specific square (fresh clone of the game). */
function standOn(s: GameState, id: string): GameState {
  return {
    ...s,
    players: s.players.map((p, i) =>
      i === s.currentPlayerIndex ? { ...p, position: id, lastKingdom: kingdomOf(id) } : p
    ),
  };
}

/** A frontier lane touching both kingdoms, plus a plain cell on each side. */
function frontierBetween(
  k1: string,
  k2: string
): { lane: string; aCell: string; bCell: string } {
  for (const id of BOARD.order) {
    if (!BOARD.territories[id].lane) continue;
    const nb = BOARD.territories[id].neighbors;
    const c1 = nb.find((n) => !BOARD.territories[n]?.lane && kingdomOf(n) === k1);
    const c2 = nb.find((n) => !BOARD.territories[n]?.lane && kingdomOf(n) === k2);
    if (c1 && c2) return { lane: id, aCell: c1, bCell: c2 };
  }
  throw new Error(`no frontier between ${k1} and ${k2}`);
}

/** Overwrite the active player's fields for a test scenario. */
function withActive(s: GameState, patch: Partial<GameState["players"][number]>): GameState {
  return {
    ...s,
    players: s.players.map((p, i) => (i === s.currentPlayerIndex ? { ...p, ...patch } : p)),
  };
}

describe("level 4 (test mode) loadout", () => {
  it("starts every player maxed: 99/99/99, all gear, all three keys, and a fixed-16 Tower", () => {
    const s = createGame(
      { players: [{ name: "Ann" }, { name: "Bo" }], difficulty: 4 },
      createRng(1)
    );
    for (const p of s.players) {
      expect(p.warriors).toBe(99);
      expect(p.gold).toBe(99);
      expect(p.food).toBe(99);
      for (const item of ["sword", "scout", "healer", "beast", "brassKey", "silverKey", "goldKey"]) {
        expect(p.inventory.has(item as never)).toBe(true);
      }
    }
    expect(s.towerBrigands).toBe(16);
    // …and still starts on the home citadel, like every other level.
    for (const p of s.players) expect(p.position).toBe(citadelId(p.home));
  });

  it("leaves levels 1–3 on the normal starting loadout", () => {
    const s = createGame({ players: [{ name: "Ann" }], difficulty: 1 }, createRng(1));
    expect(s.players[0].warriors).toBe(10);
    expect(s.players[0].inventory.size).toBe(0);
  });
});

describe("item mechanics at end of turn", () => {
  it("Scout turns a Lost result into an extra turn for the same player", () => {
    let s = withActive(twoPlayerGame(), { inventory: new Set(["scout"]) });
    s = reduce(s, { type: "MOVE_TO", to: STEP }, scriptedRng([1])); // roll 1 = lost
    expect(s.players[0].flags.lostWithScout).toBe(true);
    s = reduce(s, { type: "ACK_EVENT" }, scriptedRng([0]));
    expect(s.currentPlayerIndex).toBe(0); // no advance — same player goes again
    expect(s.turn).toBe(1);
    expect(s.phase).toBe("playing");
  });

  it("trims gold beyond the warriors' carrying capacity at end of turn", () => {
    // 5 warriors carry 5×6 = 30 gold; starting with 90 → trimmed to 30.
    let s = withActive(twoPlayerGame(), { warriors: 5, gold: 90, food: 25 });
    s = reduce(s, { type: "MOVE_TO", to: STEP }, scriptedRng([12])); // safe travel
    s = reduce(s, { type: "ACK_EVENT" }, scriptedRng([0]));
    expect(s.players[0].gold).toBe(30);
  });
});

describe("reducer turn lifecycle", () => {
  it("MOVE_TO a safe space sets the encounter phase and surfaces lastEvent", () => {
    const s0 = twoPlayerGame();
    const s1 = reduce(s0, { type: "MOVE_TO", to: STEP }, scriptedRng([12]));
    expect(s1.phase).toBe("encounter");
    expect(s1.lastEvent?.moveEvent).toBe("safe");
    expect(s1.players[0].position).toBe(STEP);
    expect(s1.currentPlayerIndex).toBe(0); // turn not yet ended
  });

  it("ignores a move to a non-adjacent territory", () => {
    const s0 = twoPlayerGame();
    const s1 = reduce(s0, { type: "MOVE_TO", to: citadelId("durnin") }, scriptedRng([12]));
    expect(s1).toBe(s0);
  });

  it("ACK_EVENT ends the turn, consumes food, and advances to the next player", () => {
    const s0 = twoPlayerGame();
    const s1 = reduce(s0, { type: "MOVE_TO", to: STEP }, scriptedRng([12]));
    const s2 = reduce(s1, { type: "ACK_EVENT" }, scriptedRng([0]));
    expect(s2.phase).toBe("playing");
    expect(s2.currentPlayerIndex).toBe(1);
    expect(s2.players[0].food).toBe(24); // 10 warriors eat 1: 25 -> 24
  });

  it("wrapping back to the first player increments the turn counter", () => {
    let s = twoPlayerGame();
    s = reduce(s, { type: "MOVE_TO", to: STEP }, scriptedRng([12]));
    s = reduce(s, { type: "ACK_EVENT" }, scriptedRng([0]));
    expect(s.turn).toBe(1);
    const boStep = neighborsOf(s.players[1].position).find(
      (n) => n !== "tower" && !isLane(n) && kingdomOf(n) === "brynthia"
    )!;
    s = reduce(s, { type: "MOVE_TO", to: boStep }, scriptedRng([12]));
    s = reduce(s, { type: "ACK_EVENT" }, scriptedRng([0]));
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.turn).toBe(2);
  });

  it("MOVE_TO that rolls brigands routes to the combat phase", () => {
    const s0 = twoPlayerGame();
    const s1 = reduce(s0, { type: "MOVE_TO", to: STEP }, scriptedRng([9]));
    expect(s1.phase).toBe("combat");
    expect(s1.combat?.source).toBe("brigands");
  });

  it("entering a bazaar from an adjacent square travels there, then opens the shop", () => {
    const spot = squareBeside("bazaar");
    const s0 = standOn(twoPlayerGame(), spot.from);
    const s1 = reduce(s0, { type: "ENTER_BAZAAR", to: spot.building }, createRng(3));
    expect(s1.phase).toBe("bazaar");
    expect(s1.players[0].position).toBe(spot.building); // pawn moved onto the bazaar
    expect(s1.bazaar).toBeTruthy();
  });

  it("visiting a sanctuary from an adjacent square travels there, then resolves it", () => {
    const spot = squareBeside("sanctuary");
    const s0 = standOn(twoPlayerGame(), spot.from);
    const s1 = reduce(s0, { type: "VISIT_SANCTUARY", to: spot.building }, createRng(2));
    expect(s1.phase).toBe("encounter");
    expect(s1.players[0].position).toBe(spot.building);
  });

  it("in-place building actions still work with no target (standing on it)", () => {
    const s0 = standOn(twoPlayerGame(), squareBeside("bazaar").building);
    const s1 = reduce(s0, { type: "ENTER_BAZAAR" }, createRng(3));
    expect(s1.phase).toBe("bazaar");
  });

  it("opens the Dark Tower by stepping onto an adjacent tower square (all keys)", () => {
    let tower: string | undefined;
    let from: string | undefined;
    for (const id of BOARD.order) {
      if (!isTowerAdjacent(id) || isLane(id)) continue;
      const nb = neighborsOf(id).find(
        (n) => n !== "tower" && !isLane(n) && kingdomOf(n) === kingdomOf(id)
      );
      if (nb) {
        tower = id;
        from = nb;
        break;
      }
    }
    expect(tower && from).toBeTruthy();
    const s = withActive(twoPlayerGame(), {
      position: from!,
      inventory: new Set(["brassKey", "silverKey", "goldKey"]),
    });
    const r = reduce(s, { type: "OPEN_TOWER", to: tower! }, createRng(1));
    expect(r.phase).toBe("darkTower");
    expect(r.towerStage).toBe("riddle");
    expect(r.players[0].position).toBe(tower);
  });

  it("a move-and-enter to a non-adjacent building is ignored", () => {
    const s0 = twoPlayerGame();
    const far = BOARD.order.find(
      (id) =>
        BOARD.territories[id].building === "bazaar" &&
        !neighborsOf(s0.players[0].position).includes(id)
    )!;
    const s1 = reduce(s0, { type: "ENTER_BAZAAR", to: far }, createRng(1));
    expect(s1).toBe(s0);
  });

  const OPEN_FLAGS = {
    citadelVisited: false,
    cursed: false,
    lostWithScout: false,
    freshHaggle: true,
    regionKeyAvailable: false,
  };

  it("crosses a frontier forward into a new kingdom, but never back", () => {
    const { lane, aCell, bCell } = frontierBetween("arisilon", "brynthia");
    // On the A–B lane, arrived from arisilon (previous was zenon). Forward = brynthia.
    const s = withActive(twoPlayerGame(), {
      position: lane,
      lastKingdom: "arisilon",
      previousKingdom: "zenon",
      flags: { ...OPEN_FLAGS },
    });
    // Going back into arisilon (the kingdom you came from) is refused outright.
    expect(reduce(s, { type: "MOVE_TO", to: aCell }, createRng(1))).toBe(s);
    // Crossing forward into brynthia works and the new region then owes a key.
    const fwd = reduce(s, { type: "MOVE_TO", to: bCell }, createRng(1));
    expect(fwd.players[0].position).toBe(bCell);
    expect(fwd.players[0].lastKingdom).toBe("brynthia");
    expect(fwd.players[0].previousKingdom).toBe("arisilon");
    expect(fwd.players[0].flags.regionKeyAvailable).toBe(true);
    expect(fwd.lastEvent?.messages[0]).toMatch(/cross the frontier into Brynthia/i);
  });

  it("won't let you step onto a frontier until the region's key is found", () => {
    const { lane, aCell } = frontierBetween("brynthia", "durnin"); // aCell is a brynthia cell
    const s = withActive(twoPlayerGame(), {
      position: aCell,
      lastKingdom: "brynthia",
      previousKingdom: "arisilon",
      flags: { ...OPEN_FLAGS, regionKeyAvailable: true }, // brynthia still owes a key
    });
    const r = reduce(s, { type: "MOVE_TO", to: lane }, createRng(1));
    expect(r.players[0].position).toBe(aCell); // key missing — didn't step on
    expect(r.lastEvent?.messages[0]).toMatch(/KEY MISSING/i);
  });

  it("steps onto the frontier once the region's key is found", () => {
    const { lane, aCell } = frontierBetween("brynthia", "durnin");
    const s = withActive(twoPlayerGame(), {
      position: aCell,
      lastKingdom: "brynthia",
      previousKingdom: "arisilon",
      flags: { ...OPEN_FLAGS }, // key found
    });
    const r = reduce(s, { type: "MOVE_TO", to: lane }, createRng(1));
    expect(r.players[0].position).toBe(lane);
    expect(r.lastEvent?.messages[0]).toMatch(/travel the frontier/i);
  });

  it("a cursed player's turn is skipped and the curse lifts", () => {
    let s = twoPlayerGame();
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === 1 ? { ...p, flags: { ...p.flags, cursed: true } } : p
      ),
    };
    s = reduce(s, { type: "MOVE_TO", to: STEP }, scriptedRng([12]));
    s = reduce(s, { type: "ACK_EVENT" }, scriptedRng([0]));
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.players[1].flags.cursed).toBe(false);
  });
});
