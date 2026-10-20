import { clone } from '../clone.ts';
import { bagTotal, emptyBag } from '../costs.ts';
import { nextInt } from '../rng.ts';
import { playerById } from '../state.ts';
import type {
  Action,
  GameEvent,
  GameState,
  HandlerTable,
  PlayerId,
  Resource,
  ResourceBag,
} from '../types.ts';
import { RESOURCES } from '../types.ts';
import { guardPhase, guardTurn } from './guard.ts';
import type { Step } from './turn.ts';

/** Picks one card from `bag` weighted by count. `total` must be bagTotal(bag) and > 0. */
function pickCard(bag: ResourceBag, total: number, seed: number): [Resource, number] {
  const [index, nextSeed] = nextInt(seed, total);
  let remaining = index;
  for (const resource of RESOURCES) {
    if (remaining < bag[resource]) return [resource, nextSeed];
    remaining -= bag[resource];
  }
  throw new Error('pickCard: index out of range');
}

/**
 * A 7 was rolled: every player holding more than 7 cards must discard half (rounded down).
 * Goes to DISCARD if anyone has to, otherwise straight to PIRATE.
 */
export function beginPirates(state: GameState): Step {
  const next = clone(state);
  next.pendingDiscards = {};
  for (const player of next.players) {
    const total = bagTotal(player.resources);
    if (total > 7) next.pendingDiscards[player.id] = Math.floor(total / 2);
  }
  next.phase = Object.keys(next.pendingDiscards).length > 0 ? 'DISCARD' : 'PIRATE';
  return { state: next, events: [] };
}

/**
 * A valid random discard for `playerId` (what the server plays when the 30 s timer expires).
 * Deterministic in `state.rng`, which it uses only as a seed: the state is not advanced.
 */
export function randomDiscard(
  state: GameState,
  playerId: PlayerId,
): Extract<Action, { type: 'discard' }> {
  const held: ResourceBag = { ...playerById(state, playerId).resources };
  const resources = emptyBag();
  let seed = state.rng;
  for (let left = state.pendingDiscards[playerId] ?? 0; left > 0; left--) {
    const total = bagTotal(held);
    if (total <= 0) break;
    const [resource, nextSeed] = pickCard(held, total, seed);
    seed = nextSeed;
    held[resource] -= 1;
    resources[resource] += 1;
  }
  return { type: 'discard', resources };
}

/** `thief` takes one random card (weighted by count) from `victim`; nothing if the victim is empty. */
export function stealRandom(state: GameState, thief: PlayerId, victim: PlayerId): Step {
  const next = clone(state);
  const from = playerById(next, victim);
  const total = bagTotal(from.resources);
  if (total <= 0) return { state: next, events: [] };
  const [resource, rng] = pickCard(from.resources, total, next.rng);
  next.rng = rng;
  from.resources[resource] -= 1;
  playerById(next, thief).resources[resource] += 1;
  return { state: next, events: [{ type: 'stolen', thief, victim, resource }] };
}

export const pirateHandlers: HandlerTable = {
  discard: (state, playerId, action) => {
    if (action.type !== 'discard') return { ok: false, error: 'err.wrongPhase' };
    const wrongPhase = guardPhase(state, 'DISCARD');
    if (wrongPhase) return { ok: false, error: wrongPhase };
    const required = state.pendingDiscards[playerId];
    if (required === undefined) return { ok: false, error: 'err.notYourTurn' };
    const bag = action.resources;
    if (
      !RESOURCES.every((r) => Number.isInteger(bag[r]) && bag[r] >= 0) ||
      bagTotal(bag) !== required
    ) {
      return { ok: false, error: 'err.invalidCount' };
    }
    const next = clone(state);
    const player = playerById(next, playerId);
    if (RESOURCES.some((r) => bag[r] > player.resources[r])) {
      return { ok: false, error: 'err.insufficientResources' };
    }
    for (const r of RESOURCES) player.resources[r] -= bag[r];
    delete next.pendingDiscards[playerId];
    if (Object.keys(next.pendingDiscards).length === 0) next.phase = 'PIRATE';
    return {
      ok: true,
      state: next,
      events: [{ type: 'discarded', player: playerId, count: required }],
    };
  },

  movePirate: (state, playerId, action) => {
    if (action.type !== 'movePirate') return { ok: false, error: 'err.wrongPhase' };
    const denied = guardTurn(state, playerId, 'PIRATE');
    if (denied) return { ok: false, error: denied };
    const target = state.sectors[action.to];
    if (!target || target.kind === 'home' || state.pirate === action.to) {
      return { ok: false, error: 'err.invalidSector' };
    }
    const moved = clone(state);
    moved.pirate = action.to;
    moved.phase = 'MAIN';
    const events: GameEvent[] = [{ type: 'pirateMoved', player: playerId, to: action.to }];
    if (target.owner === null || target.owner === playerId) {
      return { ok: true, state: moved, events };
    }
    const steal = stealRandom(moved, playerId, target.owner);
    return { ok: true, state: steal.state, events: [...events, ...steal.events] };
  },
};
