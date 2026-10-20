import { describe, expect, it } from 'vitest';
import { bagTotal } from '../src/costs.ts';
import { applyAction } from '../src/game.ts';
import { beginPirates, randomDiscard, stealRandom } from '../src/rules/pirates.ts';
import { currentPlayer, playerById } from '../src/state.ts';
import type { GameState, PlayerId, ResourceBag, SectorId } from '../src/types.ts';
import {
  atPhase,
  expectErr,
  expectOk,
  makeGame,
  seedForSum,
  withResources,
  withSector,
} from './helpers.ts';

const bag = (b: Partial<ResourceBag> = {}): ResourceBag => ({
  metal: 0,
  energy: 0,
  crystal: 0,
  biomass: 0,
  ...b,
});
const seatId = (s: GameState, i: number): PlayerId => (s.players[i] as { id: PlayerId }).id;
const total = (s: GameState, id: PlayerId): number => bagTotal(playerById(s, id).resources);

/** Every player holds exactly 4 cards, ready for the current player to roll a 7. */
function rollSeven(): GameState {
  let s: GameState = { ...atPhase(makeGame(), 'ROLL'), rng: seedForSum(7) };
  for (const p of s.players) s = withResources(s, p.id, bag({ metal: 4 }));
  return s;
}

/** A resource sector nobody owns and the pirate is not on. */
function freeSector(state: GameState): SectorId {
  const id = state.sectorIds.find((sid) => {
    const sector = state.sectors[sid];
    return sector?.kind === 'resource' && sector.owner === null && state.pirate !== sid;
  });
  if (!id) throw new Error('no free sector');
  return id;
}

function pirateState(): GameState {
  return atPhase(makeGame(), 'PIRATE');
}

describe('beginPirates / rolling 7', () => {
  it('rolling 7 puts players over 7 cards into pendingDiscards with half rounded down', () => {
    const [p0, p1, p2] = [0, 1, 2].map((i) => seatId(rollSeven(), i)) as [string, string, string];
    let s = withResources(rollSeven(), p1, bag({ metal: 5, energy: 4 })); // 9 cards
    s = withResources(s, p2, bag({ crystal: 8 })); // 8 cards
    const { state: next, events } = expectOk(applyAction(s, p0, { type: 'roll' }));
    expect(next.pendingDiscards).toEqual({ [p1]: 4, [p2]: 4 });
    expect(next.phase).toBe('DISCARD');
    expect(events.map((e) => e.type)).toEqual(['diceRolled']);
  });

  it('halves odd totals downward', () => {
    const s = withResources(rollSeven(), seatId(rollSeven(), 1), bag({ metal: 15 }));
    expect(beginPirates(s).state.pendingDiscards).toEqual({ [seatId(s, 1)]: 7 });
  });

  it('player with exactly 7 cards does not discard', () => {
    const s0 = rollSeven();
    const s = withResources(s0, seatId(s0, 1), bag({ metal: 7 }));
    const { state: next } = expectOk(applyAction(s, currentPlayer(s).id, { type: 'roll' }));
    expect(next.pendingDiscards).toEqual({});
    expect(next.phase).toBe('PIRATE');
  });

  it('no discards needed → straight to PIRATE', () => {
    const s = rollSeven();
    const { state: next } = expectOk(applyAction(s, currentPlayer(s).id, { type: 'roll' }));
    expect(next.phase).toBe('PIRATE');
    expect(next.pendingDiscards).toEqual({});
  });

  it('does not mutate its input', () => {
    const s = withResources(rollSeven(), seatId(rollSeven(), 0), bag({ metal: 10 }));
    const snapshot = JSON.stringify(s);
    beginPirates(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('discard', () => {
  function discardState(): GameState {
    const s0 = rollSeven();
    const s = withResources(s0, seatId(s0, 1), bag({ metal: 5, energy: 4 }));
    return expectOk(applyAction(s, currentPlayer(s).id, { type: 'roll' })).state;
  }

  it('non-current player can discard during DISCARD', () => {
    const s = discardState();
    const p1 = seatId(s, 1);
    expect(currentPlayer(s).id).not.toBe(p1);
    const { state: next, events } = expectOk(
      applyAction(s, p1, { type: 'discard', resources: bag({ metal: 2, energy: 2 }) }),
    );
    expect(playerById(next, p1).resources).toEqual(bag({ metal: 3, energy: 2 }));
    expect(next.pendingDiscards).toEqual({});
    expect(events).toEqual([{ type: 'discarded', player: p1, count: 4 }]);
  });

  it('wrong discard size → err.invalidCount', () => {
    const s = discardState();
    const p1 = seatId(s, 1);
    expectErr(
      applyAction(s, p1, { type: 'discard', resources: bag({ metal: 3 }) }),
      'err.invalidCount',
    );
    expectErr(
      applyAction(s, p1, { type: 'discard', resources: bag({ metal: 5 }) }),
      'err.invalidCount',
    );
    expectErr(
      applyAction(s, p1, { type: 'discard', resources: bag({ metal: 6, energy: -2 }) }),
      'err.invalidCount',
    );
  });

  it('discarding more of a resource than held → err.insufficientResources', () => {
    const s = discardState();
    expectErr(
      applyAction(s, seatId(s, 1), {
        type: 'discard',
        resources: bag({ crystal: 4 }),
      }),
      'err.insufficientResources',
    );
  });

  it('player without a pending discard → err.notYourTurn; outside DISCARD → err.wrongPhase', () => {
    const s = discardState();
    expectErr(
      applyAction(s, seatId(s, 2), { type: 'discard', resources: bag() }),
      'err.notYourTurn',
    );
    expectErr(
      applyAction(atPhase(s, 'MAIN'), seatId(s, 1), {
        type: 'discard',
        resources: bag({ metal: 4 }),
      }),
      'err.wrongPhase',
    );
  });

  it('a player cannot discard twice', () => {
    const s = discardState();
    const p1 = seatId(s, 1);
    const action = { type: 'discard', resources: bag({ metal: 4 }) } as const;
    const next = expectOk(applyAction(s, p1, action)).state;
    expectErr(applyAction(next, p1, action), 'err.wrongPhase');
  });

  it('phase becomes PIRATE once all discards done', () => {
    const s0 = rollSeven();
    let s = withResources(s0, seatId(s0, 1), bag({ metal: 8 }));
    s = withResources(s, seatId(s0, 2), bag({ energy: 10 }));
    s = expectOk(applyAction(s, currentPlayer(s).id, { type: 'roll' })).state;
    expect(s.pendingDiscards).toEqual({ [seatId(s, 1)]: 4, [seatId(s, 2)]: 5 });
    s = expectOk(
      applyAction(s, seatId(s, 2), { type: 'discard', resources: bag({ energy: 5 }) }),
    ).state;
    expect(s.phase).toBe('DISCARD');
    expect(s.pendingDiscards).toEqual({ [seatId(s, 1)]: 4 });
    s = expectOk(
      applyAction(s, seatId(s, 1), { type: 'discard', resources: bag({ metal: 4 }) }),
    ).state;
    expect(s.phase).toBe('PIRATE');
    expect(s.pendingDiscards).toEqual({});
  });
});

describe('randomDiscard', () => {
  it('returns a valid discard action for the pending amount', () => {
    const s0 = rollSeven();
    const p1 = seatId(s0, 1);
    const s = expectOk(
      applyAction(withResources(s0, p1, bag({ metal: 3, energy: 3, crystal: 3 })), seatId(s0, 0), {
        type: 'roll',
      }),
    ).state;
    const action = randomDiscard(s, p1);
    expect(action.type).toBe('discard');
    expect(bagTotal(action.resources)).toBe(4);
    const { state: next } = expectOk(applyAction(s, p1, action));
    expect(total(next, p1)).toBe(5);
    expect(next.phase).toBe('PIRATE');
  });

  it('is deterministic per state and does not advance the rng', () => {
    const s0 = rollSeven();
    const p1 = seatId(s0, 1);
    const s = expectOk(
      applyAction(withResources(s0, p1, bag({ metal: 3, energy: 3, crystal: 3 })), seatId(s0, 0), {
        type: 'roll',
      }),
    ).state;
    const rng = s.rng;
    expect(randomDiscard(s, p1)).toEqual(randomDiscard(s, p1));
    expect(s.rng).toBe(rng);
  });
});

describe('movePirate', () => {
  it('pirate cannot target home or stay in place → err.invalidSector', () => {
    const s = pirateState();
    const id = currentPlayer(s).id;
    expectErr(
      applyAction(s, id, { type: 'movePirate', to: currentPlayer(s).homeId }),
      'err.invalidSector',
    );
    expectErr(applyAction(s, id, { type: 'movePirate', to: 'nowhere' }), 'err.invalidSector');
    const target = freeSector(s);
    const placed = expectOk(applyAction(s, id, { type: 'movePirate', to: target })).state;
    expectErr(
      applyAction(atPhase(placed, 'PIRATE'), id, { type: 'movePirate', to: target }),
      'err.invalidSector',
    );
  });

  it('is limited to the current player in the PIRATE phase', () => {
    const s = pirateState();
    const to = freeSector(s);
    expectErr(applyAction(s, seatId(s, 1), { type: 'movePirate', to }), 'err.notYourTurn');
    expectErr(
      applyAction(atPhase(s, 'MAIN'), currentPlayer(s).id, { type: 'movePirate', to }),
      'err.wrongPhase',
    );
  });

  it('moving pirate steals exactly one card from owner and emits stolen with resource', () => {
    const s0 = pirateState();
    const [me, victim] = [seatId(s0, 0), seatId(s0, 1)] as [string, string];
    const target = freeSector(s0);
    let s = withSector(s0, target, { owner: victim, structure: 'colony', fleets: 1 });
    s = withResources(s, victim, bag({ crystal: 3 }));
    s = withResources(s, me, bag({ metal: 1 }));
    const { state: next, events } = expectOk(
      applyAction(s, me, { type: 'movePirate', to: target }),
    );
    expect(next.pirate).toBe(target);
    expect(next.phase).toBe('MAIN');
    expect(playerById(next, victim).resources).toEqual(bag({ crystal: 2 }));
    expect(playerById(next, me).resources).toEqual(bag({ metal: 1, crystal: 1 }));
    expect(events).toEqual([
      { type: 'pirateMoved', player: me, to: target },
      { type: 'stolen', thief: me, victim, resource: 'crystal' },
    ]);
  });

  it('moving pirate onto own or empty sector steals nothing', () => {
    const s0 = pirateState();
    const [me, other] = [seatId(s0, 0), seatId(s0, 1)] as [string, string];
    const own = freeSector(s0);
    const s = withSector(s0, own, { owner: me, structure: 'colony', fleets: 1 });
    const a = expectOk(applyAction(s, me, { type: 'movePirate', to: own }));
    expect(a.events.map((e) => e.type)).toEqual(['pirateMoved']);
    expect(a.state.players).toEqual(s.players);
    expect(a.state.rng).toBe(s.rng);

    const b = expectOk(applyAction(s0, me, { type: 'movePirate', to: freeSector(s0) }));
    expect(b.events.map((e) => e.type)).toEqual(['pirateMoved']);
    expect(b.state.players).toEqual(s0.players);

    const poor = withResources(
      withSector(s0, own, { owner: other, structure: 'colony', fleets: 1 }),
      other,
      bag(),
    );
    const c = expectOk(applyAction(poor, me, { type: 'movePirate', to: own }));
    expect(c.events.map((e) => e.type)).toEqual(['pirateMoved']);
    expect(c.state.rng).toBe(poor.rng);
    expect(c.state.pirate).toBe(own);
  });
});

describe('stealRandom', () => {
  it('moves one card weighted by count and advances the rng', () => {
    const s0 = makeGame();
    const [thief, victim] = [seatId(s0, 0), seatId(s0, 1)] as [string, string];
    const s = withResources(s0, victim, bag({ biomass: 5 }));
    const { state: next, events } = stealRandom(s, thief, victim);
    expect(events).toEqual([{ type: 'stolen', thief, victim, resource: 'biomass' }]);
    expect(total(next, victim)).toBe(4);
    expect(next.rng).not.toBe(s.rng);
    expect(total(s, victim)).toBe(5);
  });

  it('steals nothing from an empty victim', () => {
    const s0 = makeGame();
    const [thief, victim] = [seatId(s0, 0), seatId(s0, 1)] as [string, string];
    const s = withResources(s0, victim, bag());
    const { state: next, events } = stealRandom(s, thief, victim);
    expect(events).toEqual([]);
    expect(next).toEqual(s);
  });
});
