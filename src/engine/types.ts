/**
 * Core domain types for the Dark Tower engine.
 *
 * The engine is pure and framework-free. All game logic is expressed as
 * functions over these types so it can be unit-tested against the ROM
 * disassembly in `reference/darktower.asm`.
 */

export type KingdomId = "arisilon" | "brynthia" | "durnin" | "zenon";

export type Difficulty = 1 | 2 | 3 | 4;

/** Inventory items + the three keys. Pegasus is tracked by its physical token. */
export type ItemType =
  | "sword" // Dragon defense — also wins the dragon's hoard
  | "scout" // Lost defense
  | "healer" // Plague defense
  | "beast" // Reduces food consumption / carries gold
  | "pegasus" // One-use flight within a kingdom or across its frontier
  | "brassKey"
  | "silverKey"
  | "goldKey";

export type KeyType = "brassKey" | "silverKey" | "goldKey";

export type BuildingType =
  | "citadel"
  | "frontier"
  | "bazaar"
  | "sanctuary"
  | "tomb"
  | "ruin"
  | "darkTower";

/** A player's location is a board territory id (see board.ts). */
export type PlayerPosition = string;

export interface Player {
  id: number;
  name: string;
  /** The player's home kingdom (where their citadel is). */
  home: KingdomId;
  position: PlayerPosition;
  /** Kingdom of the last region occupied — persists while travelling a frontier. */
  lastKingdom: KingdomId;
  /** Kingdom held just before the current one. Frontiers are one-way: you can
   * never cross back into this kingdom (nor the current one) from a lane. */
  previousKingdom: KingdomId;

  warriors: number;
  gold: number;
  food: number;

  /** Durable items the player holds (sword/scout/healer/beast/pegasus + keys). */
  inventory: Set<ItemType>;

  /** Per-turn / per-visit flags mirroring the ROM's RAM flags. */
  flags: {
    /** 0/3 bit 0 — Citadel visited since last tomb run (blocks repeat warrior bonus). */
    citadelVisited: boolean;
    /** 0/3 bit 1 — player is currently cursed (loses next turn). */
    cursed: boolean;
    /** 4/12 bit 0 — was lost this turn but saved by a Scout. */
    lostWithScout: boolean;
    /** 4/12 bit 1 — has not haggled yet this bazaar visit (better first-round odds). */
    freshHaggle: boolean;
    /** 2/3 bit 0 — the current region still owes this player a key. */
    regionKeyAvailable: boolean;
  };

  alive: boolean;
  won: boolean;
  /** Completed ordinary turns; a Scout continuation remains part of one turn. */
  turnsTaken: number;
  /** ROM-calculated two-digit result, assigned only when this player finishes. */
  score: number | null;
}

/** What kind of move-event fired (the DOMOVE 16ths table). */
export type MoveEventType = "lost" | "dragon" | "plague" | "brigands" | "safe";

/** The lamp categories on the physical tower's rotating drum (RAM 0/0). */
export type DrumPosition =
  | "warrior-food-beast"
  | "scout-healer-gold"
  | "goldkey-silverkey-brasskey"
  | "dragon-sword-pegasus"
  | "wizard-bazaarclosed-keymissing"
  | "victory-warriors-brigands"
  | "cursed-lost-plague";

export type GamePhase =
  | "setup"
  | "playing" // awaiting the active player's action
  | "encounter" // showing a move-event result
  | "combat" // brigand battle in progress
  | "bazaar"
  | "sanctuary"
  | "tomb"
  | "wizard" // choosing which rival receives a Wizard curse
  | "dragonPlacement" // placing the physical Dragon blocker after an attack
  | "frontier"
  | "darkTower" // final battle sequence
  | "gameOver";

export interface GameState {
  phase: GamePhase;
  difficulty: Difficulty;
  players: Player[];
  currentPlayerIndex: number;
  turn: number;

  /** The randomly-fixed key sequence required to enter the Tower this game. */
  keyRiddleOrder: KeyType[];
  /** Number of brigands defending the Tower (set by difficulty at game start). */
  towerBrigands: number;

  /**
   * The dragon's persistent hoard (asm RAM 3/5–8). Starts at 2 warriors / 6 gold;
   * it grows as the dragon steals from players and is handed to whoever slays it
   * with a sword, then resets to the default.
   */
  dragonHoard: { warriors: number; gold: number };

  /** Territory occupied by the physical Dragon pawn, blocking entry. */
  dragonPosition: string | null;
  /** Legal destinations awaiting selection after the most recent attack. */
  dragonPlacement: { candidateIds: string[] } | null;

  winnerId: number | null;

  /** Dark Tower endgame stage when the active player is at the Tower. */
  towerStage: "riddle" | "battle" | null;
  /** Which key of the riddle you're guessing this attempt (0 = first, 1 = second;
   * getting both right solves it — the third key is automatic). */
  riddleStep: number;

  /** Active brigand/tower combat, if any (see combat.ts, Phase 6). */
  combat: CombatState | null;

  /** Active bazaar visit, if any. */
  bazaar: BazaarState | null;

  /** Pending rival choice after finding a Wizard in multiplayer. */
  wizardSelection: WizardSelectionState | null;

  /** Rolling event log (most recent last) for the UI to narrate. */
  log: LogEntry[];

  /** The most recent resolved event, surfaced to the UI for animation. */
  lastEvent: EventResult | null;
}

export interface WizardSelectionState {
  /** Eligible rivals in the same order as the physical tower's player cycle. */
  candidateIds: number[];
  /** Index of the rival currently shown as C–P# on the display. */
  index: number;
}

export interface LogEntry {
  turn: number;
  playerId: number;
  text: string;
}

export type BazaarWare = "warrior" | "food" | "beast" | "scout" | "healer";

/**
 * State of an in-progress bazaar visit. Items are offered one at a time in
 * `sequence` order; `qty` is the running incremental-purchase count for the
 * current item (0 = not buying yet).
 */
export interface BazaarState {
  prices: Record<BazaarWare, number>;
  /** Whether the haggle "first round" bonus is still available this visit. */
  freshHaggle: boolean;
  /** Items to offer, in order, skipping gear the player already owns. */
  sequence: BazaarWare[];
  /** Index of the item currently on display. */
  index: number;
  /** Pending incremental-purchase quantity for the current item (0 = none). */
  qty: number;
  closed: boolean;
  /** Short status line for the UI (last thing that happened). */
  note?: string;
}

/** A single step in the animated combat count-off. */
export interface CombatRound {
  round: number;
  playerStrength: number;
  brigandStrength: number;
  warriorsRemaining: number;
  brigandsRemaining: number;
  playerWonRound: boolean;
}

/** State of an in-progress brigand or Tower battle (fleshed out in Phase 6). */
export interface CombatState {
  /** Where this fight happens — a roadside ambush or the final Tower battle. */
  source: "brigands" | "tower";
  brigands: number;
  brigandsRemaining: number;
  warriorsAtStart: number;
  warriorsRemaining: number;
  rounds: CombatRound[];
  over: boolean;
  playerWon: boolean | null;
}

/** Result of resolving a single action, returned to the UI to animate. */
export interface EventResult {
  kind:
    | "move"
    | "combat"
    | "bazaar"
    | "sanctuary"
    | "tomb"
    | "frontier"
    | "starvation"
    | "darkTower";
  /** The drum position the physical tower would rotate to. */
  drum?: DrumPosition;
  moveEvent?: MoveEventType;
  /** Human-readable summary lines. */
  messages: string[];
  /** Deltas applied to the active player, for animated counters. */
  deltas?: Partial<Pick<Player, "warriors" | "gold" | "food">>;
  /** Items gained this event. */
  itemsGained?: ItemType[];
  /** A completed Bazaar purchase; absent for rejection or leaving empty-handed. */
  purchase?: { ware: BazaarWare; quantity: number; total: number };
  /** Whether the active player died as a result. */
  playerDied?: boolean;
}
