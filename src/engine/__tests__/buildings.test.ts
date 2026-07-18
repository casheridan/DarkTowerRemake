import { describe, expect, it } from "vitest";
import { resolveSanctuary } from "../sanctuary";
import { resolveFrontier } from "../frontier";
import { resolveTomb } from "../tomb";
import {
  bazaarHaggle,
  bazaarNo,
  bazaarYes,
  createBazaar,
  currentWare,
} from "../bazaar";
import { citadelId, kingdomOf } from "../board";
import { makeTestPlayer, scriptedRng } from "./helpers";

describe("sanctuary / citadel (asm DOSANCT)", () => {
  it("gives 5–8 warriors when at or below 4", () => {
    const p = makeTestPlayer({ warriors: 3 });
    const rng = { ...scriptedRng([0]), range: () => 7 }; // bonus 7
    const { player } = resolveSanctuary(p, "sanctuary", rng);
    expect(player.warriors).toBe(10);
  });

  it("doubles 5–24 warriors at the player's own citadel (first visit only)", () => {
    const p = makeTestPlayer({
      warriors: 10,
      position: citadelId("arisilon"),
      home: "arisilon",
    });
    const { player } = resolveSanctuary(p, "citadel", scriptedRng([0]));
    expect(player.warriors).toBe(20);
    expect(player.flags.citadelVisited).toBe(true);
    // Second visit (flag set) — no doubling.
    const again = resolveSanctuary(player, "citadel", scriptedRng([0]));
    expect(again.player.warriors).toBe(20);
  });

  it("tops up gold when ≤7 and food when ≤5", () => {
    const p = makeTestPlayer({ warriors: 30, gold: 5, food: 3 });
    const rng = { ...scriptedRng([0]), range: () => 10 };
    const { player } = resolveSanctuary(p, "sanctuary", rng);
    expect(player.gold).toBe(15);
    expect(player.food).toBe(13);
  });
});

describe("bazaar (asm LA98) — sequential incremental shop", () => {
  const priced = (over: Partial<Record<string, number>> = {}) =>
    createBazaar(makeTestPlayer({ gold: 30 }), {
      ...scriptedRng([0]),
      range: (min: number) => (over.warrior && min === 5 ? over.warrior : min === 1 ? 5 : min),
    });

  it("rolls prices in the documented ranges and starts on the warrior", () => {
    const b = createBazaar(makeTestPlayer(), { ...scriptedRng([0]), range: (_min, max) => max });
    expect(b.prices.warrior).toBe(8);
    expect(b.prices.food).toBe(1);
    expect(b.prices.beast).toBe(26);
    expect(currentWare(b)).toBe("warrior");
  });

  it("skips gear the player already owns", () => {
    const b = createBazaar(makeTestPlayer({ inventory: new Set(["scout", "beast"]) }), {
      ...scriptedRng([0]),
      range: (min: number) => min,
    });
    expect(b.sequence).toEqual(["warrior", "food", "healer"]);
  });

  it("Yes increments quantity; No/End confirms the purchase and closes the bazaar", () => {
    // warriors at 5 gold, player has 30
    let b = priced();
    const p0 = makeTestPlayer({ gold: 30, warriors: 10 });
    let r = bazaarYes(b, p0); // qty 1 (5)
    r = bazaarYes(r.bazaar, r.player); // qty 2 (10)
    expect(r.bazaar.qty).toBe(2);
    r = bazaarNo(r.bazaar, r.player); // confirm 2 warriors → transaction done
    expect(r.player.gold).toBe(20);
    expect(r.player.warriors).toBe(12);
    expect(r.ended).toBeTruthy(); // one deal per visit — the bazaar closes
    expect(r.bazaar.closed).toBe(true);
  });

  it("closes instantly when a Yes pushes the running total past your gold", () => {
    const b = priced();
    const p0 = makeTestPlayer({ gold: 10, warriors: 10 }); // 5g warriors, only 10 gold
    let r = bazaarYes(b, p0); // qty 1 (5) ok
    r = bazaarYes(r.bazaar, r.player); // qty 2 (10) ok
    const closed = bazaarYes(r.bazaar, r.player); // qty 3 (15) > 10 → close
    expect(closed.ended).toBeTruthy();
    expect(closed.player.gold).toBe(10); // purchase voided, no gold spent
  });

  it("No/End with no pending purchase just advances; past the last item it closes", () => {
    let b = createBazaar(makeTestPlayer({ gold: 0 }), {
      ...scriptedRng([0]),
      range: (min: number) => min,
    });
    let ended: string | null = null;
    for (let i = 0; i < b.sequence.length; i++) {
      const r = bazaarNo(b, makeTestPlayer({ gold: 0 }));
      b = r.bazaar;
      ended = r.ended;
    }
    expect(ended).toBeTruthy(); // saying no to all closes the bazaar
  });

  it("haggle drops the current item by 1 (roll < 12 first time) or closes on failure", () => {
    const b = priced();
    const p = makeTestPlayer({ gold: 30 });
    const ok = bazaarHaggle(b, p, scriptedRng([11]));
    expect(ok.bazaar.prices.warrior).toBe(4);
    expect(ok.ended).toBeNull();
    const bad = bazaarHaggle(b, p, scriptedRng([12]));
    expect(bad.ended).toBeTruthy();
  });

  it("haggling a 1-gold item (food) insults the merchant and closes", () => {
    let b = priced();
    b = { ...b, index: 1 }; // move to food (price 1)
    const r = bazaarHaggle(b, makeTestPlayer({ gold: 30 }), scriptedRng([0]));
    expect(r.ended).toBeTruthy();
  });
});

describe("tomb / ruin (asm L8D9)", () => {
  it("is empty on a roll of 0–1", () => {
    const r = resolveTomb(makeTestPlayer(), scriptedRng([0]));
    expect(r.startCombat).toBe(false);
    expect(r.result.messages[0]).toMatch(/empty/i);
  });

  it("spawns brigands on a roll of 2–11", () => {
    const r = resolveTomb(makeTestPlayer(), scriptedRng([5]));
    expect(r.startCombat).toBe(true);
  });

  it("treasure (12–15) grants gold and the region's next key", () => {
    const p = makeTestPlayer({ gold: 0, flags: { regionKeyAvailable: true } });
    // r1=12 -> treasure; gold via range; r2=0 -> key
    const rng = { ...scriptedRng([12, 0]), range: () => 15 };
    const r = resolveTomb(p, rng);
    expect(r.player.gold).toBe(15);
    expect(r.player.inventory.has("brassKey")).toBe(true);
    expect(r.player.flags.regionKeyAvailable).toBe(false);
  });
});

describe("frontier crossing (asm S53D)", () => {
  const target = citadelId("brynthia"); // a territory in the neighbouring kingdom

  it("blocks crossing while the region still owes a key", () => {
    const p = makeTestPlayer({ flags: { regionKeyAvailable: true } });
    const r = resolveFrontier(p, target);
    expect(r.blocked).toBe(true);
  });

  it("crosses into the next kingdom once the key is found", () => {
    const p = makeTestPlayer({ flags: { regionKeyAvailable: false } });
    const r = resolveFrontier(p, target);
    expect(r.blocked).toBe(false);
    expect(r.player.position).toBe(target);
    expect(kingdomOf(r.player.position)).toBe("brynthia");
    expect(r.player.flags.regionKeyAvailable).toBe(true);
  });
});
