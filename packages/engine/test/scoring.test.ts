import { describe, expect, it } from 'vitest';
import { clone } from '../src/clone.ts';
import { applyAction } from '../src/game.ts';
import { hexId, neighbors } from '../src/hex.ts';
import { ranking, sectorCount, updateAwards, victoryPoints } from '../src/scoring.ts';
import type { GameState, PlayerId, SectorId, Structure } from '../src/types.ts';
import { viewFor } from '../src/view.ts';
import {
  atPhase,
  expectErr,
  expectOk,
  makeGame,
  seedForDice,
  withResources,
  withSector,
} from './helpers.ts';

const idOf = (s: GameState, seat: number): PlayerId => (s.players[seat] as { id: PlayerId }).id;
const homeOf = (s: GameState, seat: number): SectorId =>
  (s.players[seat] as { homeId: SectorId }).homeId;

/** Gives `owner` the first `count` unowned resource sectors. */
function grant(
  state: GameState,
  owner: PlayerId,
  count: number,
  structure: Structure = 'none',
  fleets = 1,
): GameState {
  let next = state;
  let left = count;
  for (const id of state.sectorIds) {
    const sector = state.sectors[id];
    if (left === 0) break;
    if (!sector || sector.kind !== 'resource' || sector.owner !== null) continue;
    next = withSector(next, id, { owner, structure, fleets });
    left -= 1;
  }
  if (left > 0) throw new Error('not enough free sectors');
  return next;
}

/** Takes one claimed resource sector away from `owner`. */
function dropOne(state: GameState, owner: PlayerId): GameState {
  const id = state.sectorIds.find(
    (sid) => state.sectors[sid]?.owner === owner && state.sectors[sid]?.kind === 'resource',
  );
  if (!id) throw new Error('nothing to drop');
  return withSector(state, id, { owner: null });
}

function setConquests(state: GameState, seat: number, conquests: number): GameState {
  const next = clone(state);
  (next.players[seat] as { conquests: number }).conquests = conquests;
  return next;
}

describe('victory points', () => {
  it('fresh game: everyone has 1 VP', () => {
    const state = makeGame({ players: 4 });
    for (const p of state.players) {
      expect(victoryPoints(state, p.id)).toBe(1);
      expect(sectorCount(state, p.id)).toBe(1);
    }
  });

  it('starbase counts 2 (home counts as its structure), colonies 1, claimed 0', () => {
    const base = makeGame();
    const a = idOf(base, 0);
    let state = withSector(base, homeOf(base, 0), { structure: 'starbase' });
    expect(victoryPoints(state, a)).toBe(2);
    state = grant(state, a, 2, 'colony');
    state = grant(state, a, 3, 'none');
    expect(victoryPoints(state, a)).toBe(4);
    expect(sectorCount(state, a)).toBe(6);
  });

  it('each award held adds 2 VP', () => {
    const state = clone(makeGame());
    const a = idOf(state, 0);
    state.awards = { largestEmpire: a, warlord: a };
    expect(victoryPoints(state, a)).toBe(5);
  });

  it('reads a player view as well as the full state', () => {
    const base = makeGame();
    const a = idOf(base, 0);
    const state = grant(base, a, 2, 'colony');
    const view = viewFor(state, null);
    expect(victoryPoints(view, a)).toBe(3);
    expect(sectorCount(view, a)).toBe(3);
  });
});

describe('largest empire', () => {
  it('goes to the first unique leader with 5 sectors', () => {
    const base = makeGame();
    const a = idOf(base, 0);
    const four = updateAwards(grant(base, a, 3));
    expect(four.state.awards.largestEmpire).toBeNull();
    expect(four.events).toEqual([]);
    const five = grant(base, a, 4);
    const { state, events } = updateAwards(five);
    expect(state.awards.largestEmpire).toBe(a);
    expect(events).toEqual([{ type: 'awardChanged', award: 'largestEmpire', player: a }]);
    expect(victoryPoints(state, a)).toBe(1 + 2);
    expect(five.awards.largestEmpire).toBeNull(); // input untouched
  });

  it('a tie at the top with no holder gives nobody the award', () => {
    const base = makeGame();
    const state = grant(grant(base, idOf(base, 0), 4), idOf(base, 1), 4);
    const result = updateAwards(state);
    expect(result.state.awards.largestEmpire).toBeNull();
    expect(result.events).toEqual([]);
  });

  it('tie does not take the award from holder', () => {
    const base = makeGame();
    const [a, b] = [idOf(base, 0), idOf(base, 1)];
    const held = updateAwards(grant(base, a, 4)).state;
    const { state, events } = updateAwards(grant(held, b, 4));
    expect(state.awards.largestEmpire).toBe(a);
    expect(events).toEqual([]);
  });

  it('strictly more takes it', () => {
    const base = makeGame();
    const [a, b] = [idOf(base, 0), idOf(base, 1)];
    const held = updateAwards(grant(base, a, 4)).state;
    const { state, events } = updateAwards(grant(held, b, 5));
    expect(state.awards.largestEmpire).toBe(b);
    expect(events).toEqual([{ type: 'awardChanged', award: 'largestEmpire', player: b }]);
  });

  it('holder dropping below 5 loses it', () => {
    const base = makeGame();
    const a = idOf(base, 0);
    const held = updateAwards(grant(base, a, 4)).state;
    const { state, events } = updateAwards(dropOne(held, a));
    expect(state.awards.largestEmpire).toBeNull();
    expect(events).toEqual([{ type: 'awardChanged', award: 'largestEmpire', player: null }]);
  });

  it('holder dropping below 5 hands it to a unique leader with 5', () => {
    const base = makeGame();
    const [a, b] = [idOf(base, 0), idOf(base, 1)];
    const held = updateAwards(grant(base, a, 4)).state;
    const { state, events } = updateAwards(grant(dropOne(held, a), b, 4));
    expect(state.awards.largestEmpire).toBe(b);
    expect(events).toEqual([{ type: 'awardChanged', award: 'largestEmpire', player: b }]);
  });
});

describe('warlord', () => {
  it('awarded at 3 conquests, not before', () => {
    const base = makeGame();
    const a = idOf(base, 0);
    expect(updateAwards(setConquests(base, 0, 2)).state.awards.warlord).toBeNull();
    const { state, events } = updateAwards(setConquests(base, 0, 3));
    expect(state.awards.warlord).toBe(a);
    expect(events).toEqual([{ type: 'awardChanged', award: 'warlord', player: a }]);
  });

  it('transfers on strictly more conquests, not on a tie', () => {
    const base = makeGame();
    const [a, b] = [idOf(base, 0), idOf(base, 1)];
    const held = updateAwards(setConquests(base, 0, 3)).state;
    const tied = updateAwards(setConquests(held, 1, 3));
    expect(tied.state.awards.warlord).toBe(a);
    expect(tied.events).toEqual([]);
    const more = updateAwards(setConquests(held, 1, 4));
    expect(more.state.awards.warlord).toBe(b);
    expect(more.events).toEqual([{ type: 'awardChanged', award: 'warlord', player: b }]);
  });
});

describe('ranking', () => {
  it('orders by VP, then sectors, then fleets, then lower seat', () => {
    const base = makeGame({ players: 4 });
    const [p0, p1, p2, p3] = [0, 1, 2, 3].map((i) => idOf(base, i)) as [
      PlayerId,
      PlayerId,
      PlayerId,
      PlayerId,
    ];
    expect(ranking(base)).toEqual([p0, p1, p2, p3]); // everything equal: seat order
    // more total fleets wins the third tiebreak
    let state = withSector(base, homeOf(base, 3), { fleets: 9 });
    expect(ranking(state)).toEqual([p3, p0, p1, p2]);
    // more sectors beats more fleets at equal VP
    state = grant(state, p2, 1, 'none', 1);
    expect(ranking(state)).toEqual([p2, p3, p0, p1]);
    // more VP beats more sectors
    state = grant(state, p1, 1, 'colony', 1);
    expect(ranking(state)).toEqual([p1, p2, p3, p0]);
  });
});

describe('victory', () => {
  it('reaching target on own action finishes with winner', () => {
    const base = makeGame({ targetVp: 6 });
    const a = idOf(base, 0);
    let state = atPhase(base, 'MAIN', a);
    state = grant(state, a, 4, 'colony'); // home + 4 colonies = 5 VP
    state = grant(state, a, 1, 'none');
    state = withResources(state, a, { metal: 1, energy: 1, crystal: 1, biomass: 1 });
    expect(victoryPoints(state, a)).toBe(5);
    const claimed = state.sectorIds.find(
      (id) => state.sectors[id]?.owner === a && state.sectors[id]?.structure === 'none',
    ) as SectorId;
    const { state: next, events } = expectOk(
      applyAction(state, a, { type: 'buildColony', at: claimed }),
    );
    expect(next.phase).toBe('FINISHED');
    expect(next.winner).toBe(a);
    expect(next.endReason).toBe('target');
    expect(events.at(-1)).toEqual({ type: 'gameOver', winner: a, reason: 'target' });
    expect(state.phase).toBe('MAIN'); // input untouched
  });

  it('every successful action updates awards, appending awardChanged after its own events', () => {
    const base = makeGame();
    const a = idOf(base, 0);
    let state = atPhase(base, 'MAIN', a);
    state = grant(state, a, 4, 'none'); // home + 4 = 5 sectors, award not yet assigned
    state = withResources(state, a, { metal: 1 });
    const home = homeOf(state, 0);
    const { state: next, events } = expectOk(
      applyAction(state, a, { type: 'buildFleet', at: home }),
    );
    expect(next.awards.largestEmpire).toBe(a);
    expect(events).toEqual([
      { type: 'built', player: a, what: 'fleet', at: home },
      { type: 'awardChanged', award: 'largestEmpire', player: a },
    ]);
  });

  it('non-current player reaching target via award wins at start of their turn', () => {
    const base = makeGame({ targetVp: 6 });
    const [a, b, c] = [0, 1, 2].map((i) => idOf(base, i)) as [PlayerId, PlayerId, PlayerId];
    let state = atPhase(base, 'MAIN', a);
    state = grant(state, b, 3, 'colony'); // b: home + 3 colonies + 1 claimed = 5 sectors, 4 VP
    state = grant(state, b, 1, 'none');
    state = grant(state, c, 4, 'none'); // c: 5 sectors, holds Largest Empire (tie keeps it)
    state.awards = { largestEmpire: c, warlord: null };
    // a attacks a single-fleet sector of c from a free neighbour; c drops to 4 and b inherits.
    let from: SectorId | null = null;
    let to: SectorId | null = null;
    for (const id of state.sectorIds) {
      const sector = state.sectors[id];
      if (!sector || sector.owner !== c || sector.kind !== 'resource') continue;
      const free = neighbors(sector.hex)
        .map(hexId)
        .find((n) => {
          const m = state.sectors[n];
          return m !== undefined && m.kind === 'resource' && m.owner === null;
        });
      if (free) {
        from = free;
        to = id;
        break;
      }
    }
    if (!from || !to) throw new Error('no attack geometry');
    state = withSector(state, from, { owner: a, fleets: 3, structure: 'none' });
    state.rng = seedForDice([6], [1]);
    const attacked = expectOk(applyAction(state, a, { type: 'attack', from, to, dice: 1 }));
    expect(attacked.state.phase).toBe('MAIN');
    expect(attacked.state.awards.largestEmpire).toBe(b);
    expect(victoryPoints(attacked.state, b)).toBe(6);
    const ended = expectOk(applyAction(attacked.state, a, { type: 'endTurn' }));
    expect(ended.state.phase).toBe('FINISHED');
    expect(ended.state.winner).toBe(b);
    expect(ended.state.endReason).toBe('target');
    expect(ended.events).toEqual([{ type: 'gameOver', winner: b, reason: 'target' }]);
  });

  it('round 61 ends game with roundLimit and ranking tiebreaks', () => {
    const base = makeGame({ players: 3 });
    const [a, b, c] = [0, 1, 2].map((i) => idOf(base, i)) as [PlayerId, PlayerId, PlayerId];
    // everybody on 1 VP and 1 sector; b has the most fleets, a and c tie so lower seat a is next
    let state = atPhase(base, 'MAIN', c);
    state = withSector(state, homeOf(state, 1), { fleets: 5 });
    state.round = 60;
    expect(ranking(state)).toEqual([b, a, c]);
    const { state: next, events } = expectOk(applyAction(state, c, { type: 'endTurn' }));
    expect(next.round).toBe(61);
    expect(next.phase).toBe('FINISHED');
    expect(next.winner).toBe(b);
    expect(next.endReason).toBe('roundLimit');
    expect(events).toEqual([{ type: 'gameOver', winner: b, reason: 'roundLimit' }]);
  });

  it('round 60 is still playable', () => {
    const base = makeGame({ players: 3 });
    const state = atPhase(base, 'MAIN', idOf(base, 1));
    state.round = 60;
    const { state: next } = expectOk(applyAction(state, idOf(base, 1), { type: 'endTurn' }));
    expect(next.phase).toBe('HOME_BONUS');
    expect(next.round).toBe(60);
  });

  it('actions after FINISHED → err.gameOver', () => {
    const base = makeGame({ players: 3 });
    const state = atPhase(base, 'MAIN', idOf(base, 2));
    state.round = 60;
    const { state: done } = expectOk(applyAction(state, idOf(base, 2), { type: 'endTurn' }));
    expect(done.phase).toBe('FINISHED');
    expectErr(applyAction(done, idOf(base, 0), { type: 'roll' }), 'err.gameOver');
    expectErr(applyAction(done, idOf(base, 0), { type: 'endTurn' }), 'err.gameOver');
  });
});
