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
      for (const item of ["sword", "scout", "healer", "beast", "pegasus", "brassKey", "silverKey", "goldKey"]) {
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

  it("lands immediately and ends the turn without a travel encounter", () => {
    const target = BOARD.order.find(
      (id) =>
        !isLane(id) &&
        kingdomOf(id) === "arisilon" &&
        id !== START &&
        !neighborsOf(START).includes(id)
    )!;
    const s = withActive(twoPlayerGame(), { inventory: new Set(["pegasus"]) });
    const r = reduce(
      s,
      { type: "PEGASUS_FLY", to: target },
      scriptedRng([1]) // would be Lost if a normal move encounter were rolled
    );

    expect(r.players[0].position).toBe(target);
    expect(r.players[0].inventory.has("pegasus")).toBe(false);
    expect(r.currentPlayerIndex).toBe(1);
    expect(r.phase).toBe("playing");
    expect(r.lastEvent).toBeNull();
  });

  it("lands on a next-kingdom building but waits until the next turn to use it", () => {
    const target = BOARD.order.find(
      (id) => BOARD.territories[id].kingdom === "brynthia" && buildingOf(id) === "bazaar"
    )!;
    let s = twoPlayerGame();
    s = withActive(s, { inventory: new Set(["pegasus"]) });

    // The destination click lands and hands play to the next player. It does
    // not enter the bazaar as part of the flight.
    s = reduce(s, { type: "PEGASUS_FLY", to: target }, createRng(1));
    expect(s.phase).toBe("playing");
    expect(s.currentPlayerIndex).toBe(1);
    expect(s.players[0].position).toBe(target);
    expect(s.players[0].lastKingdom).toBe("brynthia");
    expect(s.players[0].previousKingdom).toBe("arisilon");
    expect(s.players[0].flags.regionKeyAvailable).toBe(true);
    expect(s.players[0].inventory.has("pegasus")).toBe(false);

    // Once the other player finishes, the landed player may use the building.
    s = reduce(s, { type: "SKIP_TURN" }, createRng(1));
    expect(s.currentPlayerIndex).toBe(0);
    s = reduce(s, { type: "ENTER_BAZAAR" }, createRng(1));
    expect(s.phase).toBe("bazaar");
  });

  it("cannot fly into the next kingdom until its current key is found", () => {
    const current = BOARD.order.find(
      (id) => !isLane(id) && kingdomOf(id) === "brynthia" && buildingOf(id) !== "citadel"
    )!;
    const target = BOARD.order.find(
      (id) => !isLane(id) && kingdomOf(id) === "durnin" && buildingOf(id) !== "citadel"
    )!;
    const s = withActive(twoPlayerGame(), {
      position: current,
      lastKingdom: "brynthia",
      previousKingdom: "arisilon",
      inventory: new Set(["pegasus"]),
      flags: {
        citadelVisited: false,
        cursed: false,
        lostWithScout: false,
        freshHaggle: true,
        regionKeyAvailable: true,
      },
    });

    expect(reduce(s, { type: "PEGASUS_FLY", to: target }, createRng(1))).toBe(s);
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

  it("preserves one warrior when a multiplayer encounter would reduce the army to zero", () => {
    const s0 = withActive(twoPlayerGame(), { warriors: 1 });
    const s1 = reduce(s0, { type: "MOVE_TO", to: STEP }, scriptedRng([6])); // plague: -2
    expect(s1.phase).toBe("encounter");
    expect(s1.players[0].warriors).toBe(1);
    expect(s1.players[0].alive).toBe(true);
  });

  it("ends a single-player game at score 00 when the last warrior falls", () => {
    let s = createGame({ players: [{ name: "Ann" }], difficulty: 1 }, createRng(1));
    s = withActive(s, { warriors: 1 });
    s = reduce(s, { type: "MOVE_TO", to: STEP }, scriptedRng([6])); // plague: -2
    expect(s.phase).toBe("gameOver");
    expect(s.winnerId).toBeNull();
    expect(s.players[0].warriors).toBe(0);
    expect(s.players[0].alive).toBe(false);
    expect(s.lastEvent?.playerDied).toBe(true);
  });

  it("ends a single-player game when combat reduces the army to zero", () => {
    let s = createGame({ players: [{ name: "Ann" }], difficulty: 1 }, createRng(1));
    s = reduce(s, { type: "MOVE_TO", to: STEP }, scriptedRng([9]));
    s = {
      ...s,
      combat: {
        ...s.combat!,
        warriorsRemaining: 0,
        over: true,
        playerWon: false,
      },
    };
    s = reduce(s, { type: "COMBAT_END" }, createRng(1));
    expect(s.phase).toBe("gameOver");
    expect(s.players[0].alive).toBe(false);
    expect(s.players[0].warriors).toBe(0);
  });

  it("ends a single-player game when starvation takes the last warrior", () => {
    let s = createGame({ players: [{ name: "Ann" }], difficulty: 1 }, createRng(1));
    s = withActive(s, { warriors: 1, food: 0, gold: 0 });
    s = reduce(s, { type: "SKIP_TURN" }, createRng(1));
    expect(s.phase).toBe("gameOver");
    expect(s.players[0].alive).toBe(false);
    expect(s.lastEvent?.kind).toBe("starvation");
  });

  it("shows the shared treasure screen after a Brigand victory before ending the turn", () => {
    let s = reduce(twoPlayerGame(), { type: "MOVE_TO", to: STEP }, scriptedRng([9]));
    s = {
      ...s,
      combat: { ...s.combat!, brigandsRemaining: 0, over: true, playerWon: true },
    };

    // Gold range uses its minimum (13); secondary roll 10 awards Pegasus.
    s = reduce(s, { type: "COMBAT_END" }, scriptedRng([10]));
    expect(s.phase).toBe("encounter");
    expect(s.combat).toBeNull();
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.players[0].gold).toBe(43);
    expect(s.players[0].inventory.has("pegasus")).toBe(true);
    expect(s.lastEvent?.kind).toBe("combat");
    expect(s.lastEvent?.messages.join(" ")).toMatch(/treasure/i);

    s = reduce(s, { type: "ACK_EVENT" }, createRng(1));
    expect(s.currentPlayerIndex).toBe(1);
  });

  it("shows direct Tomb/Ruin treasure immediately without entering combat", () => {
    const spot = squareBeside("tomb");
    let s = standOn(twoPlayerGame(), spot.from);
    s = reduce(
      s,
      { type: "VISIT_TOMB", to: spot.building },
      scriptedRng([12, 10])
    );

    expect(s.phase).toBe("encounter");
    expect(s.players[0].position).toBe(spot.building);
    expect(s.players[0].inventory.has("pegasus")).toBe(true);
    expect(s.lastEvent?.kind).toBe("tomb");
    expect(s.lastEvent?.messages.join(" ")).toMatch(/treasure/i);
  });

  it("applies the Wizard's stolen resources and lost-turn curse", () => {
    const spot = squareBeside("ruin");
    let s = standOn(twoPlayerGame(), spot.from);
    s = reduce(
      s,
      { type: "VISIT_TOMB", to: spot.building },
      scriptedRng([12, 14])
    );

    expect(s.players[0].warriors).toBe(12);
    expect(s.players[0].gold).toBe(50); // +13 treasure, then +7 stolen
    expect(s.players[1].warriors).toBe(8);
    expect(s.players[1].gold).toBe(23);
    expect(s.players[1].flags.cursed).toBe(true);
    expect(s.lastEvent?.messages.join(" ")).toMatch(/steal 2 warriors and 7 gold/i);
  });

  it("entering a bazaar from an adjacent square travels there, then opens the shop", () => {
    const spot = squareBeside("bazaar");
    const s0 = standOn(twoPlayerGame(), spot.from);
    const s1 = reduce(s0, { type: "ENTER_BAZAAR", to: spot.building }, createRng(3));
    expect(s1.phase).toBe("bazaar");
    expect(s1.players[0].position).toBe(spot.building); // pawn moved onto the bazaar
    expect(s1.bazaar).toBeTruthy();
  });

  it("ends a Bazaar visit after one completed Scout purchase", () => {
    const spot = squareBeside("bazaar");
    let s = withActive(standOn(twoPlayerGame(), spot.from), { gold: 99 });
    s = reduce(s, { type: "ENTER_BAZAAR", to: spot.building }, createRng(3));
    const scoutIndex = s.bazaar!.sequence.indexOf("scout");
    expect(scoutIndex).toBeGreaterThanOrEqual(0);
    s = { ...s, bazaar: { ...s.bazaar!, index: scoutIndex } };

    s = reduce(s, { type: "BAZAAR_YES" }, createRng(3));
    s = reduce(s, { type: "BAZAAR_NO" }, createRng(3));

    expect(s.players[0].inventory.has("scout")).toBe(true);
    expect(s.players[0].inventory.has("healer")).toBe(false);
    expect(s.phase).toBe("encounter");
    expect(s.bazaar).toBeNull();
    expect(s.lastEvent?.purchase?.ware).toBe("scout");
    expect(s.lastEvent?.itemsGained).toEqual(["scout"]);
    expect(s.lastEvent?.drum).not.toBe("wizard-bazaarclosed-keymissing");
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

  it("crosses a frontier forward with a normal move encounter, but never back", () => {
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
    const fwd = reduce(s, { type: "MOVE_TO", to: bCell }, scriptedRng([12]));
    expect(fwd.players[0].position).toBe(bCell);
    expect(fwd.players[0].lastKingdom).toBe("brynthia");
    expect(fwd.players[0].previousKingdom).toBe("arisilon");
    expect(fwd.players[0].flags.regionKeyAvailable).toBe(true);
    expect(fwd.lastEvent?.kind).toBe("move");
    expect(fwd.lastEvent?.moveEvent).toBe("safe");
    expect(fwd.lastEvent?.messages[0]).toMatch(/road is quiet/i);
  });

  it("can encounter Brigands on the territory immediately after a frontier", () => {
    const { lane, bCell } = frontierBetween("arisilon", "brynthia");
    const s = withActive(twoPlayerGame(), {
      position: lane,
      lastKingdom: "arisilon",
      previousKingdom: "zenon",
      flags: { ...OPEN_FLAGS },
    });

    const fwd = reduce(s, { type: "MOVE_TO", to: bCell }, scriptedRng([8]));
    expect(fwd.players[0].position).toBe(bCell);
    expect(fwd.lastEvent?.moveEvent).toBe("brigands");
    expect(fwd.phase).toBe("combat");
    expect(fwd.combat).not.toBeNull();
  });

  it("a Lost result while leaving a frontier cancels the crossing completely", () => {
    const { lane, bCell } = frontierBetween("arisilon", "brynthia");
    const s = withActive(twoPlayerGame(), {
      position: lane,
      lastKingdom: "arisilon",
      previousKingdom: "zenon",
      flags: { ...OPEN_FLAGS },
    });

    const lost = reduce(s, { type: "MOVE_TO", to: bCell }, scriptedRng([0]));
    expect(lost.players[0].position).toBe(lane);
    expect(lost.players[0].lastKingdom).toBe("arisilon");
    expect(lost.players[0].previousKingdom).toBe("zenon");
    expect(lost.players[0].flags.regionKeyAvailable).toBe(false);
    expect(lost.lastEvent?.moveEvent).toBe("lost");
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
