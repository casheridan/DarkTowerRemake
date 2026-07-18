import { describe, expect, it } from "vitest";
import { resolveMove } from "../encounters";
import { DRAGON_TREASURE } from "../constants";
import { makeTestPlayer, scriptedRng } from "./helpers";

const hoard = { warriors: 5, gold: 20 };
const ORIGIN = "arisilon-3-1"; // where the move started from

describe("resolveMove — DOMOVE outcomes", () => {
  it("safe travel (roll 11–15) changes nothing", () => {
    const res = resolveMove(makeTestPlayer(), { ...hoard }, scriptedRng([13]), ORIGIN);
    expect(res.event).toBe("safe");
    expect(res.player.warriors).toBe(10);
    expect(res.startCombat).toBe(false);
  });

  it("brigands (roll 8–10) flag combat without altering stats here", () => {
    const res = resolveMove(makeTestPlayer(), { ...hoard }, scriptedRng([9]), ORIGIN);
    expect(res.event).toBe("brigands");
    expect(res.startCombat).toBe(true);
  });

  describe("lost (roll 0–2)", () => {
    it("without a Scout: ends the turn and returns to the origin territory", () => {
      const p = makeTestPlayer({ position: "arisilon-2-0" }); // the destination
      const res = resolveMove(p, { ...hoard }, scriptedRng([1]), ORIGIN);
      expect(res.event).toBe("lost");
      expect(res.endTurn).toBe(true);
      expect(res.player.position).toBe(ORIGIN);
    });
    it("with a Scout: negated, the move stands", () => {
      const p = makeTestPlayer({ inventory: new Set(["scout"]), position: "arisilon-2-0" });
      const res = resolveMove(p, { ...hoard }, scriptedRng([1]), ORIGIN);
      expect(res.endTurn).toBe(false);
      expect(res.player.position).toBe("arisilon-2-0");
      expect(res.player.flags.lostWithScout).toBe(true);
    });
  });

  describe("plague (roll 5–7)", () => {
    it("without a Healer: loses 2 warriors", () => {
      const res = resolveMove(makeTestPlayer({ warriors: 10 }), { ...hoard }, scriptedRng([6]), ORIGIN);
      expect(res.player.warriors).toBe(8);
    });
    it("with a Healer: turns the plague into +2 warriors", () => {
      const res = resolveMove(
        makeTestPlayer({ warriors: 10, inventory: new Set(["healer"]) }),
        { ...hoard },
        scriptedRng([6]),
        ORIGIN
      );
      expect(res.player.warriors).toBe(12);
    });
  });

  describe("dragon (roll 3–4)", () => {
    it("with a Sword: claims the hoard, consumes the sword, resets the hoard", () => {
      const res = resolveMove(
        makeTestPlayer({ warriors: 10, gold: 30, inventory: new Set(["sword"]) }),
        { warriors: 5, gold: 20 },
        scriptedRng([3]),
        ORIGIN
      );
      expect(res.player.warriors).toBe(15);
      expect(res.player.gold).toBe(50);
      expect(res.player.inventory.has("sword")).toBe(false);
      expect(res.dragonHoard).toEqual(DRAGON_TREASURE);
    });

    it("without a Sword: loses ¼ of gold and warriors to the dragon's hoard", () => {
      const res = resolveMove(
        makeTestPlayer({ warriors: 12, gold: 40 }),
        { warriors: 2, gold: 6 },
        scriptedRng([4]),
        ORIGIN
      );
      expect(res.player.warriors).toBe(9);
      expect(res.player.gold).toBe(30);
      expect(res.dragonHoard).toEqual({ warriors: 5, gold: 16 });
    });
  });
});
