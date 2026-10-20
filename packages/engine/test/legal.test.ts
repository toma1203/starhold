import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game.ts';
import { hexId, neighbors } from '../src/hex.ts';
import { legalActions } from '../src/legal.ts';
import { maxAttackDice, maxMovable } from '../src/rules/military.ts';
import { tradeRate } from '../src/rules/trade.ts';
import { RESOURCES } from '../src/types.ts';
import type {
  Action,
  GameState,
  PlayerId,
  ResourceBag,
  SectorId,
  TradeOffer,
} from '../src/types.ts';
import { viewFor } from '../src/view.ts';
import { playRandom } from './driver.ts';
import { atPhase, makeGame, withResources, withSector } from './helpers.ts';

const idOf = (s: GameState, offset = 0): PlayerId =>
  (s.players[(s.current + offset) % s.players.length] as { id: PlayerId }).id;
const ofType = <T extends Action['type']>(actions: Action[], type: T) =>
  actions.filter((a): a is Extract<Action, { type: T }> => a.type === type);
const cards = (b: Partial<ResourceBag>): ResourceBag => ({
  metal: 0,
  energy: 0,
  crystal: 0,
  biomass: 0,
  ...b,
});
const offerState = (s: GameState, offer: Partial<TradeOffer> & Pick<TradeOffer, 'from'>) => ({
  ...s,
  offer: { give: cards({}), want: cards({}), accepted: [], declined: [], ...offer },
});

/** A MAIN-phase game with every sector unowned and the current player broke. */
function blankGame(players: 2 | 3 | 4 = 3): GameState {
  const s = atPhase(makeGame({ players }), 'MAIN');
  for (const id of s.sectorIds) {
    const sector = s.sectors[id];
    if (sector) s.sectors[id] = { ...sector, owner: null, fleets: 0, structure: 'none' };
  }
  return withResources(s, idOf(s), cards({}));
}

function neighborIds(s: GameState, id: SectorId): SectorId[] {
  const hex = s.sectors[id]?.hex;
  if (!hex) throw new Error(`unknown sector ${id}`);
  return neighbors(hex)
    .map(hexId)
    .filter((nid) => s.sectors[nid] !== undefined);
}

/** Two adjacent non-home sector ids. */
function adjacentPair(s: GameState): [SectorId, SectorId] {
  for (const id of s.sectorIds) {
    if (s.sectors[id]?.kind === 'home') continue;
    const other = neighborIds(s, id).find((nid) => s.sectors[nid]?.kind !== 'home');
    if (other) return [id, other];
  }
  throw new Error('no adjacent pair');
}

describe('legalActions', () => {
  it('every action from legalActions applies ok', () => {
    let checked = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const players = (2 + (seed % 3)) as 2 | 3 | 4;
      const state = playRandom(makeGame({ players, seed }), seed * 7919, (seed * 37) % 201);
      for (const p of state.players) {
        const actions = legalActions(state, p.id);
        for (const action of actions) {
          const result = applyAction(state, p.id, action);
          if (!result.ok) {
            throw new Error(
              `seed ${seed}: ${p.id} ${JSON.stringify(action)} in ${state.phase}: ${result.error}`,
            );
          }
          checked++;
        }
        // The same list is available from the player's own view.
        expect(legalActions(viewFor(state, p.id), p.id)).toEqual(actions);
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('endTurn always legal in MAIN for current', () => {
    let seen = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const state = playRandom(makeGame({ players: 3, seed }), seed, seed * 4);
      if (state.phase !== 'MAIN') continue;
      seen++;
      expect(legalActions(state, idOf(state))).toContainEqual({ type: 'endTurn' });
    }
    expect(seen).toBeGreaterThan(0);
    const s = blankGame();
    expect(legalActions(s, idOf(s))).toContainEqual({ type: 'endTurn' });
  });

  it('non-current player gets [] unless responding to a trade', () => {
    for (const phase of ['HOME_BONUS', 'ROLL', 'PIRATE', 'MAIN'] as const) {
      const s = atPhase(makeGame(), phase);
      expect(legalActions(s, idOf(s, 1))).toEqual([]);
      expect(legalActions(s, idOf(s, 2))).toEqual([]);
    }
    const s = withResources(atPhase(makeGame(), 'MAIN'), idOf(makeGame(), 1), cards({ energy: 1 }));
    const offered = offerState(s, { from: idOf(s), want: cards({ energy: 1 }) });
    expect(legalActions(offered, idOf(s, 1))).toContainEqual({
      type: 'respondTrade',
      accept: false,
    });
  });

  it('an unknown player or a finished game has no actions', () => {
    const s = atPhase(makeGame(), 'MAIN');
    expect(legalActions(s, 'nobody')).toEqual([]);
    const done: GameState = { ...s, phase: 'FINISHED', winner: idOf(s), endReason: 'target' };
    for (const p of done.players) expect(legalActions(done, p.id)).toEqual([]);
  });

  it('HOME_BONUS offers one chooseHomeBonus per resource', () => {
    const s = atPhase(makeGame(), 'HOME_BONUS');
    const actions = legalActions(s, idOf(s));
    expect(actions).toHaveLength(4);
    expect(
      ofType(actions, 'chooseHomeBonus')
        .map((a) => a.resource)
        .sort(),
    ).toEqual([...RESOURCES].sort());
  });

  it('ROLL offers exactly roll', () => {
    const s = atPhase(makeGame(), 'ROLL');
    expect(legalActions(s, idOf(s))).toEqual([{ type: 'roll' }]);
  });

  it('DISCARD offers nothing, even to a player who owes a discard', () => {
    const base = atPhase(makeGame(), 'DISCARD');
    const owing = idOf(base, 1);
    const s = {
      ...withResources(base, owing, cards({ metal: 8 })),
      pendingDiscards: { [owing]: 4 },
    };
    for (const p of s.players) expect(legalActions(s, p.id)).toEqual([]);
  });

  it('PIRATE offers one movePirate per sector except homes and the current pirate sector', () => {
    const base = atPhase(makeGame(), 'PIRATE');
    const target = base.sectorIds.find((id) => base.sectors[id]?.kind !== 'home') as SectorId;
    const s = { ...base, pirate: target };
    const actions = legalActions(s, idOf(s));
    expect(actions.every((a) => a.type === 'movePirate')).toBe(true);
    const expected = s.sectorIds.filter((id) => s.sectors[id]?.kind !== 'home' && id !== target);
    expect(
      ofType(actions, 'movePirate')
        .map((a) => a.to)
        .sort(),
    ).toEqual([...expected].sort());
  });

  it('MAIN with nothing to spend or move offers only endTurn', () => {
    const s = blankGame();
    expect(legalActions(s, idOf(s))).toEqual([{ type: 'endTurn' }]);
  });

  it('MAIN offers only affordable builds on valid sectors', () => {
    const me = idOf(blankGame());
    const [a, b] = adjacentPair(blankGame());
    const s = withSector(withSector(blankGame(), a, { owner: me, fleets: 1 }), b, {
      owner: me,
      fleets: 1,
      structure: 'colony',
    });
    const rich = withResources(s, me, cards({ metal: 9, energy: 9, crystal: 9, biomass: 9 }));
    const actions = legalActions(rich, me);
    expect(
      ofType(actions, 'buildFleet')
        .map((x) => x.at)
        .sort(),
    ).toEqual([a, b].sort());
    expect(ofType(actions, 'buildColony').map((x) => x.at)).toEqual([a]); // b already has one
    expect(ofType(actions, 'buildStarbase').map((x) => x.at)).toEqual([b]);

    const poor = legalActions(withResources(s, me, cards({ metal: 1, energy: 1 })), me);
    expect(ofType(poor, 'buildFleet')).toHaveLength(2);
    expect(ofType(poor, 'buildColony')).toHaveLength(0);
    expect(ofType(poor, 'buildStarbase')).toHaveLength(0);

    const starbaseOnly = legalActions(withResources(s, me, cards({ metal: 3, crystal: 2 })), me);
    expect(ofType(starbaseOnly, 'buildStarbase')).toHaveLength(1);
    expect(ofType(starbaseOnly, 'buildFleet')).toHaveLength(0); // needs energy
  });

  it('offers a starbase but never a colony on a home sector', () => {
    const base = atPhase(makeGame(), 'MAIN');
    const me = idOf(base);
    const s = withResources(base, me, cards({ metal: 5, energy: 5, crystal: 5, biomass: 5 }));
    const home = s.players[s.current]?.homeId as SectorId;
    const actions = legalActions(s, me);
    expect(ofType(actions, 'buildColony').map((a) => a.at)).not.toContain(home);
    expect(ofType(actions, 'buildStarbase').map((a) => a.at)).toContain(home);
  });

  it('bankTrade covers every affordable (give, get) pair at the player rate', () => {
    const me = idOf(blankGame());
    const first = blankGame().sectorIds[0] as SectorId;
    const s = withSector(blankGame(), first, { owner: me, fleets: 1, tradeStation: false });
    const four = withResources(s, me, cards({ metal: 4, energy: 3 }));
    expect(tradeRate(four, me)).toBe(4);
    expect(
      ofType(legalActions(four, me), 'bankTrade')
        .map((t) => `${t.give}>${t.get}`)
        .sort(),
    ).toEqual(['metal>biomass', 'metal>crystal', 'metal>energy']);

    const station = withSector(s, first, { tradeStation: true });
    const three = withResources(station, me, cards({ metal: 4, energy: 3 }));
    expect(tradeRate(three, me)).toBe(3);
    expect(ofType(legalActions(three, me), 'bankTrade')).toHaveLength(6); // metal and energy, 3 targets each
  });

  it('expand and attack use the maximum count and dice', () => {
    const base = blankGame();
    const me = idOf(base);
    const foe = idOf(base, 1);
    const [a, b] = adjacentPair(base);
    const s = withSector(withSector(base, a, { owner: me, fleets: 5 }), b, {
      owner: foe,
      fleets: 2,
    });
    const actions = legalActions(s, me);
    expect(maxMovable(s, a)).toBe(4);
    const expands = ofType(actions, 'expand');
    expect(expands.length).toBeGreaterThan(0);
    expect(expands.every((x) => x.from === a && x.count === 4)).toBe(true);
    expect(expands.map((x) => x.to)).not.toContain(b); // owned by the foe
    expect(ofType(actions, 'attack')).toEqual([
      { type: 'attack', from: a, to: b, dice: maxAttackDice(s, a) },
    ]);
    expect(ofType(actions, 'fortify')).toEqual([]); // only one owned sector
    // A lone fleet can neither expand nor attack.
    const lone = withSector(s, a, { fleets: 1 });
    expect(ofType(legalActions(lone, me), 'expand')).toEqual([]);
    expect(ofType(legalActions(lone, me), 'attack')).toEqual([]);
  });

  it('fortify pairs connected own sectors, moving every fleet but one', () => {
    const base = blankGame();
    const me = idOf(base);
    const [a, b] = adjacentPair(base);
    const c = neighborIds(base, b).find((id) => id !== a && base.sectors[id]?.kind !== 'home');
    if (!c) throw new Error('no third sector');
    let s = withSector(base, a, { owner: me, fleets: 5 });
    s = withSector(s, b, { owner: me, fleets: 1 });
    expect(ofType(legalActions(s, me), 'fortify')).toEqual([
      { type: 'fortify', from: a, to: b, count: 4 },
    ]);
    // A separate, unconnected sector is not a fortify target.
    const far = s.sectorIds.find(
      (id) =>
        s.sectors[id]?.kind !== 'home' && ![a, b].includes(id) && !neighborIds(s, a).includes(id),
    ) as SectorId;
    const apart = withSector(s, far, { owner: me, fleets: 2 });
    const forts = ofType(legalActions(apart, me), 'fortify');
    expect(forts.find((f) => f.to === far && f.from === a)).toBeUndefined();
    expect(forts.find((f) => f.to === a && f.from === far)).toBeUndefined();
  });

  it('never attacks a home sector, an own sector or an unowned sector', () => {
    const base = blankGame();
    const me = idOf(base);
    const foe = idOf(base, 1);
    const [a, b] = adjacentPair(base);
    let s = withSector(base, a, { owner: me, fleets: 4 });
    expect(ofType(legalActions(s, me), 'attack')).toEqual([]); // b is unowned
    s = withSector(s, b, { owner: me, fleets: 2 });
    expect(ofType(legalActions(s, me), 'attack')).toEqual([]); // b is mine
    const home = base.sectorIds.find((id) => base.sectors[id]?.kind === 'home') as SectorId;
    const near = neighborIds(base, home)[0] as SectorId;
    let t = withSector(base, near, { owner: me, fleets: 4 });
    t = withSector(t, home, { owner: foe, fleets: 3, structure: 'colony' });
    expect(ofType(legalActions(t, me), 'attack')).toEqual([]);
  });

  it('an own trade offer adds cancelTrade and one confirmTrade per acceptor, never offerTrade', () => {
    const base = blankGame();
    const me = idOf(base);
    const [x, y] = [idOf(base, 1), idOf(base, 2)];
    let s = withResources(base, me, cards({ metal: 2 }));
    s = withResources(s, x, cards({ energy: 1 }));
    s = withResources(s, y, cards({ energy: 1 }));
    expect(ofType(legalActions(s, me), 'cancelTrade')).toHaveLength(0);
    const offered = offerState(s, {
      from: me,
      give: cards({ metal: 1 }),
      want: cards({ energy: 1 }),
      accepted: [x, y],
    });
    const actions = legalActions(offered, me);
    expect(actions).toContainEqual({ type: 'cancelTrade' });
    expect(
      ofType(actions, 'confirmTrade')
        .map((a) => a.with)
        .sort(),
    ).toEqual([x, y].sort());
    expect(ofType(actions, 'offerTrade')).toEqual([]);
    for (const a of actions) expect(applyAction(offered, me, a).ok).toBe(true);
  });

  it('confirmTrade is withheld when the trade can no longer be paid', () => {
    const base = blankGame();
    const me = idOf(base);
    const x = idOf(base, 1);
    const s = withResources(base, x, cards({ energy: 1 }));
    const offered = offerState(s, {
      from: me,
      give: cards({ metal: 1 }), // the offerer has spent it since
      want: cards({ energy: 1 }),
      accepted: [x],
    });
    expect(ofType(legalActions(offered, me), 'confirmTrade')).toEqual([]);
  });

  it('a non-offerer may decline, and accept only if able to pay; once only', () => {
    const base = blankGame();
    const me = idOf(base);
    const [rich, poor] = [idOf(base, 1), idOf(base, 2)];
    const s = withResources(withResources(base, rich, cards({ energy: 2 })), poor, cards({}));
    const offer = { from: me, give: cards({ metal: 1 }), want: cards({ energy: 1 }) };
    const offered = offerState(s, offer);
    expect(legalActions(offered, rich)).toEqual([
      { type: 'respondTrade', accept: false },
      { type: 'respondTrade', accept: true },
    ]);
    expect(legalActions(offered, poor)).toEqual([{ type: 'respondTrade', accept: false }]);
    for (const a of legalActions(offered, rich))
      expect(applyAction(offered, rich, a).ok).toBe(true);

    const answered = offerState(s, { ...offer, accepted: [rich], declined: [poor] });
    expect(legalActions(answered, rich)).toEqual([]);
    expect(legalActions(answered, poor)).toEqual([]);
  });

  it('works from a view: own resources are read, other hands are never needed', () => {
    const base = blankGame();
    const me = idOf(base);
    const rich = idOf(base, 1);
    const s = withResources(base, rich, cards({ energy: 1 }));
    const offered = offerState(s, {
      from: me,
      give: cards({ metal: 1 }),
      want: cards({ energy: 1 }),
    });
    expect(legalActions(viewFor(offered, rich), rich)).toEqual(legalActions(offered, rich));
    expect(legalActions(viewFor(offered, rich), rich)).toContainEqual({
      type: 'respondTrade',
      accept: true,
    });
  });
});
