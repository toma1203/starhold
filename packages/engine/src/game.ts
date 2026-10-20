import { clone } from './clone.ts';
import { emptyBag } from './costs.ts';
import { generateMap } from './map.ts';
import { shuffle } from './rng.ts';
import type {
  Action,
  ActionResult,
  GameSettings,
  GameState,
  PlayerId,
  PlayerState,
} from './types.ts';

export type Handler = (s: GameState, p: PlayerId, a: Action) => ActionResult;

/** Rule modules register their handlers here (imported and spread in by later tasks). */
export const HANDLERS: Partial<Record<Action['type'], Handler>> = {};

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

export function applyAction(state: GameState, playerId: PlayerId, action: Action): ActionResult {
  if (state.phase === 'FINISHED') return { ok: false, error: 'err.gameOver' };
  const handler = HANDLERS[action.type];
  if (!handler) return { ok: false, error: 'err.wrongPhase' };
  return handler(state, playerId, action);
}
