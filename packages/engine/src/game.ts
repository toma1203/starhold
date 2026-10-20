import { clone } from './clone.ts';
import { emptyBag } from './costs.ts';
import { generateMap } from './map.ts';
import { shuffle } from './rng.ts';
import { buildHandlers } from './rules/build.ts';
import { homeHandlers } from './rules/home.ts';
import { militaryHandlers } from './rules/military.ts';
import { pirateHandlers } from './rules/pirates.ts';
import { rollHandlers } from './rules/roll.ts';
import { tradeHandlers } from './rules/trade.ts';
import { turnHandlers } from './rules/turn.ts';
import type {
  Action,
  ActionResult,
  GameEvent,
  GameSettings,
  GameState,
  HandlerTable,
  PlayerId,
  PlayerState,
} from './types.ts';

/** Rule modules register their handlers here (imported and spread in by later tasks). */
export const HANDLERS: HandlerTable = {
  ...homeHandlers,
  ...rollHandlers,
  ...pirateHandlers,
  ...turnHandlers,
  ...buildHandlers,
  ...tradeHandlers,
  ...militaryHandlers,
};

export function createGame(settings: GameSettings, seed: number): GameState {
  const count = settings.seats.length;
  if (count < 2 || count > 4 || new Set(settings.seats.map((s) => s.id)).size !== count) {
    throw new Error('invalid seat count');
  }
  const map = generateMap(count as 2 | 3 | 4, seed);
  const [order, rng] = shuffle(map.seed, settings.seats);
  const sectors = map.sectors;
  const players: PlayerState[] = order.map((seat, i) => {
    const homeId = map.homeIds[i] as string;
    const home = sectors[homeId];
    if (!home) throw new Error(`missing home sector ${homeId}`);
    sectors[homeId] = { ...home, owner: seat.id, structure: 'colony', fleets: 3 };
    const resources = { ...emptyBag(), metal: 1, energy: 1, crystal: 1, biomass: 1 };
    return { ...seat, seat: i, resources, conquests: 0, homeId };
  });
  return {
    settings: clone(settings),
    sectors,
    sectorIds: map.sectorIds,
    players,
    current: 0,
    round: 1,
    phase: 'HOME_BONUS',
    dice: null,
    pirate: null,
    pendingDiscards: {},
    offer: null,
    conqueredThisTurn: false,
    awards: { largestEmpire: null, warlord: null },
    winner: null,
    endReason: null,
    rng,
  };
}

/**
 * Post-action hook run after every successful handler. Task 10 recomputes awards, victory points
 * and the winner here; until then it is the identity.
 */
function afterAction(
  state: GameState,
  events: GameEvent[],
): { state: GameState; events: GameEvent[] } {
  return { state, events };
}

export function applyAction(state: GameState, playerId: PlayerId, action: Action): ActionResult {
  if (state.phase === 'FINISHED') return { ok: false, error: 'err.gameOver' };
  const handler = HANDLERS[action.type];
  if (!handler) return { ok: false, error: 'err.wrongPhase' };
  const result = handler(state, playerId, action);
  if (!result.ok) return result;
  return { ok: true, ...afterAction(result.state, result.events) };
}
