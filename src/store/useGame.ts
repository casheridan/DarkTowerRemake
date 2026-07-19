/**
 * Zustand store wrapping the pure engine. React components subscribe here;
 * all game mutations go through the engine reducer with a persistent RNG.
 */
import { create } from "zustand";
import {
  createGame,
  createRng,
  reduce,
  type GameAction,
  type GameConfig,
  type GameState,
  type Rng,
} from "../engine";
import type { TowerPresentation } from "../ui/presentation";

const PRESENTATION_STORAGE_KEY = "dark-tower-presentation";

function savedPresentation(): TowerPresentation {
  if (typeof window === "undefined") return "clean";
  try {
    return window.localStorage.getItem(PRESENTATION_STORAGE_KEY) === "original"
      ? "original"
      : "clean";
  } catch {
    return "clean";
  }
}

function rememberPresentation(value: TowerPresentation): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRESENTATION_STORAGE_KEY, value);
  } catch {
    // Storage can be disabled; the in-memory selection still works.
  }
}

export interface Settings {
  /** Reveal the exact disassembly-derived odds in the UI. */
  showOdds: boolean;
  muted: boolean;
  /** Clean recreation or original scanned display/audio captures. */
  towerPresentation: TowerPresentation;
}

interface GameStore {
  game: GameState | null;
  settings: Settings;
  /** When true, show the Map Editor instead of the menu/game. */
  editing: boolean;
  /**
   * The territory the player has tapped this turn. It drives which action
   * buttons light up in the Tower — click a territory, then the matching Tower
   * button commits the move / building / frontier crossing. null = the player's
   * own square (in-place building action, rest, etc.).
   */
  selected: string | null;
  /** Whether the active player is currently choosing a Pegasus destination. */
  pegasusMode: boolean;
  setEditing: (editing: boolean) => void;
  newGame: (config: GameConfig) => void;
  dispatch: (action: GameAction) => void;
  select: (id: string | null) => void;
  setPegasusMode: (active: boolean) => void;
  quitToMenu: () => void;
  toggleOdds: () => void;
  toggleMute: () => void;
  setTowerPresentation: (value: TowerPresentation) => void;
}

// RNG lives outside React state so re-renders never reset the sequence.
let rng: Rng = createRng();

export const useGame = create<GameStore>((set, get) => ({
  game: null,
  settings: { showOdds: false, muted: false, towerPresentation: savedPresentation() },
  editing: false,
  selected: null,
  pegasusMode: false,

  setEditing: (editing) => set({ editing }),

  newGame: (config) => {
    rng = createRng();
    set({ game: createGame(config, rng), selected: null, pegasusMode: false });
  },

  dispatch: (action) => {
    const { game } = get();
    if (!game) return;
    set({ game: reduce(game, action, rng), selected: null, pegasusMode: false });
  },

  select: (id) => set({ selected: id }),
  setPegasusMode: (active) => set({ pegasusMode: active, selected: null }),

  quitToMenu: () => set({ game: null, selected: null, pegasusMode: false }),

  toggleOdds: () => set((s) => ({ settings: { ...s.settings, showOdds: !s.settings.showOdds } })),
  toggleMute: () => set((s) => ({ settings: { ...s.settings, muted: !s.settings.muted } })),
  setTowerPresentation: (value) => {
    rememberPresentation(value);
    set((s) => ({ settings: { ...s.settings, towerPresentation: value } }));
  },
}));

// Dev-only handle for debugging/automated verification in the browser console.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __game: typeof useGame }).__game = useGame;
}
