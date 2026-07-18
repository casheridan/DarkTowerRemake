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

export interface Settings {
  /** Reveal the exact disassembly-derived odds in the UI. */
  showOdds: boolean;
  muted: boolean;
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
  setEditing: (editing: boolean) => void;
  newGame: (config: GameConfig) => void;
  dispatch: (action: GameAction) => void;
  select: (id: string | null) => void;
  quitToMenu: () => void;
  toggleOdds: () => void;
  toggleMute: () => void;
}

// RNG lives outside React state so re-renders never reset the sequence.
let rng: Rng = createRng();

export const useGame = create<GameStore>((set, get) => ({
  game: null,
  settings: { showOdds: false, muted: false },
  editing: false,
  selected: null,

  setEditing: (editing) => set({ editing }),

  newGame: (config) => {
    rng = createRng();
    set({ game: createGame(config, rng), selected: null });
  },

  dispatch: (action) => {
    const { game } = get();
    if (!game) return;
    set({ game: reduce(game, action, rng), selected: null });
  },

  select: (id) => set({ selected: id }),

  quitToMenu: () => set({ game: null, selected: null }),

  toggleOdds: () => set((s) => ({ settings: { ...s.settings, showOdds: !s.settings.showOdds } })),
  toggleMute: () => set((s) => ({ settings: { ...s.settings, muted: !s.settings.muted } })),
}));

// Dev-only handle for debugging/automated verification in the browser console.
if (import.meta.env.DEV) {
  (window as unknown as { __game: typeof useGame }).__game = useGame;
}
