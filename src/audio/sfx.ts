/**
 * Web Audio sound effects — synthesized in the spirit of the 1981 unit's
 * iconic beeps, the victory bugle "charge", and the death march. No assets;
 * everything is generated with oscillators so it ships tiny.
 *
 * The AudioContext is created lazily on first use (after a user gesture, which
 * the "Begin the Quest" click satisfies).
 */

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean) {
  muted = value;
}

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
}

/** Play a single tone at `freq` Hz starting at `at` seconds from now. */
function tone(freq: number, at: number, dur: number, opts: ToneOpts = {}) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? "square";
  osc.frequency.setValueAtTime(freq, t0);
  const peak = opts.gain ?? 0.18;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Play a melody of [freq, durationSeconds] steps back to back. */
function melody(steps: [number, number][], opts: ToneOpts = {}) {
  let at = 0;
  for (const [freq, dur] of steps) {
    if (freq > 0) tone(freq, at, dur * 0.95, opts);
    at += dur;
  }
}

// Note frequencies (equal temperament).
const N = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, C6: 1046.5,
  G3: 196.0, E3: 164.81, A3: 220.0, Eb4: 311.13, Ab3: 207.65,
};

export const sfx = {
  click: () => tone(660, 0, 0.05, { type: "square", gain: 0.08 }),
  move: () => tone(520, 0, 0.07, { type: "triangle", gain: 0.1 }),

  safe: () => melody([[N.E5, 0.09], [N.G5, 0.11]], { type: "triangle", gain: 0.12 }),

  gold: () =>
    melody([[N.C5, 0.06], [N.E5, 0.06], [N.G5, 0.08]], { type: "triangle", gain: 0.12 }),

  key: () =>
    melody([[N.C5, 0.1], [N.E5, 0.1], [N.G5, 0.1], [N.C6, 0.22]], {
      type: "triangle",
      gain: 0.16,
    }),

  // Ominous low warbles.
  plague: () => melody([[N.A3, 0.16], [N.Ab3, 0.26]], { type: "sawtooth", gain: 0.14 }),
  lost: () => melody([[N.G4, 0.12], [N.E4, 0.12], [N.C4, 0.2]], { type: "sine", gain: 0.14 }),
  dragon: () => melody([[N.E3, 0.18], [N.G3, 0.1], [N.E3, 0.28]], { type: "sawtooth", gain: 0.18 }),

  // Combat.
  brigands: () =>
    melody([[N.A4, 0.1], [N.A4, 0.1], [N.A4, 0.16]], { type: "square", gain: 0.15 }),
  winRound: () => melody([[N.G4, 0.07], [N.C5, 0.1]], { type: "square", gain: 0.12 }),
  loseRound: () => melody([[N.E4, 0.08], [N.C4, 0.14]], { type: "sawtooth", gain: 0.12 }),

  bazaar: () =>
    melody([[N.D5, 0.09], [N.F5, 0.09], [N.A5, 0.09], [N.F5, 0.14]], {
      type: "triangle",
      gain: 0.12,
    }),

  // The iconic bugle "charge!" fanfare.
  victory: () =>
    melody(
      [
        [N.G4, 0.14], [N.C5, 0.14], [N.E5, 0.14], [N.G5, 0.18],
        [0, 0.05], [N.E5, 0.12], [N.G5, 0.34],
      ],
      { type: "square", gain: 0.2 }
    ),

  // Funeral / death march motif.
  defeat: () =>
    melody(
      [[N.G4, 0.26], [N.G4, 0.26], [N.G4, 0.26], [N.Eb4, 0.2], [N.F4, 0.12], [N.Eb4, 0.2], [N.C4, 0.5]],
      { type: "sine", gain: 0.16 }
    ),
};

export type SfxName = keyof typeof sfx;
