import { expect } from 'vitest';
import { clone } from '../src/clone.ts';
import { createGame } from '../src/game.ts';
import type {
  ActionResult,
  ErrorCode,
  GameEvent,
  GameState,
  Phase,
  PlayerId,
  ResourceBag,
  SeatConfig,
  Sector,
  SectorId,
} from '../src/types.ts';

export function makeGame(
  opts: { players?: 2 | 3 | 4; seed?: number; targetVp?: 6 | 8 | 10 } = {},
): GameState {
  const { players = 3, seed = 1, targetVp = 8 } = opts;
  const seats: SeatConfig[] = Array.from({ length: players }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    isBot: false,
    botLevel: null,
  }));
  return createGame({ seats, targetVp }, seed);
}

export function withSector(state: GameState, id: SectorId, patch: Partial<Sector>): GameState {
  const next = clone(state);
  const sector = next.sectors[id];
  if (!sector) throw new Error(`unknown sector ${id}`);
  next.sectors[id] = { ...sector, ...patch };
  return next;
}

export function withResources(
  state: GameState,
  playerId: PlayerId,
  bag: Partial<ResourceBag>,
): GameState {
  const next = clone(state);
  const player = next.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`unknown player ${playerId}`);
  player.resources = { ...player.resources, ...bag };
  return next;
}

export function atPhase(state: GameState, phase: Phase, currentPlayerId?: PlayerId): GameState {
  const next = clone(state);
  next.phase = phase;
  if (currentPlayerId !== undefined) {
    const index = next.players.findIndex((p) => p.id === currentPlayerId);
    if (index < 0) throw new Error(`unknown player ${currentPlayerId}`);
    next.current = index;
  }
  return next;
}

export function expectOk(result: ActionResult): { state: GameState; events: GameEvent[] } {
  if (!result.ok) throw new Error(`expected ok result, got ${result.error}`);
  return { state: result.state, events: result.events };
}

export function expectErr(result: ActionResult, code: ErrorCode): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBe(code);
}
