import { describe, expect, it } from "vitest";
import type { EventResult } from "../../engine";
import { eventSfxName } from "../useSfx";

function event(overrides: Partial<EventResult>): EventResult {
  return { kind: "move", messages: ["test event"], ...overrides };
}

describe("event sound routing", () => {
  it("distinguishes a dragon kill from a dragon loss", () => {
    expect(eventSfxName(event({ moveEvent: "dragon", deltas: { gold: -5 } }))).toBe("dragon");
    expect(eventSfxName(event({ moveEvent: "dragon", deltas: { gold: 6 } }))).toBe("dragonKill");
  });

  it("keeps the Plague cue when a Healer turns the loss into a gain", () => {
    expect(eventSfxName(event({ moveEvent: "plague", deltas: { warriors: 2 } }))).toBe(
      "plague"
    );
  });

  it("uses the dedicated tomb battle and empty-tomb recordings", () => {
    expect(eventSfxName(event({ kind: "tomb", moveEvent: "brigands" }))).toBe("tombBattle");
    expect(eventSfxName(event({ kind: "tomb", messages: ["The tomb lies empty."] }))).toBe(
      "tombNothing"
    );
  });

  it("prioritizes unique treasure cues", () => {
    expect(eventSfxName(event({ kind: "combat", itemsGained: ["pegasus"] }))).toBe("pegasus");
    expect(eventSfxName(event({ kind: "tomb", itemsGained: ["silverKey"] }))).toBe("key");
  });

  it("keeps Bazaar Closed distinct from the sad Key Missing cue", () => {
    expect(eventSfxName(event({ kind: "bazaar" }))).toBe("bazaarClosed");
    expect(
      eventSfxName(
        event({ kind: "frontier", drum: "wizard-bazaarclosed-keymissing" })
      )
    ).toBe("keyMissing");
    expect(
      eventSfxName(event({ kind: "darkTower", messages: ["Wrong key — the Tower rejects you."] }))
    ).toBe("keyMissing");
  });

  it("does not play Bazaar Closed after a successful purchase", () => {
    expect(
      eventSfxName(
        event({
          kind: "bazaar",
          purchase: { ware: "scout", quantity: 1, total: 17 },
          itemsGained: ["scout"],
        })
      )
    ).toBeNull();
  });

  it("leaves the solved-riddle battle cue to the combat phase", () => {
    expect(
      eventSfxName(event({ kind: "darkTower", messages: ["The Dark Tower opens — to battle!"] }))
    ).toBeNull();
  });
});
