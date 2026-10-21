import { describe, expect, it } from 'vitest';
import type { GameState, SectorId } from '@starhold/engine';
import { highlightTargets, intentsFor } from '../src/game/selection.ts';
import {
  homeOf,
  inPhase,
  makeState,
  neighbourIds,
  patchSector,
  viewOf,
  withHand,
} from './mapFixtures.ts';

/** p1 to move in MAIN with everything around p1's home unclaimed except what a test sets up. */
function mainState(): GameState {
  return inPhase(makeState(3, 1), 'MAIN', 0);
}

function nonHome(state: GameState, ids: SectorId[]): SectorId[] {
  return ids.filter((id) => state.sectors[id]?.kind !== 'home');
}

describe('highlightTargets', () => {
  it('selecting own sector with 3 fleets highlights adjacent empty and enemy non-home sectors', () => {
    let state = mainState();
    const home = homeOf(state, 'p1');
    const around = nonHome(state, neighbourIds(state, home));
    const [enemy, empty] = around;
    expect(enemy && empty).toBeTruthy();
    state = patchSector(state, enemy as SectorId, { owner: 'p2', fleets: 2, structure: 'none' });
    const targets = highlightTargets(viewOf(state, 'p1'), 'p1', home);
    expect(targets.has(enemy as SectorId)).toBe(true);
    expect(targets.has(empty as SectorId)).toBe(true);
    for (const id of around) expect(targets.has(id)).toBe(true);
    expect(targets.has(home)).toBe(false);
  });

  it('never highlights an enemy home', () => {
    let state = mainState();
    const enemyHome = homeOf(state, 'p2');
    const [beside] = nonHome(state, neighbourIds(state, enemyHome));
    state = patchSector(state, beside as SectorId, { owner: 'p1', fleets: 3 });
    const targets = highlightTargets(viewOf(state, 'p1'), 'p1', beside as SectorId);
    expect(targets.has(enemyHome)).toBe(false);
    expect(targets.size).toBeGreaterThan(0);
  });

  it('PIRATE phase highlights all non-home sectors except the current pirate', () => {
    const state = inPhase(makeState(3, 1), 'PIRATE', 0);
    const view = viewOf(state, 'p1');
    const expected = view.sectorIds.filter(
      (id) => view.sectors[id]?.kind !== 'home' && id !== view.pirate,
    );
    const targets = highlightTargets(view, 'p1', null);
    expect([...targets].sort()).toEqual([...expected].sort());
    expect(expected.length).toBeGreaterThan(10);
  });

  it('highlights nothing for a selected sector with no outgoing legal moves', () => {
    let state = mainState();
    const home = homeOf(state, 'p1');
    const [spot] = nonHome(state, neighbourIds(state, home));
    state = patchSector(state, spot as SectorId, { owner: 'p1', fleets: 1 });
    expect(highlightTargets(viewOf(state, 'p1'), 'p1', spot as SectorId).size).toBe(0);
  });

  it('highlights nothing without a selection in MAIN, or when it is not my turn', () => {
    const state = mainState();
    const home = homeOf(state, 'p1');
    expect(highlightTargets(viewOf(state, 'p1'), 'p1', null).size).toBe(0);
    expect(highlightTargets(viewOf(state, 'p2'), 'p2', home).size).toBe(0);
  });

  it('includes linked own sectors as fortify targets', () => {
    let state = mainState();
    const home = homeOf(state, 'p1');
    const [own] = nonHome(state, neighbourIds(state, home));
    state = patchSector(state, own as SectorId, { owner: 'p1', fleets: 1 });
    expect(highlightTargets(viewOf(state, 'p1'), 'p1', home).has(own as SectorId)).toBe(true);
  });
});

describe('intentsFor', () => {
  it('returns attack for an enemy target and expand for an empty one', () => {
    let state = mainState();
    const home = homeOf(state, 'p1');
    const [enemy, empty] = nonHome(state, neighbourIds(state, home));
    state = patchSector(state, enemy as SectorId, { owner: 'p2', fleets: 2 });
    const view = viewOf(state, 'p1');
    expect(intentsFor(view, 'p1', home, enemy as SectorId)).toEqual([
      { kind: 'attack', from: home, to: enemy },
    ]);
    expect(intentsFor(view, 'p1', home, empty as SectorId)).toEqual([
      { kind: 'expand', from: home, to: empty },
    ]);
  });

  it('returns fortify between linked own sectors', () => {
    let state = withHand(mainState(), 'p1', 0);
    const home = homeOf(state, 'p1');
    const [own] = nonHome(state, neighbourIds(state, home));
    state = patchSector(state, own as SectorId, { owner: 'p1', fleets: 1 });
    expect(intentsFor(viewOf(state, 'p1'), 'p1', home, own as SectorId)).toEqual([
      { kind: 'fortify', from: home, to: own },
    ]);
  });

  it('returns nothing for an enemy home, an unselected click, or a sector out of reach', () => {
    let state = mainState();
    const enemyHome = homeOf(state, 'p2');
    const [beside] = nonHome(state, neighbourIds(state, enemyHome));
    state = patchSector(state, beside as SectorId, { owner: 'p1', fleets: 3 });
    const view = viewOf(state, 'p1');
    expect(intentsFor(view, 'p1', beside as SectorId, enemyHome)).toEqual([]);
    expect(intentsFor(view, 'p1', null, enemyHome)).toEqual([]);
    const reach = neighbourIds(state, beside as SectorId);
    const far = view.sectorIds.find((id) => id !== beside && !reach.includes(id));
    expect(intentsFor(view, 'p1', beside as SectorId, far as SectorId)).toEqual([]);
  });

  it('returns a build intent when clicking an own sector I can build on', () => {
    let state = withHand(mainState(), 'p1', 5);
    const home = homeOf(state, 'p1');
    const [spot] = nonHome(state, neighbourIds(state, home));
    state = patchSector(state, spot as SectorId, { owner: 'p1', fleets: 1 });
    const view = viewOf(state, 'p1');
    expect(intentsFor(view, 'p1', null, spot as SectorId)).toEqual([{ kind: 'build', at: spot }]);
  });

  it('returns no build intent when I cannot afford anything or the sector is not mine', () => {
    const state = withHand(mainState(), 'p1', 0);
    const home = homeOf(state, 'p1');
    expect(intentsFor(viewOf(state, 'p1'), 'p1', null, home)).toEqual([]);
    const rich = withHand(state, 'p1', 5);
    expect(intentsFor(viewOf(rich, 'p1'), 'p1', null, homeOf(rich, 'p2'))).toEqual([]);
  });

  it('returns a pirate intent for a legal target in the PIRATE phase and nothing for a home', () => {
    const state = inPhase(makeState(3, 1), 'PIRATE', 0);
    const view = viewOf(state, 'p1');
    const target = view.sectorIds.find(
      (id) => view.sectors[id]?.kind !== 'home' && id !== view.pirate,
    );
    expect(intentsFor(view, 'p1', null, target as SectorId)).toEqual([
      { kind: 'pirate', to: target },
    ]);
    expect(intentsFor(view, 'p1', null, homeOf(state, 'p2'))).toEqual([]);
    expect(intentsFor(view, 'p1', null, view.pirate as SectorId)).toEqual([]);
  });

  it('returns nothing when it is not my turn', () => {
    const state = mainState();
    const home = homeOf(state, 'p1');
    const [empty] = nonHome(state, neighbourIds(state, home));
    expect(intentsFor(viewOf(state, 'p2'), 'p2', home, empty as SectorId)).toEqual([]);
  });
});
