import { describe, expect, it } from "vitest";
import {
  TOWER_SHORTCUT_LABELS,
  TOWER_SHORTCUTS,
  towerShortcutIndex,
} from "../towerShortcuts";

describe("Tower keyboard layout", () => {
  it("matches the physical 3×4 button grid", () => {
    expect(TOWER_SHORTCUTS).toEqual([
      "1", "2", "3",
      "q", "w", "e",
      "a", "s", "d",
      "z", "x", "c",
    ]);
    expect(towerShortcutIndex("Q")).toBe(3);
    expect(towerShortcutIndex("v")).toBe(-1);
    expect(TOWER_SHORTCUT_LABELS[8]).toBe("Citadel / Sanctuary");
  });
});
