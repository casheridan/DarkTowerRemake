import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSfxCache, setMuted, setSfxPresentation, sfx } from "../sfx";

class FakeAudio {
  static created: FakeAudio[] = [];

  currentTime = 0;
  preload = "";
  volume = 1;
  readonly pause = vi.fn();
  readonly play = vi.fn(() => Promise.resolve());
  readonly addEventListener = vi.fn();
  readonly removeEventListener = vi.fn();

  constructor(readonly src: string) {
    FakeAudio.created.push(this);
  }
}

describe("original tower capture playback", () => {
  beforeEach(() => {
    setMuted(true);
    clearSfxCache();
    setSfxPresentation("original");
    setMuted(false);
    FakeAudio.created = [];
    vi.stubGlobal("Audio", FakeAudio);
  });

  afterEach(() => {
    setMuted(true);
    clearSfxCache();
    setSfxPresentation("clean");
    vi.unstubAllGlobals();
  });

  it("routes named cues to their local WAV captures", () => {
    sfx.bazaar();
    sfx.winRound();
    sfx.victory();

    expect(FakeAudio.created.map((audio) => audio.src)).toEqual([
      expect.stringMatching(/assets\/tower-audio\/bazaar\.wav$/),
      expect.stringMatching(/assets\/tower-audio\/enemy-hit\.wav$/),
      expect.stringMatching(/assets\/tower-audio\/intro\.wav$/),
    ]);
    expect(FakeAudio.created.every((audio) => audio.play.mock.calls.length === 1)).toBe(true);
  });

  it("stops active captures and suppresses new ones while muted", () => {
    sfx.dragon();
    const dragon = FakeAudio.created[0];

    setMuted(true);
    sfx.pegasus();

    expect(dragon.pause).toHaveBeenCalledOnce();
    expect(dragon.currentTime).toBe(0);
    expect(FakeAudio.created).toHaveLength(1);
  });

  it("backs Key Missing with the original sad player-hit tone", () => {
    sfx.keyMissing();
    expect(FakeAudio.created[0].src).toMatch(/assets\/tower-audio\/player-hit\.wav$/);
  });

  it("reuses a decoded capture instead of allocating it for every cue", () => {
    sfx.bazaar();
    sfx.bazaar();

    expect(FakeAudio.created).toHaveLength(1);
    expect(FakeAudio.created[0].play).toHaveBeenCalledTimes(2);
  });

  it("keeps clean mode entirely on the synthesized path", () => {
    setSfxPresentation("clean");
    sfx.bazaar();
    sfx.victory();
    expect(FakeAudio.created).toHaveLength(0);
  });

  it("falls back without throwing when HTML audio is unavailable", () => {
    vi.stubGlobal("Audio", undefined);
    expect(() => sfx.frontier()).not.toThrow();
  });
});
