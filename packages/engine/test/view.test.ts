import { describe, expect, it } from 'vitest';
import { filterEventsFor, viewFor } from '../src/view.ts';
import type { GameEvent } from '../src/types.ts';
import { makeGame, withResources } from './helpers.ts';

describe('viewFor', () => {
  const state = withResources(makeGame(), 'p2', { metal: 4, energy: 2 });

  it("viewFor hides other players' resources but keeps cardCount", () => {
    const view = viewFor(state, 'p1');
    expect(view.me).toBe('p1');
    const mine = view.players.find((p) => p.id === 'p1');
    const other = view.players.find((p) => p.id === 'p2');
    expect(mine?.resources).toEqual({ metal: 1, energy: 1, crystal: 1, biomass: 1 });
    expect(mine?.cardCount).toBe(4);
    expect(other?.resources).toBeNull();
    expect(other?.cardCount).toBe(4 + 3 + 1);
  });

  it('viewFor(null) hides all', () => {
    const view = viewFor(state, null);
    expect(view.me).toBeNull();
    expect(view.players.every((p) => p.resources === null)).toBe(true);
    expect(view.players.every((p) => p.cardCount > 0)).toBe(true);
  });

  it('view has no rng key', () => {
    expect('rng' in viewFor(state, 'p1')).toBe(false);
    expect('rng' in viewFor(state, null)).toBe(false);
  });

  it('does not alias the source state', () => {
    const id = state.sectorIds[0] ?? '';
    const view = viewFor(state, 'p1');
    const sector = view.sectors[id];
    if (sector) sector.fleets = 99;
    expect(state.sectors[id]?.fleets).not.toBe(99);
  });
});

describe('filterEventsFor', () => {
  const stolen: GameEvent = { type: 'stolen', thief: 'p1', victim: 'p2', resource: 'metal' };
  const other: GameEvent = { type: 'tradeCancelled' };

  it('hides stolen resource from bystanders but not thief/victim', () => {
    expect(filterEventsFor([stolen, other], 'p3')).toEqual([{ ...stolen, resource: null }, other]);
    expect(filterEventsFor([stolen], null)).toEqual([{ ...stolen, resource: null }]);
    expect(filterEventsFor([stolen], 'p1')).toEqual([stolen]);
    expect(filterEventsFor([stolen], 'p2')).toEqual([stolen]);
  });

  it('does not mutate input events', () => {
    const events = [stolen];
    filterEventsFor(events, 'p3');
    expect(stolen.resource).toBe('metal');
  });
});
