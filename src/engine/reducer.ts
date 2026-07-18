/**
 * Turn state machine. Pure reducer over GameState.
 *
 * Turn lifecycle (one action per turn, faithful to the original cadence):
 *   playing → [action] → encounter/combat/bazaar → resolve → end turn
 *   (consume food) → next player.
 */
import { buildingOf, isCrossing, isLane, isTowerAdjacent, kingdomOf, neighborsOf } from "./board";
import { applyFood, goldCapacity } from "./economy";
import { resolveMove } from "./encounters";
import { resolveSanctuary } from "./sanctuary";
import { resolveTomb } from "./tomb";
import {
  bazaarHaggle,
  bazaarNo,
  bazaarYes,
  createBazaar,
  type BazaarOutcome,
} from "./bazaar";
import {
  combatRetreat,
  combatRound,
  startBrigandCombat,
  startTowerCombat,
  type CombatReward,
} from "./combat";
import { ITEM_LABEL } from "./constants";
import type {
  BuildingType,
  EventResult,
  GameState,
  KeyType,
  LogEntry,
  Player,
} from "./types";
import type { Rng } from "./rng";
import { clonePlayer, hasAllKeys, nextKey } from "./util";

export type GameAction =
  | { type: "MOVE_TO"; to: string }
  | { type: "ACK_EVENT" }
  | { type: "SKIP_TURN" }
  | { type: "VISIT_SANCTUARY"; to?: string }
  | { type: "VISIT_TOMB"; to?: string }
  | { type: "ENTER_BAZAAR"; to?: string }
  | { type: "BAZAAR_YES" }
  | { type: "BAZAAR_NO" }
  | { type: "BAZAAR_HAGGLE" }
  | { type: "LEAVE_BAZAAR" }
  | { type: "COMBAT_ROUND" }
  | { type: "COMBAT_RETREAT" }
  | { type: "COMBAT_END" }
  | { type: "OPEN_TOWER"; to?: string }
  | { type: "GUESS_KEY"; key: KeyType }
  | { type: "LEAVE_TOWER" };

export function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

export function buildingAt(player: Player): BuildingType | undefined {
  return buildingOf(player.position);
}

/**
 * Relocate the active player onto an adjacent building territory as part of the
 * building action itself (no move-event roll) — or return them unchanged when
 * already standing there. Returns null for an illegal target (not adjacent, a
 * lane, or a key-gated crossing), which callers treat as a no-op.
 */
function relocateForBuilding(active: Player, to: string | undefined): Player | null {
  if (to === undefined || to === active.position) return active;
  if (isLane(to) || !neighborsOf(active.position).includes(to)) return null;
  if (isCrossing(active.position, to)) return null;
  const moved = clonePlayer(active);
  moved.position = to;
  moved.lastKingdom = kingdomOf(to);
  return moved;
}

function log(state: GameState, playerId: number, text: string): LogEntry[] {
  return [...state.log, { turn: state.turn, playerId, text }];
}

function withMessages(state: GameState, playerId: number, messages: string[]): LogEntry[] {
  return messages.reduce<LogEntry[]>(
    (acc, msg) => [...acc, { turn: state.turn, playerId, text: msg }],
    state.log
  );
}

function replacePlayer(players: Player[], updated: Player): Player[] {
  return players.map((p) => (p.id === updated.id ? updated : p));
}

function nextActiveIndex(state: GameState): { index: number; wrapped: boolean } {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (state.currentPlayerIndex + step) % n;
    const p = state.players[idx];
    if (p.alive && !p.won) return { index: idx, wrapped: idx <= state.currentPlayerIndex };
  }
  return { index: state.currentPlayerIndex, wrapped: true };
}

/** Consume food, apply starvation, advance to the next (non-cursed) player. */
function endTurn(state: GameState): GameState {
  const active = clonePlayer(currentPlayer(state));
  let entries = state.log;

  const food = applyFood(active.warriors, active.food);
  active.warriors = food.warriors;
  active.food = food.food;

  // Gold beyond what the warriors (and a Beast) can carry is left behind.
  const capacity = goldCapacity(active.warriors, active.inventory.has("beast"));
  if (active.gold > capacity) {
    const dropped = active.gold - capacity;
    active.gold = capacity;
    entries = log(
      { ...state, log: entries },
      active.id,
      `Your warriors can only carry ${capacity} gold — ${dropped} is left behind.`
    );
  }

  // Scout: a Lost result this turn becomes an extra turn — same player, same
  // turn counter (asm L414). Consume this turn's food first, then hand it back.
  const extraTurn = active.flags.lostWithScout;
  active.flags.lostWithScout = false;

  if (food.starved) {
    entries = log({ ...state, log: entries }, active.id, "Your provisions run dry — a warrior starves.");
  } else if (food.lowFood) {
    entries = log({ ...state, log: entries }, active.id, "Food supplies are running low.");
  }

  let stateAfter: GameState = {
    ...state,
    players: replacePlayer(state.players, active),
    log: entries,
    bazaar: null,
  };

  if (extraTurn) {
    return { ...stateAfter, phase: "playing", lastEvent: null };
  }

  let { index, wrapped } = nextActiveIndex(stateAfter);
  let turn = state.turn + (wrapped ? 1 : 0);

  // Skip a cursed player's turn, lifting the curse as we pass.
  let guard = 0;
  while (stateAfter.players[index].flags.cursed && guard < stateAfter.players.length) {
    const cursed = clonePlayer(stateAfter.players[index]);
    cursed.flags.cursed = false;
    stateAfter = {
      ...stateAfter,
      players: replacePlayer(stateAfter.players, cursed),
      log: log({ ...stateAfter, turn }, cursed.id, `${cursed.name} is cursed and loses a turn — the curse lifts.`),
    };
    const adv = nextActiveIndex({ ...stateAfter, currentPlayerIndex: index });
    index = adv.index;
    if (adv.wrapped) turn += 1;
    guard++;
  }

  return { ...stateAfter, currentPlayerIndex: index, turn, phase: "playing", lastEvent: null };
}

/** Commit an event result for the active player: apply, log, set encounter phase. */
function commitEncounter(
  state: GameState,
  player: Player,
  result: EventResult,
  extra: Partial<GameState> = {}
): GameState {
  return {
    ...state,
    players: replacePlayer(state.players, player),
    log: withMessages(state, player.id, result.messages),
    lastEvent: result,
    phase: "encounter",
    ...extra,
  };
}

/** Curse a random rival of the active player (Wizard from a tomb). */
function applyWizardCurse(state: GameState, rng: Rng): GameState {
  const active = currentPlayer(state);
  const rivals = state.players.filter((p) => p.id !== active.id && p.alive && !p.won);
  if (rivals.length === 0) return state;
  const target = clonePlayer(rivals[rng.range(0, rivals.length - 1)]);
  target.flags.cursed = true;
  return {
    ...state,
    players: replacePlayer(state.players, target),
    log: log(state, target.id, `${target.name} has been cursed by the Wizard!`),
  };
}

/** Run a bazaar step, log its note, and end the turn when the visit closes. */
function applyBazaar(
  state: GameState,
  step: (b: import("./types").BazaarState, p: Player) => BazaarOutcome
): GameState {
  if (state.phase !== "bazaar" || !state.bazaar) return state;
  const outcome = step(state.bazaar, currentPlayer(state));
  if (outcome.ended) {
    return commitEncounter(
      state,
      outcome.player,
      {
        kind: "bazaar",
        drum: "wizard-bazaarclosed-keymissing",
        messages: [outcome.ended],
      },
      { bazaar: null }
    );
  }
  const players = replacePlayer(state.players, outcome.player);
  const entries = outcome.bazaar.note
    ? log(state, outcome.player.id, outcome.bazaar.note)
    : state.log;
  return { ...state, players, bazaar: outcome.bazaar, log: entries };
}

export function reduce(state: GameState, action: GameAction, rng: Rng): GameState {
  switch (action.type) {
    case "MOVE_TO": {
      if (state.phase !== "playing") return state;
      const active = currentPlayer(state);
      const from = active.position;
      const to = action.to;
      // Must be an adjacent territory (the Tower is entered via OPEN_TOWER).
      if (to === "tower" || !neighborsOf(from).includes(to)) return state;

      const fromLane = isLane(from);
      const allKeys = hasAllKeys(active);

      // Stepping ONTO a frontier = trying to leave your kingdom. The ROM gates
      // this on the current region's key (S53D: "Key Missing" until found), and
      // frontiers are strictly one-way, so the lane must lead to a NEW kingdom —
      // one you're not tied to and didn't just come from. A lane whose only far
      // side is a kingdom you've already left is a dead end you can't step onto.
      if (isLane(to)) {
        const leadsForward = neighborsOf(to).some(
          (n) =>
            !isLane(n) &&
            kingdomOf(n) !== active.lastKingdom &&
            kingdomOf(n) !== active.previousKingdom
        );
        if (!leadsForward) return state;
        if (active.flags.regionKeyAvailable && !allKeys) {
          return commitEncounter(state, clonePlayer(active), {
            kind: "frontier",
            drum: "wizard-bazaarclosed-keymissing",
            messages: ["KEY MISSING — find this kingdom's key before you cross the frontier."],
          });
        }
        const moved = clonePlayer(active);
        moved.position = to;
        return commitEncounter(state, moved, {
          kind: "frontier",
          drum: "goldkey-silverkey-brasskey",
          messages: ["You travel the frontier — choose the kingdom ahead."],
        });
      }

      // Stepping OFF a frontier into a kingdom. Forward-only: you may only enter
      // a kingdom you're not already tied to and didn't come from — never back.
      if (fromLane) {
        const targetKingdom = kingdomOf(to);
        if (targetKingdom === active.lastKingdom || targetKingdom === active.previousKingdom) {
          return state; // the frontier is one-way — no going back
        }
        const moved = clonePlayer(active);
        moved.position = to;
        moved.previousKingdom = active.lastKingdom;
        moved.lastKingdom = targetKingdom;
        moved.flags.regionKeyAvailable = !allKeys; // the new region owes a key
        moved.flags.citadelVisited = false;
        const dest = targetKingdom.charAt(0).toUpperCase() + targetKingdom.slice(1);
        return commitEncounter(state, moved, {
          kind: "frontier",
          drum: "goldkey-silverkey-brasskey",
          messages: [
            `You cross the frontier into ${dest}.`,
            allKeys ? "With all three keys, you travel freely." : "Seek this kingdom's key.",
          ],
        });
      }

      // Normal move within a kingdom: arrive, then roll the encounter.
      const moved = clonePlayer(active);
      moved.position = to;
      const res = resolveMove(moved, state.dragonHoard, rng, from);
      if (!isLane(res.player.position)) {
        res.player.lastKingdom = kingdomOf(res.player.position);
      }
      const next = commitEncounter(state, res.player, res.result, { dragonHoard: res.dragonHoard });
      if (res.startCombat) {
        return { ...next, phase: "combat", combat: startBrigandCombat(res.player, rng) };
      }
      return next;
    }

    case "VISIT_SANCTUARY": {
      if (state.phase !== "playing") return state;
      const active = relocateForBuilding(currentPlayer(state), action.to);
      if (!active) return state;
      const building = buildingAt(active);
      if (building !== "sanctuary" && building !== "citadel") return state;
      const { player, result } = resolveSanctuary(active, building, rng);
      return commitEncounter(state, player, result);
    }

    case "VISIT_TOMB": {
      if (state.phase !== "playing") return state;
      const active = relocateForBuilding(currentPlayer(state), action.to);
      if (!active) return state;
      const building = buildingAt(active);
      if (building !== "tomb" && building !== "ruin") return state;
      const res = resolveTomb(active, rng);
      // A tomb run re-arms the citadel-doubling bonus.
      res.player.flags.citadelVisited = false;
      let next = commitEncounter(state, res.player, res.result);
      if (res.castWizard) next = applyWizardCurse(next, rng);
      if (res.startCombat) {
        // Brigands guard the tomb — its treasure is the reward for victory.
        const key = res.player.flags.regionKeyAvailable ? nextKey(res.player) : null;
        const reward: CombatReward = {
          gold: rng.range(13, 20),
          items: key ? [key] : [],
        };
        return { ...next, phase: "combat", combat: startBrigandCombat(res.player, rng, reward) };
      }
      return next;
    }

    case "ENTER_BAZAAR": {
      if (state.phase !== "playing") return state;
      const active = relocateForBuilding(currentPlayer(state), action.to);
      if (!active || buildingAt(active) !== "bazaar") return state;
      return {
        ...state,
        players: replacePlayer(state.players, active),
        phase: "bazaar",
        bazaar: createBazaar(active, rng),
      };
    }

    case "BAZAAR_HAGGLE":
      return applyBazaar(state, (b, p) => bazaarHaggle(b, p, rng));
    case "BAZAAR_YES":
      return applyBazaar(state, (b, p) => bazaarYes(b, p));
    case "BAZAAR_NO":
      return applyBazaar(state, (b, p) => bazaarNo(b, p));

    case "LEAVE_BAZAAR": {
      if (state.phase !== "bazaar") return state;
      return endTurn({ ...state, bazaar: null });
    }

    case "COMBAT_ROUND": {
      if (state.phase !== "combat" || !state.combat) return state;
      return { ...state, combat: combatRound(state.combat, rng) };
    }

    case "COMBAT_RETREAT": {
      if (state.phase !== "combat" || !state.combat) return state;
      return { ...state, combat: combatRetreat(state.combat) };
    }

    case "COMBAT_END": {
      if (state.phase !== "combat" || !state.combat || !state.combat.over) return state;
      const combat = state.combat;
      const player = clonePlayer(currentPlayer(state));
      player.warriors = combat.warriorsRemaining;

      const messages: string[] = [];
      if (combat.playerWon) {
        messages.push(
          combat.source === "tower"
            ? "The Dark Tower falls! Evil is vanquished!"
            : "You rout the brigands!"
        );
        if (combat.reward) {
          if (combat.reward.gold) {
            player.gold = Math.min(99, player.gold + combat.reward.gold);
            messages.push(`Spoils of war: +${combat.reward.gold} gold.`);
          }
          if (combat.reward.warriors) player.warriors = Math.min(99, player.warriors + combat.reward.warriors);
          for (const item of combat.reward.items ?? []) {
            player.inventory.add(item);
            if (item.endsWith("Key")) player.flags.regionKeyAvailable = false;
            messages.push(`You claim the ${ITEM_LABEL[item]}!`);
          }
        }
      } else {
        messages.push(
          combat.source === "tower"
            ? "The Tower repels your assault — regroup and try again."
            : "Your party is driven off."
        );
      }

      // Tower victory ends the game.
      if (combat.source === "tower" && combat.playerWon) {
        const won = { ...player, won: true };
        return {
          ...state,
          players: replacePlayer(state.players, won),
          combat: null,
          towerStage: null,
          winnerId: won.id,
          phase: "gameOver",
          log: withMessages(state, won.id, messages),
        };
      }

      const settled: GameState = {
        ...state,
        players: replacePlayer(state.players, player),
        combat: null,
        towerStage: null,
        log: withMessages(state, player.id, messages),
      };
      return endTurn(settled);
    }

    case "OPEN_TOWER": {
      if (state.phase !== "playing") return state;
      // Like a building: step onto an adjacent tower-adjacent square if given,
      // then open. From your own tower-adjacent square, no `to` is needed.
      const active = relocateForBuilding(currentPlayer(state), action.to);
      if (!active || !hasAllKeys(active) || !isTowerAdjacent(active.position)) return state;
      return {
        ...state,
        players: replacePlayer(state.players, active),
        phase: "darkTower",
        towerStage: "riddle",
        riddleStep: 0,
        lastEvent: null,
      };
    }

    // The Riddle of the Keys (asm ~3691): guess one key at a time in order. A
    // correct key advances to the next; getting the first two right solves it
    // (the third is automatic). A wrong key ends your turn — return to retry.
    case "GUESS_KEY": {
      if (state.phase !== "darkTower" || state.towerStage !== "riddle") return state;
      const step = state.riddleStep;
      if (action.key !== state.keyRiddleOrder[step]) {
        return commitEncounter(
          state,
          currentPlayer(state),
          {
            kind: "darkTower",
            drum: "wizard-bazaarclosed-keymissing",
            messages: ["Wrong key! The Dark Tower rejects you — your turn ends. Come back and try again."],
          },
          { towerStage: null, riddleStep: 0 }
        );
      }
      const nextStep = step + 1;
      if (nextStep >= 2) {
        // Two right — the last key is forced. The Tower opens; to battle!
        return {
          ...state,
          phase: "combat",
          towerStage: "battle",
          riddleStep: 0,
          combat: startTowerCombat(currentPlayer(state), state.towerBrigands),
          lastEvent: {
            kind: "darkTower",
            messages: ["The locks turn! The Dark Tower opens — to battle!"],
          },
        };
      }
      return {
        ...state,
        riddleStep: nextStep,
        lastEvent: { kind: "darkTower", messages: ["The first lock turns… choose the next key."] },
      };
    }

    case "LEAVE_TOWER": {
      if (state.phase !== "darkTower") return state;
      return endTurn({ ...state, towerStage: null });
    }

    case "ACK_EVENT": {
      if (state.phase !== "encounter") return state;
      return endTurn(state);
    }

    case "SKIP_TURN": {
      if (state.phase !== "playing") return state;
      return endTurn(state);
    }

    default:
      return state;
  }
}
