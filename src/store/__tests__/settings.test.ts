import { afterEach, describe, expect, it } from "vitest";
import { useGame } from "../useGame";

describe("tower presentation setting", () => {
  afterEach(() => useGame.getState().setTowerPresentation("clean"));

  it("switches the complete presentation profile without touching game state", () => {
    const game = useGame.getState().game;

    useGame.getState().setTowerPresentation("original");
    expect(useGame.getState().settings.towerPresentation).toBe("original");
    expect(useGame.getState().game).toBe(game);

    useGame.getState().setTowerPresentation("clean");
    expect(useGame.getState().settings.towerPresentation).toBe("clean");
  });
});

