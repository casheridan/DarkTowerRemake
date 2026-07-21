/**
 * Turn state machine. Pure reducer over GameState.
 *
 * Turn lifecycle (one action per turn, faithful to the original cadence):
 *   playing → [action] → encounter/combat/bazaar → resolve → end turn
 *   (consume food) → next player.
 */
import { buildingOf, isCrossing, isLane, isTowerAdjacent, kingdomOf, neighborsOf } from "./board";
import { applyFood, clampStat, dragonTake, goldCapacity } from "./economy";
import { resolveMove } from "./encounters";
import { resolveSanctuary } from "./sanctuary";
import { resolveTomb, resolveTreasure } from "./tomb";
import { landPegasus } from "./pegasus";
import { dragonPlacementTerritories, isDragonBlocked } from "./dragon";
import { calculateScore } from "./score";
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
} from "./combat";
import type {
  BuildingType,
  EventResult,
  GameState,
  KeyType,
  LogEntry,
  Player,
} from "./types";
import type { Rng } from "./rng";
import { clonePlayer, hasAllKeys } from "./util";

export type GameAction =
  | { type: "MOVE_TO"; to: string }
  | { type: "PEGASUS_FLY"; to: string }
  | { type: "ACK_EVENT" }
  | { type: "SKIP_TURN" }
  | { type: "VISIT_SANCTUARY"; to?: string }
  | { type: "VISIT_TOMB"; to?: string }
  | { type: "ENTER_BAZAAR"; to?: string }
  | { type: "BAZAAR_YES" }
  | { type: "BAZAAR_NO" }
  | { type: "BAZAAR_HAGGLE" }
  | { type: "LEAVE_BAZAAR" }
  | { type: "WIZARD_NEXT" }
  | { type: "WIZARD_CONFIRM" }
  | { type: "WIZARD_CANCEL" }
  | { type: "DRAGON_PLACE"; to: string }
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

  if (food.starved) {
    entries = log({ ...state, log: entries }, active.id, "Your provisions run dry — a warrior starves.");
  } else if (food.lowFood) {
    entries = log({ ...state, log: entries }, active.id, "Food supplies are running low.");
  }

  if (state.players.length > 1 && active.warriors <= 0) {
    active.warriors = 1;
    entries = log(
      { ...state, log: entries },
      active.id,
      "One warrior survives to carry on your quest."
    );
  } else if (state.players.length === 1 && active.warriors <= 0) {
    active.warriors = 0;
    active.alive = false;
    active.score = 0;
    const message = "Your last warrior has fallen. Your score is 00.";
    entries = log({ ...state, log: entries }, active.id, message);
    return {
      ...state,
      players: replacePlayer(state.players, active),
      combat: null,
      bazaar: null,
      towerStage: null,
      winnerId: null,
      log: entries,
      lastEvent: {
        kind: "starvation",
        drum: "victory-warriors-brigands",
        messages: [message],
        playerDied: true,
      },
      phase: "gameOver",
    };
  }

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
  if (!extraTurn) active.turnsTaken += 1;

  let stateAfter: GameState = {
    ...state,
    players: replacePlayer(state.players, active),
    log: entries,
    bazaar: null,
    wizardSelection: null,
    dragonPlacement: null,
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
  let settledPlayer = player;
  let settledResult = result;

  // SUBWARR never eliminates a player in multiplayer: one warrior survives.
  if (state.players.length > 1 && settledPlayer.warriors <= 0) {
    settledPlayer = clonePlayer(settledPlayer);
    settledPlayer.warriors = 1;
    settledResult = {
      ...settledResult,
      messages: [...settledResult.messages, "One warrior survives to carry on your quest."],
    };
  }

  // In the ROM, reaching zero warriors in a one-player game immediately ends
  // the game with a score of 00.
  if (state.players.length === 1 && settledPlayer.warriors <= 0) {
    settledPlayer = { ...settledPlayer, warriors: 0, alive: false, score: 0 };
    settledResult = {
      ...settledResult,
      messages: [...settledResult.messages, "Your last warrior has fallen. Your score is 00."],
      playerDied: true,
    };
    return {
      ...state,
      ...extra,
      players: replacePlayer(state.players, settledPlayer),
      combat: null,
      bazaar: null,
      wizardSelection: null,
      dragonPlacement: null,
      towerStage: null,
      winnerId: null,
      log: withMessages(state, settledPlayer.id, settledResult.messages),
      lastEvent: settledResult,
      phase: "gameOver",
    };
  }

  return {
    ...state,
    players: replacePlayer(state.players, settledPlayer),
    log: withMessages(state, settledPlayer.id, settledResult.messages),
    lastEvent: settledResult,
    phase: "encounter",
    ...extra,
  };
}

/** Enter the ROM's C–P# rival-selection prompt after a Wizard reward. */
function beginWizardSelection(state: GameState): GameState {
  const active = currentPlayer(state);
  const candidateIds = state.players
    .filter((player) => player.id !== active.id && player.alive && !player.won)
    .map((player) => player.id);

  if (candidateIds.length === 0) {
    const message = "The Wizard finds no rival to curse.";
    return {
      ...state,
      log: log(state, active.id, message),
      lastEvent: state.lastEvent
        ? { ...state.lastEvent, messages: [...state.lastEvent.messages, message] }
        : null,
    };
  }

  return {
    ...state,
    phase: "wizard",
    wizardSelection: { candidateIds, index: 0 },
  };
}

/** Apply the ROM Wizard reward: steal a quarter and make the chosen rival lose a turn. */
function applyWizardCurse(state: GameState, targetId: number): GameState {
  const active = clonePlayer(currentPlayer(state));
  const selected = state.players.find(
    (player) => player.id === targetId && player.id !== active.id && player.alive && !player.won
  );
  if (!selected) return state;
  const target = clonePlayer(selected);
  const stolenWarriors = dragonTake(target.warriors);
  const stolenGold = dragonTake(target.gold);

  target.warriors = clampStat(target.warriors - stolenWarriors);
  target.gold = clampStat(target.gold - stolenGold);
  target.flags.cursed = true;
  active.warriors = clampStat(active.warriors + stolenWarriors);
  active.gold = clampStat(active.gold + stolenGold);
  const message = `The Wizard curses ${target.name}: you steal ${stolenWarriors} warriors and ${stolenGold} gold, and ${target.name} loses a turn.`;

  let players = replacePlayer(state.players, active);
  players = replacePlayer(players, target);
  return {
    ...state,
    players,
    phase: "encounter",
    wizardSelection: null,
    log: log(state, active.id, message),
    lastEvent: state.lastEvent
      ? {
          ...state.lastEvent,
          messages: [...state.lastEvent.messages, message],
          deltas: {
            ...state.lastEvent.deltas,
            warriors: (state.lastEvent.deltas?.warriors ?? 0) + stolenWarriors,
            gold: (state.lastEvent.deltas?.gold ?? 0) + stolenGold,
          },
        }
      : null,
  };
}

function cancelWizardCurse(state: GameState): GameState {
  const active = currentPlayer(state);
  const message = "You release the Wizard without cursing a rival.";
  return {
    ...state,
    phase: "encounter",
    wizardSelection: null,
    log: log(state, active.id, message),
    lastEvent: state.lastEvent
      ? { ...state.lastEvent, messages: [...state.lastEvent.messages, message] }
      : null,
  };
}

/** Pause an otherwise-resolved encounter while the attacked player moves the pawn. */
function beginDragonPlacement(state: GameState): GameState {
  const candidateIds = dragonPlacementTerritories(state);
  if (candidateIds.length === 0) return state;
  return {
    ...state,
    phase: "dragonPlacement",
    dragonPlacement: { candidateIds },
  };
}

/** Run a bazaar step, log its note, and end the turn when the visit closes. */
function applyBazaar(
  state: GameState,
  step: (b: import("./types").BazaarState, p: Player) => BazaarOutcome
): GameState {
  if (state.phase !== "bazaar" || !state.bazaar) return state;
  const before = currentPlayer(state);
  const outcome = step(state.bazaar, before);
  if (outcome.ended) {
    const purchase = outcome.purchase;
    const result: EventResult = purchase
      ? {
          kind: "bazaar",
          drum:
            purchase.ware === "scout" || purchase.ware === "healer"
              ? "scout-healer-gold"
              : "warrior-food-beast",
          messages: [outcome.ended],
          deltas: {
            gold: outcome.player.gold - before.gold,
            warriors: outcome.player.warriors - before.warriors,
            food: outcome.player.food - before.food,
          },
          itemsGained:
            purchase.ware === "beast" ||
            purchase.ware === "scout" ||
            purchase.ware === "healer"
              ? [purchase.ware]
              : [],
          purchase,
        }
      : {
          kind: "bazaar",
          drum: "wizard-bazaarclosed-keymissing",
          messages: [outcome.ended],
        };
    return commitEncounter(
      state,
      outcome.player,
      result,
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

      if (isDragonBlocked(state, to)) return state;

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

      // Stepping OFF a frontier is a normal territory move. First establish the
      // new kingdom/key state, then run the same DOMOVE encounter table used by
      // every other destination. Forward-only still applies.
      const moved = clonePlayer(active);
      if (fromLane) {
        const targetKingdom = kingdomOf(to);
        if (targetKingdom === active.lastKingdom || targetKingdom === active.previousKingdom) {
          return state; // the frontier is one-way — no going back
        }
        moved.previousKingdom = active.lastKingdom;
        moved.lastKingdom = targetKingdom;
        moved.flags.regionKeyAvailable = !allKeys; // the new region owes a key
        moved.flags.citadelVisited = false;
      }

      // Arrive, then roll the normal movement encounter.
      moved.position = to;
      const res = resolveMove(moved, state.dragonHoard, rng, from);
      if (fromLane && res.player.position === from) {
        // Lost without a Scout cancels the crossing completely. Restore the
        // frontier-side kingdom metadata along with the pawn's lane position.
        res.player.lastKingdom = active.lastKingdom;
        res.player.previousKingdom = active.previousKingdom;
        res.player.flags.regionKeyAvailable = active.flags.regionKeyAvailable;
        res.player.flags.citadelVisited = active.flags.citadelVisited;
      } else if (!isLane(res.player.position)) {
        res.player.lastKingdom = kingdomOf(res.player.position);
      }
      let next = commitEncounter(state, res.player, res.result, { dragonHoard: res.dragonHoard });
      if (res.startCombat) {
        return { ...next, phase: "combat", combat: startBrigandCombat(res.player, rng) };
      }
      if (res.event === "dragon") next = beginDragonPlacement(next);
      return next;
    }

    case "PEGASUS_FLY": {
      if (state.phase !== "playing") return state;
      if (isDragonBlocked(state, action.to)) return state;
      const active = currentPlayer(state);
      const moved = landPegasus(active, action.to);
      if (!moved) return state;
      const destination = kingdomOf(action.to);
      const name = destination.charAt(0).toUpperCase() + destination.slice(1);
      const landed = {
        ...state,
        players: replacePlayer(state.players, moved),
        log: log(state, active.id, `Your Pegasus lands in ${name}. The flight ends your turn.`),
      };
      return endTurn(landed);
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
      if (res.castWizard) next = beginWizardSelection(next);
      if (res.startCombat) {
        // The ROM only rolls the shared treasure table after the fight is won.
        return { ...next, phase: "combat", combat: startBrigandCombat(res.player, rng) };
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

    case "WIZARD_NEXT": {
      if (state.phase !== "wizard" || !state.wizardSelection) return state;
      const { candidateIds, index } = state.wizardSelection;
      return {
        ...state,
        wizardSelection: { candidateIds, index: (index + 1) % candidateIds.length },
      };
    }

    case "WIZARD_CONFIRM": {
      if (state.phase !== "wizard" || !state.wizardSelection) return state;
      const targetId = state.wizardSelection.candidateIds[state.wizardSelection.index];
      return applyWizardCurse(state, targetId);
    }

    case "WIZARD_CANCEL": {
      if (state.phase !== "wizard" || !state.wizardSelection) return state;
      return cancelWizardCurse(state);
    }

    case "DRAGON_PLACE": {
      if (state.phase !== "dragonPlacement" || !state.dragonPlacement) return state;
      if (!state.dragonPlacement.candidateIds.includes(action.to)) return state;
      return {
        ...state,
        phase: "encounter",
        dragonPosition: action.to,
        dragonPlacement: null,
      };
    }

    case "COMBAT_ROUND": {
      if (state.phase !== "combat" || !state.combat) return state;
      return { ...state, combat: combatRound(state.combat, rng, state.players.length) };
    }

    case "COMBAT_RETREAT": {
      if (state.phase !== "combat" || !state.combat) return state;
      return { ...state, combat: combatRetreat(state.combat, state.players.length) };
    }

    case "COMBAT_END": {
      if (state.phase !== "combat" || !state.combat || !state.combat.over) return state;
      const combat = state.combat;
      let player = clonePlayer(currentPlayer(state));
      player.warriors = combat.warriorsRemaining;

      const messages: string[] = [];
      if (combat.playerWon && combat.source === "brigands") {
        const treasure = resolveTreasure(player, rng, "combat");
        player = treasure.player;
        const result: EventResult = {
          ...treasure.result,
          messages: ["You rout the brigands!", ...treasure.result.messages],
        };
        let rewarded = commitEncounter(
          { ...state, combat: null, towerStage: null },
          player,
          result
        );
        if (treasure.castWizard) rewarded = beginWizardSelection(rewarded);
        return rewarded;
      }

      if (combat.playerWon) {
        messages.push(
          combat.source === "tower"
            ? "The Dark Tower falls! Evil is vanquished!"
            : "You rout the brigands!"
        );
      } else {
        messages.push(
          combat.source === "tower"
            ? "The Tower repels your assault — regroup and try again."
            : "Your party is driven off."
        );
      }

      // Tower victory ends the game.
      if (combat.source === "tower" && combat.playerWon) {
        const won = {
          ...player,
          won: true,
          score: calculateScore({
            towerBrigands: combat.brigands,
            turnsTaken: player.turnsTaken,
            warriorsAtTower: combat.warriorsAtStart,
          }),
        };
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
