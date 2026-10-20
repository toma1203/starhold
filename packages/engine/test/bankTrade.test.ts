import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game.ts';
import { tradeRate } from '../src/rules/trade.ts';
import { playerById } from '../src/state.ts';
import type { Action, GameState, PlayerId, ResourceBag, SectorId } from '../src/types.ts';
import { atPhase, expectErr, expectOk, makeGame, withResources, withSector } from './helpers.ts';

const me = (s: GameState): PlayerId => (s.players[s.current] as { id: PlayerId }).id;
const other = (s: GameState): PlayerId =>
  (s.players[(s.current + 1) % s.players.length] as { id: PlayerId }).id;
const bag = (b: Partial<ResourceBag>): ResourceBag => ({
  metal: 0,
  energy: 0,
  crystal: 0,
  biomass: 0,
  ...b,
});

function mainGame(have: Partial<ResourceBag>): GameState {
  const s = atPhase(makeGame(), 'MAIN');
  return withResources(s, me(s), bag(have));
}

function stationId(s: GameState): SectorId {
  const id = s.sectorIds.find((sid) => s.sectors[sid]?.tradeStation === true);
  if (!id) throw new Error('no trade station');
  return id;
}

/** Gives `owner` the trade station sector. */
function ownStation(s: GameState, owner: PlayerId): GameState {
  return withSector(s, stationId(s), { owner });
}

describe('tradeRate', () => {
  it('is 4 without a trade station and 3 with an owned one', () => {
    const s = mainGame({});
    expect(tradeRate(s, me(s))).toBe(4);
    expect(tradeRate(ownStation(s, me(s)), me(s))).toBe(3);
  });

  it('is unaffected by stations owned by someone else', () => {
    const s = mainGame({});
    expect(tradeRate(ownStation(s, other(s)), me(s))).toBe(4);
  });
});

describe('bankTrade', () => {
  it('trades 4:1 without a trade station and emits bankTraded', () => {
    const s = mainGame({ metal: 5 });
    const { state, events } = expectOk(
      applyAction(s, me(s), { type: 'bankTrade', give: 'metal', get: 'crystal' }),
    );
    expect(playerById(state, me(s)).resources).toEqual(bag({ metal: 1, crystal: 1 }));
    expect(events).toEqual([
      { type: 'bankTraded', player: me(s), give: 'metal', giveCount: 4, get: 'crystal' },
    ]);
  });

  it('trades 3:1 with an owned trade station', () => {
    const base = mainGame({ metal: 5 });
    const s = ownStation(base, me(base));
    const { state, events } = expectOk(
      applyAction(s, me(s), { type: 'bankTrade', give: 'metal', get: 'biomass' }),
    );
    expect(playerById(state, me(s)).resources).toEqual(bag({ metal: 2, biomass: 1 }));
    expect(events[0]).toMatchObject({ type: 'bankTraded', giveCount: 3 });
  });

  it('does not mutate the input state', () => {
    const s = mainGame({ metal: 4 });
    const snapshot = JSON.stringify(s);
    expectOk(applyAction(s, me(s), { type: 'bankTrade', give: 'metal', get: 'energy' }));
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('fails when give equals get', () => {
    const s = mainGame({ metal: 8 });
    expectErr(
      applyAction(s, me(s), { type: 'bankTrade', give: 'metal', get: 'metal' }),
      'err.invalidTrade',
    );
  });

  it('fails for an unknown resource name', () => {
    const s = mainGame({ metal: 8 });
    const bad = { type: 'bankTrade', give: 'toString', get: 'metal' } as unknown as Action;
    expectErr(applyAction(s, me(s), bad), 'err.invalidTrade');
  });

  it('fails without enough cards and leaves state untouched', () => {
    const s = mainGame({ metal: 3 });
    const snapshot = JSON.stringify(s);
    expectErr(
      applyAction(s, me(s), { type: 'bankTrade', give: 'metal', get: 'crystal' }),
      'err.insufficientResources',
    );
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('needs the full 4 when the only station belongs to someone else', () => {
    const base = mainGame({ metal: 3 });
    const s = ownStation(base, other(base));
    expectErr(
      applyAction(s, me(s), { type: 'bankTrade', give: 'metal', get: 'crystal' }),
      'err.insufficientResources',
    );
  });

  it('fails outside MAIN and for a non-current player', () => {
    const s = mainGame({ metal: 8 });
    expectErr(
      applyAction(atPhase(s, 'ROLL'), me(s), { type: 'bankTrade', give: 'metal', get: 'crystal' }),
      'err.wrongPhase',
    );
    expectErr(
      applyAction(s, other(s), { type: 'bankTrade', give: 'metal', get: 'crystal' }),
      'err.notYourTurn',
    );
  });
});
