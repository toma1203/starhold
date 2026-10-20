import { describe, expect, it } from 'vitest';
import { COSTS, subBag } from '../src/costs.ts';
import { applyAction } from '../src/game.ts';
import { playerById } from '../src/state.ts';
import type { GameState, PlayerId, ResourceBag, SectorId } from '../src/types.ts';
import { atPhase, expectErr, expectOk, makeGame, withResources, withSector } from './helpers.ts';

const rich: ResourceBag = { metal: 5, energy: 5, crystal: 5, biomass: 5 };
const poor: ResourceBag = { metal: 0, energy: 0, crystal: 0, biomass: 0 };

const me = (s: GameState): PlayerId => (s.players[s.current] as { id: PlayerId }).id;
const other = (s: GameState): PlayerId =>
  (s.players[(s.current + 1) % s.players.length] as { id: PlayerId }).id;

/** Main-phase game where the current player is rich. */
function mainGame(): GameState {
  const s = atPhase(makeGame(), 'MAIN');
  return withResources(s, me(s), rich);
}

function homeOf(s: GameState, id: PlayerId): SectorId {
  return playerById(s, id).homeId;
}

/** A resource sector nobody owns. */
function freeSector(s: GameState): SectorId {
  const id = s.sectorIds.find((sid) => {
    const sector = s.sectors[sid];
    return sector?.kind === 'resource' && sector.owner === null;
  });
  if (!id) throw new Error('no free sector');
  return id;
}

/** A resource sector owned by the current player with the given structure. */
function claimed(s: GameState, structure: 'none' | 'colony' | 'starbase'): [GameState, SectorId] {
  const id = freeSector(s);
  return [withSector(s, id, { owner: me(s), structure, fleets: 1 }), id];
}

describe('buildFleet', () => {
  it('pays the fleet cost and adds one fleet, emitting built', () => {
    const [s, id] = claimed(mainGame(), 'none');
    const { state, events } = expectOk(applyAction(s, me(s), { type: 'buildFleet', at: id }));
    expect(state.sectors[id]?.fleets).toBe(2);
    expect(playerById(state, me(s)).resources).toEqual(subBag(rich, COSTS.fleet));
    expect(events).toEqual([{ type: 'built', player: me(s), what: 'fleet', at: id }]);
  });

  it('works on the home sector', () => {
    const s = mainGame();
    const home = homeOf(s, me(s));
    const before = s.sectors[home]?.fleets ?? 0;
    const { state } = expectOk(applyAction(s, me(s), { type: 'buildFleet', at: home }));
    expect(state.sectors[home]?.fleets).toBe(before + 1);
  });

  it('does not mutate the input state', () => {
    const [s, id] = claimed(mainGame(), 'none');
    const snapshot = JSON.stringify(s);
    expectOk(applyAction(s, me(s), { type: 'buildFleet', at: id }));
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('fails with insufficient resources and leaves state untouched', () => {
    const [s0, id] = claimed(mainGame(), 'none');
    const s = withResources(s0, me(s0), poor);
    const snapshot = JSON.stringify(s);
    expectErr(applyAction(s, me(s), { type: 'buildFleet', at: id }), 'err.insufficientResources');
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('fails on enemy and unowned sectors', () => {
    const s = mainGame();
    expectErr(
      applyAction(s, me(s), { type: 'buildFleet', at: homeOf(s, other(s)) }),
      'err.notOwned',
    );
    expectErr(applyAction(s, me(s), { type: 'buildFleet', at: freeSector(s) }), 'err.notOwned');
  });

  it('fails on an unknown sector id, including prototype keys', () => {
    const s = mainGame();
    expectErr(applyAction(s, me(s), { type: 'buildFleet', at: 'nope' }), 'err.invalidSector');
    expectErr(
      applyAction(s, me(s), { type: 'buildFleet', at: 'constructor' }),
      'err.invalidSector',
    );
    expectErr(applyAction(s, me(s), { type: 'buildFleet', at: '__proto__' }), 'err.invalidSector');
  });

  it('fails outside MAIN and for a non-current player', () => {
    const [s, id] = claimed(mainGame(), 'none');
    for (const phase of ['HOME_BONUS', 'ROLL', 'DISCARD', 'PIRATE'] as const) {
      expectErr(
        applyAction(atPhase(s, phase), me(s), { type: 'buildFleet', at: id }),
        'err.wrongPhase',
      );
    }
    expectErr(applyAction(s, other(s), { type: 'buildFleet', at: id }), 'err.notYourTurn');
  });
});

describe('buildColony', () => {
  it('pays the colony cost and upgrades a claimed sector, emitting built', () => {
    const [s, id] = claimed(mainGame(), 'none');
    const { state, events } = expectOk(applyAction(s, me(s), { type: 'buildColony', at: id }));
    expect(state.sectors[id]?.structure).toBe('colony');
    expect(playerById(state, me(s)).resources).toEqual(subBag(rich, COSTS.colony));
    expect(events).toEqual([{ type: 'built', player: me(s), what: 'colony', at: id }]);
  });

  it('fails with insufficient resources and leaves state untouched', () => {
    const [s0, id] = claimed(mainGame(), 'none');
    const s = withResources(s0, me(s0), { ...poor, metal: 1, energy: 1, crystal: 1 });
    const snapshot = JSON.stringify(s);
    expectErr(applyAction(s, me(s), { type: 'buildColony', at: id }), 'err.insufficientResources');
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('fails on enemy and unowned sectors', () => {
    const s = mainGame();
    expectErr(
      applyAction(s, me(s), { type: 'buildColony', at: homeOf(s, other(s)) }),
      'err.notOwned',
    );
    expectErr(applyAction(s, me(s), { type: 'buildColony', at: freeSector(s) }), 'err.notOwned');
  });

  it('fails on the home sector and on an existing colony or starbase', () => {
    const s = mainGame();
    expectErr(
      applyAction(s, me(s), { type: 'buildColony', at: homeOf(s, me(s)) }),
      'err.invalidSector',
    );
    const [c, cid] = claimed(s, 'colony');
    expectErr(applyAction(c, me(c), { type: 'buildColony', at: cid }), 'err.invalidSector');
    const [b, bid] = claimed(s, 'starbase');
    expectErr(applyAction(b, me(b), { type: 'buildColony', at: bid }), 'err.invalidSector');
  });

  it('fails on an unknown sector id', () => {
    const s = mainGame();
    expectErr(applyAction(s, me(s), { type: 'buildColony', at: 'nope' }), 'err.invalidSector');
  });

  it('fails outside MAIN', () => {
    const [s, id] = claimed(mainGame(), 'none');
    expectErr(
      applyAction(atPhase(s, 'ROLL'), me(s), { type: 'buildColony', at: id }),
      'err.wrongPhase',
    );
  });
});

describe('buildStarbase', () => {
  it('pays the starbase cost and upgrades a colony, emitting built', () => {
    const [s, id] = claimed(mainGame(), 'colony');
    const { state, events } = expectOk(applyAction(s, me(s), { type: 'buildStarbase', at: id }));
    expect(state.sectors[id]?.structure).toBe('starbase');
    expect(playerById(state, me(s)).resources).toEqual(subBag(rich, COSTS.starbase));
    expect(events).toEqual([{ type: 'built', player: me(s), what: 'starbase', at: id }]);
  });

  it('is allowed on the home colony', () => {
    const s = mainGame();
    const home = homeOf(s, me(s));
    const { state } = expectOk(applyAction(s, me(s), { type: 'buildStarbase', at: home }));
    expect(state.sectors[home]?.structure).toBe('starbase');
  });

  it('fails with insufficient resources and leaves state untouched', () => {
    const [s0, id] = claimed(mainGame(), 'colony');
    const s = withResources(s0, me(s0), { ...poor, metal: 2, crystal: 2 });
    const snapshot = JSON.stringify(s);
    expectErr(
      applyAction(s, me(s), { type: 'buildStarbase', at: id }),
      'err.insufficientResources',
    );
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('fails on enemy and unowned sectors', () => {
    const s = mainGame();
    expectErr(
      applyAction(s, me(s), { type: 'buildStarbase', at: homeOf(s, other(s)) }),
      'err.notOwned',
    );
    expectErr(applyAction(s, me(s), { type: 'buildStarbase', at: freeSector(s) }), 'err.notOwned');
  });

  it('fails on a merely claimed sector and on an existing starbase', () => {
    const [c, cid] = claimed(mainGame(), 'none');
    expectErr(applyAction(c, me(c), { type: 'buildStarbase', at: cid }), 'err.invalidSector');
    const [b, bid] = claimed(mainGame(), 'starbase');
    expectErr(applyAction(b, me(b), { type: 'buildStarbase', at: bid }), 'err.invalidSector');
  });

  it('fails on an unknown sector id', () => {
    const s = mainGame();
    expectErr(applyAction(s, me(s), { type: 'buildStarbase', at: 'nope' }), 'err.invalidSector');
  });

  it('fails outside MAIN', () => {
    const [s, id] = claimed(mainGame(), 'colony');
    expectErr(
      applyAction(atPhase(s, 'PIRATE'), me(s), { type: 'buildStarbase', at: id }),
      'err.wrongPhase',
    );
  });
});
