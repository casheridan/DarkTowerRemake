/**
 * DOMOVE — random move-encounter resolution (asm ~2107–2548).
 *
 * A uniform 4-bit roll (0–15) selects the outcome:
 *   0–2 Lost · 3–4 Dragon · 5–7 Plague · 8–10 Brigands · 11–15 Safe.
 *
 * Brigand combat is resolved separately (see combat.ts) — this module only
 * flags that combat should begin. Everything else is resolved here.
 */
import { DRAGON_TREASURE, PLAGUE_WARRIOR_LOSS, classifyMoveRoll } from "./constants";
import { clampStat, dragonTake } from "./economy";
import type { DrumPosition, EventResult, MoveEventType, Player } from "./types";
import type { Rng } from "./rng";
import { clonePlayer, hasItem, withItem, withoutItem } from "./util";

export interface MoveResolution {
  roll: number;
  event: MoveEventType;
  /** Updated player (final for all events except brigands, resolved in combat). */
  player: Player;
  /** Updated global dragon hoard. */
  dragonHoard: { warriors: number; gold: number };
  /** True for a brigand encounter — the reducer should enter combat. */
  startCombat: boolean;
  /** True if the player's turn ends immediately (lost without a scout). */
  endTurn: boolean;
  result: EventResult;
}

const DRUM: Record<MoveEventType, DrumPosition> = {
  lost: "cursed-lost-plague",
  dragon: "dragon-sword-pegasus",
  plague: "cursed-lost-plague",
  brigands: "victory-warriors-brigands",
  safe: "warrior-food-beast",
};

/**
 * Resolve the random encounter for a move. The reducer has already set the
 * player's position to the destination territory; `originId` is where they came
 * from, so a "lost" result (without a Scout) can send them back.
 */
export function resolveMove(
  active: Player,
  dragonHoard: { warriors: number; gold: number },
  rng: Rng,
  originId: string
): MoveResolution {
  const roll = rng.rand0to15();
  const event = classifyMoveRoll(roll);

  const base: Omit<MoveResolution, "result"> = {
    roll,
    event,
    player: clonePlayer(active),
    dragonHoard: { ...dragonHoard },
    startCombat: false,
    endTurn: false,
  };

  switch (event) {
    case "lost":
      return resolveLost(base, originId);
    case "dragon":
      return resolveDragon(base);
    case "plague":
      return resolvePlague(base);
    case "brigands":
      return {
        ...base,
        startCombat: true,
        result: {
          kind: "move",
          drum: DRUM.brigands,
          moveEvent: "brigands",
          messages: ["Brigands ambush your party! Prepare for battle."],
        },
      };
    case "safe":
    default:
      return {
        ...base,
        result: {
          kind: "move",
          drum: DRUM.safe,
          moveEvent: "safe",
          messages: ["The road is quiet. You travel safely."],
        },
      };
  }
}

/** Lost (0–2): lose your turn and stay put — unless a Scout saves you. */
function resolveLost(base: Omit<MoveResolution, "result">, originId: string): MoveResolution {
  const player = clonePlayer(base.player);
  if (hasItem(player, "scout")) {
    // Scout (asm L414): the move stands AND you get an extra turn — the reducer
    // sees this flag on ACK and lets the same player go again.
    player.flags.lostWithScout = true;
    return {
      ...base,
      player,
      result: {
        kind: "move",
        drum: DRUM.lost,
        moveEvent: "lost",
        messages: ["You lose your way — but your Scout guides you on. Take another turn!"],
      },
    };
  }
  // Cancel the move: you never reach the new territory.
  player.position = originId;
  return {
    ...base,
    player,
    endTurn: true,
    result: {
      kind: "move",
      drum: DRUM.lost,
      moveEvent: "lost",
      messages: ["You are LOST! You lose your turn and never reach your destination."],
    },
  };
}

/** Dragon (3–4): takes ¼ gold + ¼ warriors — unless you have a Sword to slay it. */
function resolveDragon(base: Omit<MoveResolution, "result">): MoveResolution {
  let player = clonePlayer(base.player);
  const hoard = { ...base.dragonHoard };

  if (hasItem(player, "sword")) {
    // Slay the dragon: claim its hoard, consume the sword, reset the hoard.
    const gainedWarriors = hoard.warriors;
    const gainedGold = hoard.gold;
    player.warriors = clampStat(player.warriors + gainedWarriors);
    player.gold = clampStat(player.gold + gainedGold);
    player = withoutItem(player, "sword");
    return {
      ...base,
      player,
      dragonHoard: { ...DRAGON_TREASURE },
      result: {
        kind: "move",
        drum: DRUM.dragon,
        moveEvent: "dragon",
        messages: [
          "A DRAGON attacks — but your Sword strikes true!",
          `You claim its hoard: +${gainedWarriors} warriors, +${gainedGold} gold. (Sword spent.)`,
        ],
        deltas: { warriors: gainedWarriors, gold: gainedGold },
      },
    };
  }

  // No sword: the dragon steals a quarter of your gold and warriors.
  const lostGold = dragonTake(player.gold);
  const lostWarriors = dragonTake(player.warriors);
  player.gold = clampStat(player.gold - lostGold);
  player.warriors = clampStat(player.warriors - lostWarriors);
  hoard.gold = clampStat(hoard.gold + lostGold);
  hoard.warriors = clampStat(hoard.warriors + lostWarriors);

  return {
    ...base,
    player,
    dragonHoard: hoard,
    result: {
      kind: "move",
      drum: DRUM.dragon,
      moveEvent: "dragon",
      messages: [
        "A DRAGON attacks! With no Sword to defend you, it plunders your party.",
        `Lost ${lostWarriors} warriors and ${lostGold} gold to the dragon's hoard.`,
      ],
      deltas: { warriors: -lostWarriors, gold: -lostGold },
    },
  };
}

/** Plague (5–7): kills 2 warriors — but a Healer turns it into +2 (asm S652). */
function resolvePlague(base: Omit<MoveResolution, "result">): MoveResolution {
  const player = clonePlayer(base.player);
  if (hasItem(player, "healer")) {
    const before = player.warriors;
    player.warriors = clampStat(player.warriors + PLAGUE_WARRIOR_LOSS);
    const gained = player.warriors - before;
    return {
      ...base,
      player,
      result: {
        kind: "move",
        drum: DRUM.plague,
        moveEvent: "plague",
        messages: [`PLAGUE sweeps your camp — but your Healer turns it around: +${gained} warriors!`],
        deltas: { warriors: gained },
      },
    };
  }
  const before = player.warriors;
  player.warriors = clampStat(player.warriors - PLAGUE_WARRIOR_LOSS);
  const lost = before - player.warriors;
  return {
    ...base,
    player,
    result: {
      kind: "move",
      drum: DRUM.plague,
      moveEvent: "plague",
      messages: [`PLAGUE strikes! You lose ${lost} warriors.`],
      deltas: { warriors: -lost },
    },
  };
}

export { withItem };
