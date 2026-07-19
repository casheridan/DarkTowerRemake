import { describe, expect, it } from "vitest";
import type { EventResult } from "../../engine";
import { eventArtFrames, wareArtFrame } from "../towerArt";

describe("original tower artwork routing", () => {
  it("routes wilderness events to the physical carousel picture", () => {
    const event: EventResult = {
      kind: "move",
      drum: "cursed-lost-plague",
      moveEvent: "lost",
      messages: ["Lost"],
    };
    expect(eventArtFrames(event).map((frame) => frame.label)).toEqual(["Lost"]);
  });

  it("rotates through gold and a Pegasus for a multi-part treasure reward", () => {
    const event: EventResult = {
      kind: "combat",
      drum: "dragon-sword-pegasus",
      messages: ["Treasure"],
      deltas: { gold: 17 },
      itemsGained: ["pegasus"],
    };
    expect(eventArtFrames(event).map((frame) => frame.label)).toEqual(["Gold", "Pegasus"]);
  });

  it("uses Bazaar Closed and Key Missing instead of guessing from the drum", () => {
    const closed: EventResult = {
      kind: "bazaar",
      drum: "wizard-bazaarclosed-keymissing",
      messages: ["The merchant slams the gate shut."],
    };
    const blocked: EventResult = {
      kind: "frontier",
      drum: "wizard-bazaarclosed-keymissing",
      messages: ["KEY MISSING"],
    };
    expect(eventArtFrames(closed)[0].label).toBe("Bazaar Closed");
    expect(eventArtFrames(blocked)[0].label).toBe("Key Missing");
  });

  it("shows both sides of a Wizard curse", () => {
    const cursed: EventResult = {
      kind: "combat",
      drum: "wizard-bazaarclosed-keymissing",
      messages: ["The Wizard curses a rival."],
      deltas: { gold: 14 },
    };
    expect(eventArtFrames(cursed).map((frame) => frame.label)).toEqual([
      "Gold",
      "Wizard",
      "Cursed",
    ]);
  });

  it("leaves safe travel and empty tombs dark", () => {
    expect(
      eventArtFrames({ kind: "move", moveEvent: "safe", messages: ["Safe"] })
    ).toEqual([]);
    expect(
      eventArtFrames({
        kind: "tomb",
        drum: "warrior-food-beast",
        messages: ["Empty"],
      })
    ).toEqual([]);
  });

  it("shows the real offered ware in the Bazaar", () => {
    expect(wareArtFrame("healer").src).toBe("/assets/tower-display/healer.jpg");
  });

  it("shows a completed purchase instead of Bazaar Closed", () => {
    const frames = eventArtFrames({
      kind: "bazaar",
      messages: ["Bought a Scout."],
      purchase: { ware: "scout", quantity: 1, total: 17 },
      itemsGained: ["scout"],
    });
    expect(frames.map((frame) => frame.label)).toEqual(["Scout"]);
  });
});
