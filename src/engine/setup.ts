/**
 * Game setup — builds the initial GameState for 1–4 players.
 */
import {
  DIFFICULTY_TOWER_BRIGANDS,
  DRAGON_TREASURE,
  KEY_ORDER,
  KINGDOM_ORDER,
  MAX_STAT,
  STARTING_FOOD,
  STARTING_GOLD,
  STARTING_WARRIORS,
} from "./constants";
import { citadelId } from "./board";
import type { Difficulty, GameState, ItemType, KeyType, Player } from "./types";
import type { Rng } from "./rng";

/** Level 4 — the ROM's test mode: everything maxed (asm L4INIT ~1197–1208). */
const LEVEL4_LOADOUT: ItemType[] = [
  "sword",
  "scout",
  "healer",
  "beast",
  "brassKey",
  "silverKey",
  "goldKey",
];

export interface PlayerConfig {
  name: string;
}

export interface GameConfig {
  players: PlayerConfig[]; // 1–4
  difficulty: Difficulty;
}

function makePlayer(id: number, name: string, home: Player["home"], difficulty: Difficulty): Player {
  const maxed = difficulty === 4;
  return {
    id,
    name,
    home,
    position: citadelId(home), // start at the home citadel territory
    lastKingdom: home,
    previousKingdom: home,
    warriors: maxed ? MAX_STAT : STARTING_WARRIORS,
    gold: maxed ? MAX_STAT : STARTING_GOLD,
    food: maxed ? MAX_STAT : STARTING_FOOD,
    inventory: new Set<ItemType>(maxed ? LEVEL4_LOADOUT : []),
    flags: {
      citadelVisited: false,
      cursed: false,
      lostWithScout: false,
      freshHaggle: true,
      regionKeyAvailable: false, // home owes no key; set true on each frontier crossing
    },
    alive: true,
    won: false,
  };
}

/** Fisher–Yates shuffle using the engine RNG. */
function shuffle<T>(arr: T[], rng: Rng): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.range(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function createGame(config: GameConfig, rng: Rng): GameState {
  const players = config.players
    .slice(0, 4)
    .map((p, i) => makePlayer(i, p.name || `Player ${i + 1}`, KINGDOM_ORDER[i], config.difficulty));

  const range = DIFFICULTY_TOWER_BRIGANDS[config.difficulty];
  const towerBrigands = rng.range(range.min, range.max);

  // The Tower's entry riddle: a fixed-for-the-game ordering of the keys. Level 4
  // (test mode) pins it to gold → silver → brass (asm L4INIT 5/14=gold, 5/15=silver)
  // so the win can be tested at once; other levels shuffle.
  const keyRiddleOrder: KeyType[] =
    config.difficulty === 4 ? ["goldKey", "silverKey", "brassKey"] : shuffle([...KEY_ORDER], rng);

  return {
    phase: "playing",
    difficulty: config.difficulty,
    players,
    currentPlayerIndex: 0,
    turn: 1,
    keyRiddleOrder,
    towerBrigands,
    dragonHoard: { ...DRAGON_TREASURE },
    winnerId: null,
    towerStage: null,
    riddleStep: 0,
    combat: null,
    bazaar: null,
    log: [],
    lastEvent: null,
  };
}
