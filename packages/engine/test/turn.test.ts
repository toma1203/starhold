import { describe, expect, it } from 'vitest';
import { clone } from '../src/clone.ts';
import { applyAction } from '../src/game.ts';
import { rollDie } from '../src/rng.ts';
import { productionFor } from '../src/rules/roll.ts';
import { currentPlayer, playerById } from '../src/state.ts';
import type { GameState, PlayerId, SectorId } from '../src/types.ts';
import {
  atPhase,
  expectErr,
  expectOk,
  makeGame,
  seedForSum,
  withResources,
  withSector,
} from './helpers.ts';

const cur = (s: GameState): PlayerId => currentPlayer(s).id;
const seatId = (s: GameState, i: number): PlayerId => (s.players[i] as { id: PlayerId }).id;
const rollState = (sum: number): GameState => ({
  ...atPhase(makeGame(), 'ROLL'),
  rng: seedForSum(sum),
});

/** Gives the first three resource sectors the number `n` and no owner. */
function withNumberedSectors(state: GameState, n: number): { state: GameState; ids: SectorId[] } {
  const ids = state.sectorIds.filter((id) => state.sectors[id]?.kind === 'resource').slice(0, 3);
  let next = state;
  for (const id of ids) next = withSector(next, id, { number: n, owner: null, structure: 'none' });
  return { state: next, ids };
}

describe('home bonus', () => {
  it('chooseHomeBonus adds one resource and moves to ROLL', () => {
    const state = makeGame();
    const id = cur(state);
    const { state: next, events } = expectOk(
      applyAction(state, id, { type: 'chooseHomeBonus', resource: 'crystal' }),
    );
    expect(next.phase).toBe('ROLL');
    expect(playerById(next, id).resources).toEqual({
      metal: 1,
      energy: 1,
      crystal: 2,
      biomass: 1,
    });
    expect(events).toEqual([{ type: 'homeBonus', player: id, resource: 'crystal' }]);
  });

  it('chooseHomeBonus by non-current player → err.notYourTurn', () => {
    const state = makeGame();
    expectErr(
      applyAction(state, seatId(state, 1), { type: 'chooseHomeBonus', resource: 'metal' }),
      'err.notYourTurn',
    );
  });

  it('chooseHomeBonus outside HOME_BONUS → err.wrongPhase', () => {
    const state = atPhase(makeGame(), 'ROLL');
    expectErr(
      applyAction(state, cur(state), { type: 'chooseHomeBonus', resource: 'metal' }),
      'err.wrongPhase',
    );
  });
});

describe('roll', () => {
  it('roll in HOME_BONUS → err.wrongPhase', () => {
    const state = makeGame();
    expectErr(applyAction(state, cur(state), { type: 'roll' }), 'err.wrongPhase');
  });

  it('roll by non-current player → err.notYourTurn', () => {
    const state = atPhase(makeGame(), 'ROLL');
    expectErr(applyAction(state, seatId(state, 1), { type: 'roll' }), 'err.notYourTurn');
  });

  it('roll is deterministic per rng state', () => {
    const state = { ...atPhase(makeGame(), 'ROLL'), rng: 12345 };
    const a = expectOk(applyAction(state, cur(state), { type: 'roll' }));
    const b = expectOk(applyAction(clone(state), cur(state), { type: 'roll' }));
    expect(a).toEqual(b);
    const [d1, r1] = rollDie(12345);
    const [d2, r2] = rollDie(r1);
    expect(a.state.dice).toEqual([d1, d2]);
    expect(a.state.rng).toBe(r2);
    expect(a.events[0]).toEqual({ type: 'diceRolled', player: cur(state), dice: [d1, d2] });
  });

  it('non-7 roll goes to MAIN and pays production', () => {
    const { state, ids } = withNumberedSectors(rollState(6), 6);
    const id = cur(state);
    const sectorId = ids[0] as string;
    const s = withSector(state, sectorId, { owner: id, structure: 'none', fleets: 1 });
    const resource = s.sectors[sectorId]?.resource as 'metal';
    const before = playerById(s, id).resources[resource];
    const { state: next } = expectOk(applyAction(s, id, { type: 'roll' }));
    expect(next.phase).toBe('MAIN');
    expect(playerById(next, id).resources[resource]).toBe(before + 1);
  });

  it('roll of 7 hands over to the pirates without producing', () => {
    const { state } = withNumberedSectors(rollState(7), 7);
    const { state: next, events } = expectOk(applyAction(state, cur(state), { type: 'roll' }));
    expect(next.phase).toBe('PIRATE'); // nobody holds more than 7 cards at the start
    expect((next.dice?.[0] ?? 0) + (next.dice?.[1] ?? 0)).toBe(7);
    expect(events.map((e) => e.type)).toEqual(['diceRolled']);
    expect(next.players).toEqual(state.players);
  });
});

describe('production', () => {
  it('production pays 1 for claimed, 2 for colony, 2 for starbase', () => {
    const { state, ids } = withNumberedSectors(rollState(8), 8);
    const [a, b, c] = ids as [string, string, string];
    const pid = cur(state);
    let s = withSector(state, a, { owner: pid, structure: 'none', fleets: 1 });
    s = withSector(s, b, { owner: pid, structure: 'colony', fleets: 1 });
    s = withSector(s, c, { owner: pid, structure: 'starbase', fleets: 1 });
    const expected = { metal: 0, energy: 0, crystal: 0, biomass: 0 };
    for (const [id, n] of [
      [a, 1],
      [b, 2],
      [c, 2],
    ] as const) {
      const r = s.sectors[id]?.resource;
      if (r) expected[r] += n;
    }
    expect(productionFor(s, 8)[pid]).toEqual(expected);
    expect(Object.values(expected).reduce((x, y) => x + y, 0)).toBe(5);
  });

  it('production pays exactly 1, 2 and 2 in isolation', () => {
    const { state, ids } = withNumberedSectors(rollState(8), 8);
    const pid = cur(state);
    const sum = (id: string, structure: 'none' | 'colony' | 'starbase'): number => {
      const s = withSector(state, id, { owner: pid, structure, fleets: 1 });
      return Object.values(productionFor(s, 8)[pid] ?? {}).reduce((x, y) => x + y, 0);
    };
    expect(sum(ids[0] as string, 'none')).toBe(1);
    expect(sum(ids[1] as string, 'colony')).toBe(2);
    expect(sum(ids[2] as string, 'starbase')).toBe(2);
  });

  it('sector under pirate does not produce', () => {
    const { state, ids } = withNumberedSectors(rollState(8), 8);
    const pid = cur(state);
    const id = ids[0] as string;
    const s = { ...withSector(state, id, { owner: pid, structure: 'colony' }), pirate: id };
    expect(productionFor(s, 8)).toEqual({});
    const { events } = expectOk(applyAction(s, pid, { type: 'roll' }));
    expect(events.map((e) => e.type)).toEqual(['diceRolled']);
  });

  it('unowned sectors produce nothing', () => {
    const { state } = withNumberedSectors(rollState(8), 8);
    expect(productionFor(state, 8)).toEqual({});
    const { events } = expectOk(applyAction(state, cur(state), { type: 'roll' }));
    expect(events.some((e) => e.type === 'produced')).toBe(false);
  });

  it('produced event lists only players who gained', () => {
    const { state, ids } = withNumberedSectors(rollState(9), 9);
    const [p0, p1, p2] = [seatId(state, 0), seatId(state, 1), seatId(state, 2)];
    const s = withSector(
      withSector(state, ids[0] as string, { owner: p0, structure: 'colony' }),
      ids[1] as string,
      { owner: p1, structure: 'none' },
    );
    const { events } = expectOk(applyAction(s, p0, { type: 'roll' }));
    expect(events.map((e) => e.type)).toEqual(['diceRolled', 'produced']);
    const produced = events[1];
    if (produced?.type !== 'produced') throw new Error('expected produced');
    expect(Object.keys(produced.gains).sort()).toEqual([p0, p1].sort());
    expect(produced.gains[p2]).toBeUndefined();
  });

  it('production adds to existing resources', () => {
    const { state, ids } = withNumberedSectors(rollState(5), 5);
    const pid = cur(state);
    const id = ids[0] as string;
    const resource = state.sectors[id]?.resource as 'metal';
    let s = withSector(state, id, { owner: pid, structure: 'colony' });
    s = withResources(s, pid, { [resource]: 4 });
    const { state: next } = expectOk(applyAction(s, pid, { type: 'roll' }));
    expect(playerById(next, pid).resources[resource]).toBe(6);
  });
});

describe('endTurn', () => {
  it('endTurn passes to next player in HOME_BONUS and emits turnStarted', () => {
    const state = atPhase(makeGame(), 'MAIN');
    const { state: next, events } = expectOk(applyAction(state, cur(state), { type: 'endTurn' }));
    expect(next.current).toBe(1);
    expect(next.phase).toBe('HOME_BONUS');
    expect(events).toEqual([{ type: 'turnStarted', player: cur(next), round: 1 }]);
  });

  it('endTurn clears dice, conquest flag and open offer', () => {
    const base = atPhase(makeGame(), 'MAIN');
    const state: GameState = {
      ...base,
      dice: [3, 4],
      conqueredThisTurn: true,
      offer: {
        from: cur(base),
        give: { metal: 1, energy: 0, crystal: 0, biomass: 0 },
        want: { metal: 0, energy: 1, crystal: 0, biomass: 0 },
        accepted: [],
        declined: [],
      },
    };
    const { state: next } = expectOk(applyAction(state, cur(state), { type: 'endTurn' }));
    expect(next).toMatchObject({ dice: null, conqueredThisTurn: false, offer: null });
  });

  it('round increments after last seat', () => {
    let state = atPhase(makeGame({ players: 3 }), 'MAIN');
    for (let i = 0; i < 2; i++) {
      state = atPhase(expectOk(applyAction(state, cur(state), { type: 'endTurn' })).state, 'MAIN');
      expect(state.round).toBe(1);
    }
    const { state: next, events } = expectOk(applyAction(state, cur(state), { type: 'endTurn' }));
    expect(next.current).toBe(0);
    expect(next.round).toBe(2);
    expect(events).toEqual([{ type: 'turnStarted', player: cur(next), round: 2 }]);
  });

  it('endTurn outside MAIN → err.wrongPhase; by non-current → err.notYourTurn', () => {
    const state = makeGame();
    expectErr(applyAction(state, cur(state), { type: 'endTurn' }), 'err.wrongPhase');
    const main = atPhase(state, 'MAIN');
    expectErr(applyAction(main, seatId(state, 1), { type: 'endTurn' }), 'err.notYourTurn');
  });
});
