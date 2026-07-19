/**
 * Sound playback for the virtual tower.
 *
 * The preferred cues are captures of an original Dark Tower unit. Each cue
 * retains a small Web Audio transcription as a fallback for browsers that
 * cannot decode or load the WAV file. The synthesized fallback deliberately
 * uses short, monophonic square waves to preserve the appliance-like sound.
 */
import type { TowerPresentation } from "../ui/presentation";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let presentation: TowerPresentation = "clean";

let activeMedia: HTMLAudioElement | null = null;
let activeMediaCleanup: (() => void) | null = null;
let activeBufferSource: AudioBufferSourceNode | null = null;
let playbackGeneration = 0;
const mediaCache = new Map<string, HTMLAudioElement>();
const decodedCaptures = new Map<string, AudioBuffer>();
const decodeJobs = new Map<string, Promise<AudioBuffer | null>>();
const failedCaptures = new Set<string>();
const activeOscillators = new Set<OscillatorNode>();

const AUDIO_ROOT = `${import.meta.env.BASE_URL}assets/tower-audio`;

export const TOWER_AUDIO = {
  endTurn: "end-turn.wav",
  clear: "clear.wav",
  pegasus: "pegasus.wav",
  battle: "battle.wav",
  playerHit: "player-hit.wav",
  enemyHit: "enemy-hit.wav",
  dragon: "dragon.wav",
  dragonKill: "dragon-kill.wav",
  lost: "lost.wav",
  plague: "plague.wav",
  starving: "starving.wav",
  tombBattle: "tomb-battle.wav",
  tombDoor: "tomb-battle.wav",
  tombNothing: "tomb-nothing.wav",
  sanctuary: "sanctuary.wav",
  bazaar: "bazaar.wav",
  bazaarClosed: "bazaar-closed.wav",
  frontier: "frontier.wav",
  darkTower: "darktower.wav",
  intro: "intro.wav",
} as const;

function stopAll() {
  playbackGeneration += 1;
  const bufferSource = activeBufferSource;
  activeBufferSource = null;
  if (bufferSource) {
    try {
      bufferSource.stop();
    } catch {
      // The buffer may already have ended.
    }
  }
  const media = activeMedia;
  const cleanup = activeMediaCleanup;
  activeMedia = null;
  activeMediaCleanup = null;
  cleanup?.();
  if (media) {
    media.pause();
    media.currentTime = 0;
  }

  for (const oscillator of activeOscillators) {
    try {
      oscillator.stop();
    } catch {
      // The node may already have reached its scheduled stop time.
    }
  }
  activeOscillators.clear();
}

export function setMuted(value: boolean) {
  muted = value;
  if (master && ctx) master.gain.setValueAtTime(value ? 0 : 0.72, ctx.currentTime);
  if (value) stopAll();
}

export function setSfxPresentation(value: TowerPresentation) {
  if (presentation === value) return;
  presentation = value;
  stopAll();
  if (value === "original") void preloadOriginalAudio();
}

/** Release cached captures; mainly useful for tests or memory-constrained hosts. */
export function clearSfxCache() {
  stopAll();
  mediaCache.clear();
  decodedCaptures.clear();
  decodeJobs.clear();
  failedCaptures.clear();
}

function ensureAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = 0.72;
    master.connect(ctx.destination);
  }
  return ctx;
}

function audio(): AudioContext | null {
  if (muted) return null;
  const ac = ensureAudioContext();
  if (!ac) return null;
  if (ac.state === "suspended") void ac.resume();
  return ac;
}

function decodeCapture(filename: string): Promise<AudioBuffer | null> {
  const cached = decodedCaptures.get(filename);
  if (cached) return Promise.resolve(cached);
  const pending = decodeJobs.get(filename);
  if (pending) return pending;

  const ac = ensureAudioContext();
  if (!ac || typeof fetch === "undefined") return Promise.resolve(null);

  const job = fetch(`${AUDIO_ROOT}/${filename}`)
    .then((response) => {
      if (!response.ok) throw new Error(`Tower audio returned ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => ac.decodeAudioData(bytes))
    .then((buffer) => {
      decodedCaptures.set(filename, buffer);
      return buffer;
    })
    .catch(() => null)
    .finally(() => decodeJobs.delete(filename));
  decodeJobs.set(filename, job);
  return job;
}

/** Fetch and decode every archival cue once so event playback has no first-use stall. */
export async function preloadOriginalAudio(): Promise<void> {
  await Promise.all([...new Set(Object.values(TOWER_AUDIO))].map(decodeCapture));
}

function playDecodedCapture(
  buffer: AudioBuffer,
  volume: number,
  durationSeconds?: number
): boolean {
  const ac = audio();
  if (!ac || !master) return false;
  const source = ac.createBufferSource();
  const cueGain = ac.createGain();
  source.buffer = buffer;
  cueGain.gain.value = volume;
  source.connect(cueGain).connect(master);
  activeBufferSource = source;
  source.addEventListener("ended", () => {
    if (activeBufferSource === source) activeBufferSource = null;
  }, { once: true });
  if (durationSeconds === undefined) source.start();
  else source.start(0, 0, durationSeconds);
  return true;
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
}

/** Play one sharply-gated piezo-like tone, starting `at` seconds from now. */
function tone(freq: number, at: number, dur: number, opts: ToneOpts = {}) {
  const ac = audio();
  if (!ac || !master) return;
  const t0 = ac.currentTime + at;
  const oscillator = ac.createOscillator();
  const envelope = ac.createGain();
  oscillator.type = opts.type ?? "square";
  oscillator.frequency.setValueAtTime(freq, t0);

  const peak = opts.gain ?? 0.2;
  envelope.gain.setValueAtTime(0.0001, t0);
  envelope.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
  envelope.gain.setValueAtTime(peak, Math.max(t0 + 0.005, t0 + dur - 0.014));
  envelope.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  oscillator.connect(envelope).connect(master);
  activeOscillators.add(oscillator);
  oscillator.addEventListener("ended", () => activeOscillators.delete(oscillator), { once: true });
  oscillator.start(t0);
  oscillator.stop(t0 + dur + 0.01);
}

type Step = readonly [frequency: number, durationSeconds: number];

/** Play a monophonic score; a frequency of zero is a rest. */
function melody(steps: readonly Step[], opts: ToneOpts = {}, startAt = 0) {
  let at = startAt;
  for (const [freq, duration] of steps) {
    if (freq > 0) tone(freq, at, Math.max(0.025, duration * 0.92), opts);
    at += duration;
  }
}

function timedMelody(
  steps: readonly Step[],
  seconds: number,
  opts: ToneOpts = {},
  startAt = 0
) {
  const writtenLength = steps.reduce((sum, [, duration]) => sum + duration, 0);
  const scale = writtenLength > 0 ? seconds / writtenLength : 1;
  melody(
    steps.map(([frequency, duration]) => [frequency, duration * scale] as const),
    opts,
    startAt
  );
}

/** One oscillator with rapid pitch changes, used for the Tower's long trills/door warble. */
function patternedTone(
  frequencies: readonly number[],
  seconds: number,
  stepSeconds: number,
  opts: ToneOpts = {},
  startAt = 0
) {
  const ac = audio();
  if (!ac || !master || frequencies.length === 0) return;
  const t0 = ac.currentTime + startAt;
  const oscillator = ac.createOscillator();
  const envelope = ac.createGain();
  oscillator.type = opts.type ?? "square";
  for (let at = 0, index = 0; at < seconds; at += stepSeconds, index += 1) {
    oscillator.frequency.setValueAtTime(frequencies[index % frequencies.length], t0 + at);
  }
  const peak = opts.gain ?? 0.16;
  envelope.gain.setValueAtTime(0.0001, t0);
  envelope.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  envelope.gain.setValueAtTime(peak, t0 + Math.max(0.01, seconds - 0.02));
  envelope.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  oscillator.connect(envelope).connect(master);
  activeOscillators.add(oscillator);
  oscillator.addEventListener("ended", () => activeOscillators.delete(oscillator), { once: true });
  oscillator.start(t0);
  oscillator.stop(t0 + seconds + 0.01);
}

const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** Durations measured from the original 22,050 Hz tower captures. */
export const CLEAN_CUE_SECONDS = {
  battle: 1.049,
  bazaar: 2.992,
  bazaarClosed: 1.948,
  clear: 1.518,
  darkTower: 2.776,
  dragon: 1.111,
  dragonKill: 3.834,
  endTurn: 0.368,
  loseRound: 1.233,
  winRound: 0.739,
  frontier: 0.988,
  victory: 4.811,
  lost: 1.927,
  pegasus: 0.752,
  plague: 2.802,
  sanctuary: 2.019,
  starving: 1.281,
  tombBattle: 5.086,
  /** Door/hinge portion of tomb-battle.wav, before its battle fanfare. */
  tombDoor: 3.95,
  tombNothing: 8.024,
} as const;

/**
 * Prefer an original-unit capture. A rejected `play()` or media error invokes
 * the synthesized score, so a missing asset never makes the game silent.
 */
function captured(
  filename: string,
  fallback: () => void,
  volume = 0.82,
  durationSeconds?: number
) {
  if (muted) return;
  // A real tower has one speaker: a new cue replaces the one before it. Clean
  // mode never constructs or decodes the archival media elements.
  stopAll();
  if (presentation === "clean") {
    fallback();
    return;
  }
  if (failedCaptures.has(filename)) {
    fallback();
    return;
  }
  const buffer = decodedCaptures.get(filename);
  if (buffer && playDecodedCapture(buffer, volume, durationSeconds)) return;

  // Keep decoding in the background. The HTMLAudio path below is retained as
  // an immediate compatibility fallback for browsers without Web Audio decode.
  void decodeCapture(filename);
  if (typeof Audio === "undefined") {
    fallback();
    return;
  }

  let media = mediaCache.get(filename);
  if (!media) {
    media = new Audio(`${AUDIO_ROOT}/${filename}`);
    media.preload = "auto";
    mediaCache.set(filename, media);
  }
  const generation = playbackGeneration;
  let finished = false;
  let sliceTimer: ReturnType<typeof setTimeout> | null = null;
  media.currentTime = 0;
  media.volume = volume;

  const cleanup = () => {
    if (sliceTimer !== null) {
      clearTimeout(sliceTimer);
      sliceTimer = null;
    }
    media.removeEventListener("ended", ended);
    media.removeEventListener("error", failed);
    if (activeMedia === media) {
      activeMedia = null;
      activeMediaCleanup = null;
    }
  };
  const ended = () => {
    if (finished) return;
    finished = true;
    cleanup();
  };
  const failed = () => {
    if (finished) return;
    finished = true;
    cleanup();
    if (!muted && generation === playbackGeneration) {
      failedCaptures.add(filename);
      mediaCache.delete(filename);
      fallback();
    }
  };

  activeMedia = media;
  activeMediaCleanup = cleanup;
  media.addEventListener("ended", ended, { once: true });
  media.addEventListener("error", failed, { once: true });
  const attempt = media.play();
  if (attempt) void attempt.catch(failed);
  if (durationSeconds !== undefined) {
    sliceTimer = setTimeout(() => {
      if (finished) return;
      media.pause();
      media.currentTime = 0;
      ended();
    }, durationSeconds * 1000);
  }
}

// Equal-temperament pitches used only when a capture cannot play.
const N = {
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  G3: 196,
  A3: 220,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  Eb4: 311.13,
  E4: 329.63,
  F4: 349.23,
  G4: 392,
  A4: 440,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  Eb5: 622.25,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880,
  B5: 987.77,
  C6: 1046.5,
} as const;

const synth = {
  click: () => tone(720, 0, 0.035, { gain: 0.1 }),
  move: () => melody([[N.C5, 0.055], [N.G5, 0.075]], { gain: 0.11 }),
  safe: () => melody([[N.E5, 0.075], [N.G5, 0.12]], { gain: 0.12 }),
  gold: () => melody([[N.C5, 0.06], [N.E5, 0.06], [N.G5, 0.09]], { gain: 0.13 }),
  key: () => melody([[N.C5, 0.09], [N.E5, 0.09], [N.G5, 0.09], [N.C6, 0.2]], { gain: 0.16 }),
  pegasus: () => timedMelody(
    [[0, 0.03], [midi(63), 0.06], [midi(65), 0.07], [midi(66), 0.07], [0, 0.03],
      [midi(58), 0.04], [midi(71), 0.09], [midi(75), 0.05], [midi(66), 0.09],
      [0, 0.17], [midi(73), 0.052]],
    CLEAN_CUE_SECONDS.pegasus,
    { gain: 0.14 }
  ),
  battle: () => timedMelody(
    [[midi(72), 0.16], [midi(79), 0.35], [midi(72), 0.19], [midi(79), 0.35]],
    CLEAN_CUE_SECONDS.battle,
    { gain: 0.18 }
  ),
  tombBattle: () => {
    patternedTone([midi(70), midi(71)], 3.95, 0.045, { type: "sawtooth", gain: 0.1 });
    timedMelody(
      [[midi(72), 0.16], [midi(79), 0.35], [midi(72), 0.19], [midi(79), 0.35]],
      CLEAN_CUE_SECONDS.tombBattle - 3.95,
      { gain: 0.18 },
      3.95
    );
  },
  tombDoor: () => patternedTone(
    [midi(70), midi(71)],
    CLEAN_CUE_SECONDS.tombDoor,
    0.045,
    { type: "sawtooth", gain: 0.1 }
  ),
  winRound: () => timedMelody(
    [[midi(61), 0.27], [midi(68), 0.469]],
    CLEAN_CUE_SECONDS.winRound,
    { gain: 0.15 }
  ),
  loseRound: () => timedMelody(
    [[midi(61), 0.57], [midi(56), 0.663]],
    CLEAN_CUE_SECONDS.loseRound,
    { gain: 0.15 }
  ),
  dragon: () => tone(midi(84), 0, CLEAN_CUE_SECONDS.dragon, { type: "sawtooth", gain: 0.18 }),
  dragonKill: () => timedMelody(
    [
      ...Array.from({ length: 12 }, () => [[midi(84), 0.065], [0, 0.025]] as const).flat(),
      [midi(61), 0.09], [midi(69), 0.07], [midi(66), 0.11], [midi(63), 0.12],
      [midi(61), 0.12], [midi(59), 0.12], [midi(58), 0.08], [midi(57), 0.14],
      [midi(56), 0.11], [midi(55), 0.05], [midi(54), 0.17], [midi(53), 0.14],
      [midi(52), 0.3], [midi(51), 0.17], [midi(50), 1.04],
    ],
    CLEAN_CUE_SECONDS.dragonKill,
    { gain: 0.17 }
  ),
  lost: () => timedMelody(
    [[midi(61), 0.12], [midi(69), 0.15], [midi(65), 0.17], [midi(63), 0.21],
      [midi(60), 0.26], [midi(58), 0.28], [midi(56), 0.3], [midi(55), 0.38]],
    CLEAN_CUE_SECONDS.lost,
    { gain: 0.16 }
  ),
  plague: () => timedMelody(
    [[midi(56), 1.11], [midi(59), 0.21], [midi(58), 0.46], [midi(56), 0.48],
      [midi(55), 0.26], [midi(56), 0.28]],
    CLEAN_CUE_SECONDS.plague,
    { gain: 0.17 }
  ),
  starving: () => timedMelody(
    [[midi(57), 0.065], [midi(59), 0.065], [midi(61), 0.065], [midi(63), 0.065],
      [0, 0.155], [midi(57), 0.07], [midi(59), 0.07], [midi(61), 0.06],
      [midi(63), 0.05], [midi(66), 0.055], [midi(68), 0.055], [0, 0.08],
      [midi(57), 0.07], [midi(59), 0.07], [midi(61), 0.07], [midi(63), 0.05],
      [midi(66), 0.05], [midi(68), 0.05], [midi(72), 0.07]],
    CLEAN_CUE_SECONDS.starving,
    { gain: 0.16 }
  ),
  bazaar: () => timedMelody(
    [[midi(56), 0.39], [midi(59), 0.34], [midi(62), 0.28], [midi(63), 0.26],
      [midi(62), 0.26], [midi(59), 0.33], [midi(62), 0.28], [midi(63), 0.25],
      [midi(62), 0.6]],
    CLEAN_CUE_SECONDS.bazaar,
    { gain: 0.14 }
  ),
  failure: () => timedMelody(
    [[midi(61), 0.12], [midi(69), 0.15], [midi(65), 0.17], [midi(63), 0.21],
      [midi(60), 0.26], [midi(58), 0.28], [midi(56), 0.3], [midi(55), 0.38]],
    CLEAN_CUE_SECONDS.bazaarClosed,
    { gain: 0.16 }
  ),
  keyMissing: () => timedMelody(
    [[midi(61), 0.57], [midi(56), 0.663]],
    CLEAN_CUE_SECONDS.loseRound,
    { gain: 0.16 }
  ),
  sanctuary: () => patternedTone(
    [midi(87), midi(90), midi(83)],
    CLEAN_CUE_SECONDS.sanctuary,
    0.023,
    { gain: 0.13 }
  ),
  frontier: () => timedMelody(
    [[midi(73), 0.07], [0, 0.03], [midi(75), 0.07], [midi(60), 0.05],
      [midi(73), 0.07], [0, 0.03], [midi(75), 0.07], [midi(60), 0.05],
      [midi(73), 0.07], [0, 0.03], [midi(75), 0.07], [midi(60), 0.05],
      [midi(73), 0.07], [0, 0.03], [midi(75), 0.07], [midi(60), 0.1]],
    CLEAN_CUE_SECONDS.frontier,
    { gain: 0.15 }
  ),
  darkTower: () => timedMelody(
    [[midi(57), 0.19], [midi(59), 0.19], [midi(61), 0.18], [midi(59), 0.19],
      [midi(57), 0.2], [midi(59), 0.2], [midi(61), 0.22], [0, 0.13],
      [midi(57), 1.276]],
    CLEAN_CUE_SECONDS.darkTower,
    { gain: 0.18 }
  ),
  endTurn: () => timedMelody(
    [[midi(61), 0.1], [midi(73), 0.12], [0, 0.02], [midi(84), 0.128]],
    CLEAN_CUE_SECONDS.endTurn,
    { gain: 0.12 }
  ),
  clear: () => timedMelody(
    [[midi(69), 0.19], [midi(81), 0.17], [midi(69), 0.2], [midi(81), 0.16],
      [midi(69), 0.2], [midi(81), 0.16], [midi(69), 0.21], [midi(81), 0.228]],
    CLEAN_CUE_SECONDS.clear,
    { gain: 0.13 }
  ),
  tombNothing: () => patternedTone(
    [midi(70), midi(71)],
    CLEAN_CUE_SECONDS.tombNothing,
    0.055,
    { type: "sawtooth", gain: 0.1 }
  ),
  victory: () => timedMelody(
    [[midi(57), 0.45], [midi(52), 0.43], [midi(57), 0.15], [midi(52), 0.17],
      [midi(57), 0.17], [midi(60), 0.41], [midi(57), 0.34], [midi(60), 0.13],
      [midi(57), 0.12], [midi(60), 0.15], [midi(64), 0.43], [midi(52), 0.34],
      [midi(57), 0.17], [midi(52), 0.18], [midi(57), 0.16], [midi(61), 1.0]],
    CLEAN_CUE_SECONDS.victory,
    { gain: 0.2 }
  ),
};

function synthesized(cue: () => void) {
  return () => {
    if (muted) return;
    stopAll();
    cue();
  };
}

export const sfx = {
  click: synth.click,
  move: synthesized(synth.move),
  safe: synthesized(synth.safe),
  gold: synthesized(synth.gold),
  key: synthesized(synth.key),

  pegasus: () => captured(TOWER_AUDIO.pegasus, synth.pegasus),
  plague: () => captured(TOWER_AUDIO.plague, synth.plague),
  lost: () => captured(TOWER_AUDIO.lost, synth.lost),
  dragon: () => captured(TOWER_AUDIO.dragon, synth.dragon),
  dragonKill: () => captured(TOWER_AUDIO.dragonKill, synth.dragonKill),

  brigands: () => captured(TOWER_AUDIO.battle, synth.battle),
  tombBattle: () => captured(TOWER_AUDIO.tombBattle, synth.tombBattle),
  tombDoor: () => captured(
    TOWER_AUDIO.tombDoor,
    synth.tombDoor,
    0.82,
    CLEAN_CUE_SECONDS.tombDoor
  ),
  winRound: () => captured(TOWER_AUDIO.enemyHit, synth.winRound),
  loseRound: () => captured(TOWER_AUDIO.playerHit, synth.loseRound),

  bazaar: () => captured(TOWER_AUDIO.bazaar, synth.bazaar),
  bazaarClosed: () => captured(TOWER_AUDIO.bazaarClosed, synth.failure),
  keyMissing: () => captured(TOWER_AUDIO.playerHit, synth.keyMissing),
  tombNothing: () => captured(TOWER_AUDIO.tombNothing, synth.tombNothing),
  sanctuary: () => captured(TOWER_AUDIO.sanctuary, synth.sanctuary),
  frontier: () => captured(TOWER_AUDIO.frontier, synth.frontier),
  darkTower: () => captured(TOWER_AUDIO.darkTower, synth.darkTower),
  starving: () => captured(TOWER_AUDIO.starving, synth.starving),
  endTurn: () => captured(TOWER_AUDIO.endTurn, synth.endTurn),
  clear: () => captured(TOWER_AUDIO.clear, synth.clear),

  // The ROM plays its theme at game start and after final victory. The archive
  // labels that original-unit capture `intro.wav`.
  victory: () => captured(TOWER_AUDIO.intro, synth.victory, 0.88),
  defeat: () => captured(TOWER_AUDIO.playerHit, synth.loseRound),
};

export type SfxName = keyof typeof sfx;
