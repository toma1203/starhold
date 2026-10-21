import { createGame, hexId, neighbors, viewFor } from '@starhold/engine';
import type {
  GameState,
  Phase,
  PlayerId,
  PlayerView,
  SeatConfig,
  Sector,
  SectorId,
} from '@starhold/engine';

export function makeState(players: 2 | 3 | 4 = 3, seed = 1): GameState {
  const seats: SeatConfig[] = Array.from({ length: players }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Pilot ${i + 1}`,
    isBot: false,
    botLevel: null,
  }));
  return createGame({ seats, targetVp: 8 }, seed);
}

export function inPhase(state: GameState, phase: Phase, current = 0): GameState {
  return { ...state, phase, current };
}

export function patchSector(state: GameState, id: SectorId, patch: Partial<Sector>): GameState {
  const sector = state.sectors[id];
  if (!sector) throw new Error(`unknown sector ${id}`);
  return { ...state, sectors: { ...state.sectors, [id]: { ...sector, ...patch } } };
}

export function withHand(state: GameState, id: PlayerId, n: number): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === id ? { ...p, resources: { metal: n, energy: n, crystal: n, biomass: n } } : p,
    ),
  };
}

export function neighbourIds(state: GameState, id: SectorId): SectorId[] {
  const sector = state.sectors[id];
  if (!sector) throw new Error(`unknown sector ${id}`);
  return neighbors(sector.hex)
    .map(hexId)
    .filter((n) => state.sectors[n] !== undefined);
}

export function viewOf(state: GameState, me: PlayerId): PlayerView {
  return viewFor(state, me);
}

export function homeOf(state: GameState, playerId: PlayerId): SectorId {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`unknown player ${playerId}`);
  return player.homeId;
}
