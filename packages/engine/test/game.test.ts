import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../src/game.ts';
import { currentPlayer, ownedSectors, playerById } from '../src/state.ts';
import type { GameSettings, GameState, SeatConfig } from '../src/types.ts';
import { atPhase, expectErr, makeGame } from './helpers.ts';

const seat = (n: number, id = `p${n}`): SeatConfig => ({
  id,
  name: `P${n}`,
  isBot: false,
  botLevel: null,
});
const settings = (count: number, ids?: string[]): GameSettings => ({
  seats: Array.from({ length: count }, (_, i) => seat(i + 1, ids?.[i])),
  targetVp: 8,
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('createGame', () => {
  it('createGame with 3 seats gives 3 players each owning exactly their home with 3 fleets', () => {
    const state = createGame(settings(3), 7);
    expect(state.players).toHaveLength(3);
    for (const p of state.players) {
      const owned = ownedSectors(state, p.id);
      expect(owned).toHaveLength(1);
      expect(owned[0]?.id).toBe(p.homeId);
      expect(owned[0]).toMatchObject({ structure: 'colony', fleets: 3, owner: p.id });
    }
    expect(new Set(state.players.map((p) => p.homeId)).size).toBe(3);
    expect(state).toMatchObject({
      phase: 'HOME_BONUS',
      current: 0,
      round: 1,
      pirate: null,
      offer: null,
      dice: null,
      winner: null,
      endReason: null,
      conqueredThisTurn: false,
      pendingDiscards: {},
      awards: { largestEmpire: null, warlord: null },
    });
    expect(state.players.map((p) => p.seat)).toEqual([0, 1, 2]);
    expect(currentPlayer(state)).toBe(state.players[0]);
    expect(playerById(state, 'p2').id).toBe('p2');
  });

  it('starting resources are 1 of each', () => {
    for (const p of createGame(settings(4), 3).players) {
      expect(p.resources).toEqual({ metal: 1, energy: 1, crystal: 1, biomass: 1 });
      expect(p.conquests).toBe(0);
    }
  });

  it('turn order is a seeded permutation of seats (stable per seed)', () => {
    const order = (seed: number): string[] =>
      createGame(settings(4), seed).players.map((p) => p.id);
    expect([...order(5)].sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(order(5)).toEqual(order(5));
    const distinct = new Set(Array.from({ length: 30 }, (_, i) => order(i + 1).join()));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('rejects 1 or 5 seats and duplicate ids', () => {
    expect(() => createGame(settings(1), 1)).toThrow('invalid seat count');
    expect(() => createGame(settings(5), 1)).toThrow('invalid seat count');
    expect(() => createGame(settings(3, ['a', 'b', 'a']), 1)).toThrow('invalid seat count');
  });
});

describe('applyAction', () => {
  it('applyAction on FINISHED returns err.gameOver', () => {
    const state = atPhase(makeGame(), 'FINISHED');
    expectErr(applyAction(state, 'p1', { type: 'endTurn' }), 'err.gameOver');
  });

  it('returns err.wrongPhase for actions without a handler', () => {
    expectErr(applyAction(makeGame(), 'p1', { type: 'roll' }), 'err.wrongPhase');
  });

  it('applyAction does not mutate input', () => {
    const state: GameState = deepFreeze(makeGame());
    const before = JSON.stringify(state);
    expect(() => applyAction(state, 'p1', { type: 'endTurn' })).not.toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });
});
