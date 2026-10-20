import { describe, expect, it } from 'vitest';
import { bagTotal } from '../src/costs.ts';
import { applyAction } from '../src/game.ts';
import { hexId, neighbors } from '../src/hex.ts';
import { rollDie } from '../src/rng.ts';
import { connectedOwned, maxAttackDice, maxMovable } from '../src/rules/military.ts';
import { playerById } from '../src/state.ts';
import type {
  Action,
  ActionResult,
  GameState,
  PlayerId,
  ResourceBag,
  Sector,
  SectorId,
  Structure,
} from '../src/types.ts';
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

const me = (s: GameState): PlayerId => (s.players[s.current] as { id: PlayerId }).id;
const foe = (s: GameState): PlayerId =>
  (s.players[(s.current + 1) % s.players.length] as { id: PlayerId }).id;
const third = (s: GameState): PlayerId =>
  (s.players[(s.current + 2) % s.players.length] as { id: PlayerId }).id;
const total = (s: GameState, id: PlayerId): number => bagTotal(playerById(s, id).resources);
const cards = (b: Partial<ResourceBag>): ResourceBag => ({
  metal: 0,
  energy: 0,
  crystal: 0,
  biomass: 0,
  ...b,
});

/** A MAIN-phase game with every sector unowned, so each test lays out its own board. */
function blankGame(): GameState {
  const s = atPhase(makeGame(), 'MAIN');
  for (const id of s.sectorIds) {
    const sector = s.sectors[id];
    if (sector) s.sectors[id] = { ...sector, owner: null, fleets: 0, structure: 'none' };
  }
  return s;
}

function neighborIds(s: GameState, id: SectorId): SectorId[] {
  const hex = s.sectors[id]?.hex;
  if (!hex) throw new Error(`unknown sector ${id}`);
  return neighbors(hex)
    .map(hexId)
    .filter((nid) => s.sectors[nid] !== undefined);
}

const plain = (sector: Sector): boolean => sector.kind === 'resource';

/** Two adjacent sectors that satisfy `accept` (resource sectors by default). */
function adjacentPair(
  s: GameState,
  accept: (sector: Sector) => boolean = plain,
): [SectorId, SectorId] {
  for (const id of s.sectorIds) {
    const a = s.sectors[id];
    if (!a || !accept(a)) continue;
    for (const nid of neighborIds(s, id)) {
      const b = s.sectors[nid];
      if (b && accept(b)) return [id, nid];
    }
  }
  throw new Error('no adjacent pair');
}

/** `length` sectors in a straight line, all resource sectors (so end points are never adjacent). */
function line(s: GameState, length: number): SectorId[] {
  for (const startId of s.sectorIds) {
    const start = s.sectors[startId];
    if (!start) continue;
    for (const dir of [
      { q: 1, r: 0 },
      { q: 0, r: 1 },
      { q: 1, r: -1 },
    ]) {
      const ids = Array.from({ length }, (_, i) =>
        hexId({ q: start.hex.q + dir.q * i, r: start.hex.r + dir.r * i }),
      );
      if (ids.every((id) => s.sectors[id] !== undefined && plain(s.sectors[id] as Sector))) {
        return ids;
      }
    }
  }
  throw new Error(`no straight line of ${length}`);
}

const owned = (s: GameState, id: SectorId, owner: PlayerId, fleets: number): GameState =>
  withSector(s, id, { owner, fleets, structure: 'none' });

const expand = (from: SectorId, to: SectorId, count: number): Action => ({
  type: 'expand',
  from,
  to,
  count,
});
const fortify = (from: SectorId, to: SectorId, count: number): Action => ({
  type: 'fortify',
  from,
  to,
  count,
});
const attackAction = (
  from: SectorId,
  to: SectorId,
  dice: number,
  moveIfConquered?: number,
): Action => ({
  type: 'attack',
  from,
  to,
  dice: dice as 1 | 2 | 3,
  ...(moveIfConquered === undefined ? {} : { moveIfConquered }),
});

interface Stage {
  state: GameState;
  attacker: PlayerId;
  defender: PlayerId;
  from: SectorId;
  to: SectorId;
}

/** Attacker on `from`, defender on the adjacent `to`, and the rng primed with `rolls` if given. */
function stage(opts: {
  fromFleets: number;
  toFleets: number;
  toStructure?: Structure;
  rolls?: [attack: number[], defend: number[]];
  defenderCards?: Partial<ResourceBag>;
}): Stage {
  const base = blankGame();
  const [from, to] = adjacentPair(base);
  const attacker = me(base);
  const defender = foe(base);
  let state = owned(base, from, attacker, opts.fromFleets);
  state = withSector(state, to, {
    owner: defender,
    fleets: opts.toFleets,
    structure: opts.toStructure ?? 'none',
  });
  state = withResources(state, attacker, cards({}));
  state = withResources(state, defender, cards(opts.defenderCards ?? { metal: 2, energy: 2 }));
  if (opts.rolls) state = { ...state, rng: seedForDice(...opts.rolls) };
  return { state, attacker, defender, from, to };
}

const run = (st: Stage, dice: number, moveIfConquered?: number): ActionResult =>
  applyAction(st.state, st.attacker, attackAction(st.from, st.to, dice, moveIfConquered));

/** The rng seed left after `count` consecutive die rolls from `seed`. */
function rngAfter(seed: number, count: number): number {
  let s = seed;
  for (let i = 0; i < count; i++) s = rollDie(s)[1];
  return s;
}

// Attacker rolls [5,3] against a lone defender die [2]: a conquest of a 1-fleet sector.
const WIN_2_VS_1: [number[], number[]] = [[5, 3], [2]];

describe('expand', () => {
  it('claims an adjacent unowned sector with the moved fleets, emitting expanded', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    const s = owned(base, from, me(base), 4);
    const { state, events } = expectOk(applyAction(s, me(s), expand(from, to, 3)));
    expect(state.sectors[from]?.fleets).toBe(1);
    expect(state.sectors[to]).toMatchObject({ owner: me(s), fleets: 3, structure: 'none' });
    expect(events).toEqual([{ type: 'expanded', player: me(s), from, to, count: 3 }]);
    expect(playerById(state, me(s)).conquests).toBe(0);
    expect(state.phase).toBe('MAIN');
    expect(state.current).toBe(s.current);
  });

  it('allows moving all but one fleet and a single fleet', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    const s = owned(base, from, me(base), 2);
    expect(expectOk(applyAction(s, me(s), expand(from, to, 1))).state.sectors[to]?.fleets).toBe(1);
  });

  it('allows expanding into a nebula', () => {
    const base = blankGame();
    const nebula = base.sectorIds.find((id) => base.sectors[id]?.kind === 'nebula') as SectorId;
    const start = neighborIds(base, nebula).find(
      (id) => base.sectors[id]?.kind === 'resource',
    ) as SectorId;
    const s = owned(base, start, me(base), 3);
    const { state } = expectOk(applyAction(s, me(s), expand(start, nebula, 1)));
    expect(state.sectors[nebula]).toMatchObject({ owner: me(s), fleets: 1, structure: 'none' });
  });

  it('starts the new holding as a plain claim, whatever the empty sector held before', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    const s = withSector(owned(base, from, me(base), 4), to, { structure: 'starbase' });
    const { state } = expectOk(applyAction(s, me(s), expand(from, to, 2)));
    expect(state.sectors[to]).toMatchObject({ owner: me(s), fleets: 2, structure: 'none' });
  });

  it('does not mutate the input state', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    const s = owned(base, from, me(base), 4);
    const snapshot = JSON.stringify(s);
    expectOk(applyAction(s, me(s), expand(from, to, 2)));
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('rejects a target that is owned by yourself or by an enemy with err.invalidSector', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    const mine = owned(owned(base, from, me(base), 4), to, me(base), 1);
    expectErr(applyAction(mine, me(mine), expand(from, to, 2)), 'err.invalidSector');
    const theirs = owned(owned(base, from, me(base), 4), to, foe(base), 1);
    expectErr(applyAction(theirs, me(theirs), expand(from, to, 2)), 'err.invalidSector');
  });

  it('rejects a non-adjacent target with err.notAdjacent', () => {
    const base = blankGame();
    const [a, , c] = line(base, 3) as [SectorId, SectorId, SectorId];
    const s = owned(base, a, me(base), 4);
    expectErr(applyAction(s, me(s), expand(a, c, 2)), 'err.notAdjacent');
    expectErr(applyAction(s, me(s), expand(a, a, 2)), 'err.notAdjacent');
  });

  it('rejects counts outside 1..fleets-1 and non-integers with err.invalidCount', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    const s = owned(base, from, me(base), 4);
    for (const count of [0, 4, 5, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectErr(applyAction(s, me(s), expand(from, to, count)), 'err.invalidCount');
    }
    const lone = owned(base, from, me(base), 1);
    expectErr(applyAction(lone, me(lone), expand(from, to, 1)), 'err.invalidCount');
  });

  it('rejects an origin you do not own with err.notOwned', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    const enemy = owned(base, from, foe(base), 4);
    expectErr(applyAction(enemy, me(enemy), expand(from, to, 2)), 'err.notOwned');
    expectErr(applyAction(base, me(base), expand(from, to, 2)), 'err.notOwned');
  });

  it('rejects unknown sector ids, including prototype keys', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    const s = owned(base, from, me(base), 4);
    expectErr(applyAction(s, me(s), expand('nope', to, 2)), 'err.invalidSector');
    expectErr(applyAction(s, me(s), expand(from, 'nope', 2)), 'err.invalidSector');
    expectErr(applyAction(s, me(s), expand('__proto__', to, 2)), 'err.invalidSector');
    expectErr(applyAction(s, me(s), expand(from, 'constructor', 2)), 'err.invalidSector');
  });

  it('fails outside MAIN and for a non-current player', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    const s = owned(base, from, me(base), 4);
    for (const phase of ['HOME_BONUS', 'ROLL', 'DISCARD', 'PIRATE'] as const) {
      expectErr(applyAction(atPhase(s, phase), me(s), expand(from, to, 2)), 'err.wrongPhase');
    }
    expectErr(applyAction(s, foe(s), expand(from, to, 2)), 'err.notYourTurn');
  });
});

describe('attack: validation', () => {
  it('rejects attacking a home sector with err.homeProtected', () => {
    const base = blankGame();
    const foeHome = playerById(base, foe(base)).homeId;
    const from = neighborIds(base, foeHome).find(
      (id) => base.sectors[id]?.kind !== 'home',
    ) as SectorId;
    let s = owned(base, from, me(base), 4);
    s = withSector(s, foeHome, { owner: foe(base), fleets: 3, structure: 'colony' });
    expectErr(applyAction(s, me(s), attackAction(from, foeHome, 1)), 'err.homeProtected');
  });

  it('rejects dice outside 1..min(3, fleets-1) and non-integers with err.invalidDice', () => {
    const st = stage({ fromFleets: 3, toFleets: 2 });
    for (const dice of [0, 3, 4, -1, 1.5, Number.NaN]) {
      expectErr(run(st, dice), 'err.invalidDice');
    }
    const big = stage({ fromFleets: 9, toFleets: 2 });
    expectErr(run(big, 4), 'err.invalidDice');
    const lone = stage({ fromFleets: 1, toFleets: 2 });
    expectErr(run(lone, 1), 'err.invalidDice');
  });

  it('rejects attacking your own sector with err.invalidSector', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    const s = owned(owned(base, from, me(base), 4), to, me(base), 2);
    expectErr(applyAction(s, me(s), attackAction(from, to, 1)), 'err.invalidSector');
  });

  it('rejects attacking an unowned sector with err.invalidSector (expand instead)', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    const s = owned(base, from, me(base), 4);
    expectErr(applyAction(s, me(s), attackAction(from, to, 1)), 'err.invalidSector');
  });

  it('rejects an origin you do not own with err.notOwned', () => {
    const st = stage({ fromFleets: 4, toFleets: 2 });
    const s = withSector(st.state, st.from, { owner: st.defender });
    expectErr(applyAction(s, st.attacker, attackAction(st.from, st.to, 1)), 'err.notOwned');
    const unowned = withSector(st.state, st.from, { owner: null });
    expectErr(applyAction(unowned, st.attacker, attackAction(st.from, st.to, 1)), 'err.notOwned');
  });

  it('rejects a non-adjacent target with err.notAdjacent', () => {
    const base = blankGame();
    const [a, , c] = line(base, 3) as [SectorId, SectorId, SectorId];
    const s = owned(owned(base, a, me(base), 4), c, foe(base), 2);
    expectErr(applyAction(s, me(s), attackAction(a, c, 1)), 'err.notAdjacent');
  });

  it('rejects a non-integer moveIfConquered with err.invalidCount', () => {
    const st = stage({ fromFleets: 4, toFleets: 1, rolls: WIN_2_VS_1 });
    for (const move of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectErr(run(st, 2, move), 'err.invalidCount');
    }
    const nulled = applyAction(st.state, st.attacker, {
      ...attackAction(st.from, st.to, 2),
      moveIfConquered: null,
    } as unknown as Action);
    expectErr(nulled, 'err.invalidCount');
  });

  it('rejects unknown sector ids, including prototype keys', () => {
    const st = stage({ fromFleets: 4, toFleets: 2 });
    for (const [from, to] of [
      ['nope', st.to],
      [st.from, 'nope'],
      ['__proto__', st.to],
      [st.from, 'constructor'],
    ] as const) {
      expectErr(applyAction(st.state, st.attacker, attackAction(from, to, 1)), 'err.invalidSector');
    }
  });

  it('fails outside MAIN and for a non-current player', () => {
    const st = stage({ fromFleets: 4, toFleets: 2 });
    for (const phase of ['HOME_BONUS', 'ROLL', 'DISCARD', 'PIRATE'] as const) {
      expectErr(
        applyAction(atPhase(st.state, phase), st.attacker, attackAction(st.from, st.to, 1)),
        'err.wrongPhase',
      );
    }
    expectErr(
      applyAction(st.state, st.defender, attackAction(st.from, st.to, 1)),
      'err.notYourTurn',
    );
  });
});

describe('attack: battle', () => {
  it('rolls the attacker dice first, then the defender dice, reporting each side sorted descending', () => {
    // Roll order: attacker 2 then 6, defender 3 then 4. Sorted: [6,2] vs [4,3] -> one loss each.
    const st = stage({
      fromFleets: 4,
      toFleets: 3,
      rolls: [
        [2, 6],
        [3, 4],
      ],
    });
    const { state, events } = expectOk(run(st, 2));
    expect(events).toEqual([
      {
        type: 'battle',
        attacker: st.attacker,
        defender: st.defender,
        from: st.from,
        to: st.to,
        attackRoll: [6, 2],
        defendRoll: [4, 3],
        attackerLosses: 1,
        defenderLosses: 1,
        conquered: false,
      },
    ]);
    expect(state.sectors[st.from]?.fleets).toBe(3);
    expect(state.sectors[st.to]).toMatchObject({ owner: st.defender, fleets: 2 });
    expect(state.conqueredThisTurn).toBe(false);
    expect(playerById(state, st.attacker).conquests).toBe(0);
    expect(state.phase).toBe('MAIN');
  });

  it('threads the rng through exactly one roll per die and leaves it otherwise untouched', () => {
    const st = stage({
      fromFleets: 4,
      toFleets: 3,
      rolls: [
        [2, 6],
        [3, 4],
      ],
    });
    const { state } = expectOk(run(st, 2));
    expect(state.rng).toBe(rngAfter(st.state.rng, 4));
  });

  it('gives the defender min(2, fleets) dice', () => {
    const one = stage({ fromFleets: 4, toFleets: 1, rolls: [[4], [2]] });
    const oneEvent = expectOk(run(one, 1)).events[0];
    expect(oneEvent).toMatchObject({ type: 'battle', attackRoll: [4], defendRoll: [2] });

    const five = stage({ fromFleets: 4, toFleets: 5, rolls: [[4], [1, 3]] });
    const fiveEvent = expectOk(run(five, 1)).events[0];
    expect(fiveEvent).toMatchObject({ type: 'battle', attackRoll: [4], defendRoll: [3, 1] });
  });

  it('gives the attacker as many dice as requested, up to 3', () => {
    const st = stage({
      fromFleets: 6,
      toFleets: 9,
      rolls: [
        [1, 2, 3],
        [4, 5],
      ],
    });
    const event = expectOk(run(st, 3)).events[0];
    expect(event).toMatchObject({
      type: 'battle',
      attackRoll: [3, 2, 1],
      defendRoll: [5, 4],
      attackerLosses: 2,
      defenderLosses: 0,
    });
  });

  it('a tie goes to the defender', () => {
    const st = stage({ fromFleets: 3, toFleets: 2, rolls: [[4], [4, 1]] });
    const { state, events } = expectOk(run(st, 1));
    expect(events[0]).toMatchObject({ attackerLosses: 1, defenderLosses: 0, conquered: false });
    expect(state.sectors[st.from]?.fleets).toBe(2);
    expect(state.sectors[st.to]?.fleets).toBe(2);
  });

  it('only a starbase defender gets +1 on its highest die, and the event keeps the raw roll', () => {
    const rolls: [number[], number[]] = [[5], [4, 1]];
    const plainDefence = stage({ fromFleets: 3, toFleets: 2, rolls });
    expect(expectOk(run(plainDefence, 1)).events[0]).toMatchObject({
      attackerLosses: 0,
      defenderLosses: 1,
    });

    const colony = stage({ fromFleets: 3, toFleets: 2, toStructure: 'colony', rolls });
    expect(expectOk(run(colony, 1)).events[0]).toMatchObject({
      attackerLosses: 0,
      defenderLosses: 1,
    });

    const starbase = stage({ fromFleets: 3, toFleets: 2, toStructure: 'starbase', rolls });
    const { state, events } = expectOk(run(starbase, 1));
    expect(events[0]).toMatchObject({
      defendRoll: [4, 1],
      attackerLosses: 1,
      defenderLosses: 0,
      conquered: false,
    });
    expect(state.sectors[starbase.to]).toMatchObject({ structure: 'starbase', fleets: 2 });
    expect(state.sectors[starbase.from]?.fleets).toBe(2);
  });

  it('does not mutate the input state', () => {
    const st = stage({ fromFleets: 4, toFleets: 1, rolls: WIN_2_VS_1 });
    const snapshot = JSON.stringify(st.state);
    expectOk(run(st, 2));
    expect(JSON.stringify(st.state)).toBe(snapshot);
  });
});

describe('attack: conquest', () => {
  it('transfers a colony with it, so its victory point moves to the attacker', () => {
    const st = stage({ fromFleets: 4, toFleets: 1, toStructure: 'colony', rolls: WIN_2_VS_1 });
    const colonies = (s: GameState, id: PlayerId): number =>
      s.sectorIds.filter((sid) => {
        const sector = s.sectors[sid];
        return sector?.owner === id && sector.structure === 'colony';
      }).length;
    expect([colonies(st.state, st.attacker), colonies(st.state, st.defender)]).toEqual([0, 1]);

    const { state, events } = expectOk(run(st, 2));
    expect(state.sectors[st.to]).toMatchObject({ owner: st.attacker, structure: 'colony' });
    expect([colonies(state, st.attacker), colonies(state, st.defender)]).toEqual([1, 0]);
    expect(events[0]).toMatchObject({
      type: 'battle',
      attackRoll: [5, 3],
      defendRoll: [2],
      attackerLosses: 0,
      defenderLosses: 1,
      conquered: true,
    });
  });

  it('downgrades a conquered starbase to a colony', () => {
    // [5,3] against a starbase die [2] -> 3 after the bonus, still a clear win for the 5.
    const st = stage({ fromFleets: 4, toFleets: 1, toStructure: 'starbase', rolls: WIN_2_VS_1 });
    const { state } = expectOk(run(st, 2));
    expect(state.sectors[st.to]).toMatchObject({ owner: st.attacker, structure: 'colony' });
  });

  it('keeps a merely claimed sector claimed', () => {
    const st = stage({ fromFleets: 4, toFleets: 1, toStructure: 'none', rolls: WIN_2_VS_1 });
    const { state } = expectOk(run(st, 2));
    expect(state.sectors[st.to]).toMatchObject({ owner: st.attacker, structure: 'none' });
  });

  it('moves all but one fleet by default', () => {
    const st = stage({ fromFleets: 4, toFleets: 1, rolls: WIN_2_VS_1 });
    const { state } = expectOk(run(st, 2));
    expect(state.sectors[st.from]?.fleets).toBe(1);
    expect(state.sectors[st.to]?.fleets).toBe(3);
  });

  it('honours moveIfConquered within [dice, fleets-1] and clamps it into that range', () => {
    const st = stage({ fromFleets: 6, toFleets: 1, rolls: WIN_2_VS_1 });
    const moved = (move: number): [number, number] => {
      const { state } = expectOk(run(st, 2, move));
      return [state.sectors[st.from]?.fleets ?? -1, state.sectors[st.to]?.fleets ?? -1];
    };
    expect(moved(3)).toEqual([3, 3]);
    expect(moved(2)).toEqual([4, 2]);
    expect(moved(5)).toEqual([1, 5]);
    expect(moved(1)).toEqual([4, 2]); // below the dice used: raised to 2
    expect(moved(0)).toEqual([4, 2]);
    expect(moved(-7)).toEqual([4, 2]);
    expect(moved(6)).toEqual([1, 5]); // above fleets-1: lowered to 5
    expect(moved(999)).toEqual([1, 5]);
  });

  it('moves everything that can move when fleets-1 equals the dice used', () => {
    const st = stage({ fromFleets: 3, toFleets: 1, rolls: WIN_2_VS_1 });
    const { state } = expectOk(run(st, 2, 1));
    expect(state.sectors[st.from]?.fleets).toBe(1);
    expect(state.sectors[st.to]?.fleets).toBe(2);
  });

  it('conquers a 2-fleet sector with three dice against two', () => {
    const st = stage({
      fromFleets: 6,
      toFleets: 2,
      rolls: [
        [6, 5, 1],
        [3, 2],
      ],
    });
    const { state, events } = expectOk(run(st, 3, 1));
    expect(events[0]).toMatchObject({
      attackRoll: [6, 5, 1],
      defendRoll: [3, 2],
      attackerLosses: 0,
      defenderLosses: 2,
      conquered: true,
    });
    expect(state.sectors[st.to]).toMatchObject({ owner: st.attacker, fleets: 3 });
    expect(state.sectors[st.from]?.fleets).toBe(3);
  });

  it('counts a conquest of an enemy sector, and expanding never counts', () => {
    const st = stage({ fromFleets: 4, toFleets: 1, rolls: WIN_2_VS_1 });
    const { state } = expectOk(run(st, 2));
    expect(playerById(state, st.attacker).conquests).toBe(1);
    expect(playerById(state, st.defender).conquests).toBe(0);

    const base = blankGame();
    const [from, to] = adjacentPair(base);
    const s = owned(base, from, me(base), 4);
    const expanded = expectOk(applyAction(s, me(s), expand(from, to, 2))).state;
    expect(playerById(expanded, me(s)).conquests).toBe(0);
  });

  it('a failed assault does not count as a conquest', () => {
    const st = stage({
      fromFleets: 4,
      toFleets: 3,
      rolls: [
        [2, 6],
        [3, 4],
      ],
    });
    const { state } = expectOk(run(st, 2));
    expect(playerById(state, st.attacker).conquests).toBe(0);
  });

  it('the first conquest of a turn steals one random card from the former owner', () => {
    const st = stage({
      fromFleets: 4,
      toFleets: 1,
      rolls: WIN_2_VS_1,
      defenderCards: { metal: 2, crystal: 1 },
    });
    expect(st.state.conqueredThisTurn).toBe(false);
    const { state, events } = expectOk(run(st, 2));
    expect(events.map((e) => e.type)).toEqual(['battle', 'stolen']);
    const stolen = events[1];
    if (stolen?.type !== 'stolen') throw new Error('expected a stolen event');
    expect(stolen).toMatchObject({ thief: st.attacker, victim: st.defender });
    expect(['metal', 'crystal']).toContain(stolen.resource);
    const taken = stolen.resource as 'metal' | 'crystal';
    expect(playerById(state, st.attacker).resources).toEqual(cards({ [taken]: 1 }));
    expect(playerById(state, st.defender).resources[taken]).toBe(
      playerById(st.state, st.defender).resources[taken] - 1,
    );
    expect(total(state, st.defender)).toBe(2);
    expect(state.conqueredThisTurn).toBe(true);
    expect(state.rng).toBe(rngAfter(st.state.rng, 4)); // three dice, then the steal draw
  });

  it('a second conquest in the same turn steals nothing', () => {
    const first = stage({
      fromFleets: 4,
      toFleets: 1,
      rolls: WIN_2_VS_1,
      defenderCards: { metal: 2 },
    });
    const afterFirst = expectOk(run(first, 2)).state;
    expect(afterFirst.conqueredThisTurn).toBe(true);

    // The conquered sector now holds 3 fleets; a third player's lone fleet stands next to it.
    const next = neighborIds(afterFirst, first.to).find(
      (id) => id !== first.from && afterFirst.sectors[id]?.kind !== 'home',
    ) as SectorId;
    const other = third(afterFirst);
    let s = withSector(afterFirst, next, { owner: other, fleets: 1, structure: 'colony' });
    s = withResources(s, other, cards({ energy: 3 }));
    s = { ...s, rng: seedForDice([6, 4], [1]) };

    const { state, events } = expectOk(
      applyAction(s, first.attacker, attackAction(first.to, next, 2)),
    );
    expect(events.map((e) => e.type)).toEqual(['battle']);
    expect(events[0]).toMatchObject({ conquered: true });
    expect(state.sectors[next]).toMatchObject({ owner: first.attacker, structure: 'colony' });
    expect(total(state, other)).toBe(3);
    expect(total(state, first.attacker)).toBe(total(afterFirst, first.attacker));
    expect(playerById(state, first.attacker).conquests).toBe(2);
    expect(state.conqueredThisTurn).toBe(true);
  });

  it('a conquest from a player with no cards steals nothing but still uses up the turn bonus', () => {
    const st = stage({ fromFleets: 4, toFleets: 1, rolls: WIN_2_VS_1, defenderCards: {} });
    const { state, events } = expectOk(run(st, 2));
    expect(events.map((e) => e.type)).toEqual(['battle']);
    expect(state.conqueredThisTurn).toBe(true);
    expect(total(state, st.attacker)).toBe(0);
  });

  it('a failed assault steals nothing and leaves conqueredThisTurn alone', () => {
    const st = stage({
      fromFleets: 4,
      toFleets: 3,
      rolls: [
        [2, 6],
        [3, 4],
      ],
    });
    const { state, events } = expectOk(run(st, 2));
    expect(events.map((e) => e.type)).toEqual(['battle']);
    expect(total(state, st.attacker)).toBe(0);
    expect(total(state, st.defender)).toBe(4);
    expect(state.conqueredThisTurn).toBe(false);
  });

  it('does not end the turn: the attacker can keep acting', () => {
    const st = stage({ fromFleets: 4, toFleets: 1, rolls: WIN_2_VS_1 });
    const { state } = expectOk(run(st, 2));
    expect(state.phase).toBe('MAIN');
    expect(state.current).toBe(st.state.current);
  });
});

describe('fortify', () => {
  it('moves fleets through a connected chain of owned sectors and ends the turn', () => {
    const base = blankGame();
    const [a, b, c] = line(base, 3) as [SectorId, SectorId, SectorId];
    let s = owned(base, a, me(base), 5);
    s = owned(s, b, me(base), 1);
    s = owned(s, c, me(base), 1);
    const { state, events } = expectOk(applyAction(s, me(s), fortify(a, c, 4)));
    expect(state.sectors[a]?.fleets).toBe(1);
    expect(state.sectors[c]?.fleets).toBe(5);
    expect(state.sectors[b]?.fleets).toBe(1);
    expect(events).toEqual([
      { type: 'fortified', player: me(s), from: a, to: c, count: 4 },
      { type: 'turnStarted', player: foe(s), round: s.round },
    ]);
    expect(state.current).toBe((s.current + 1) % s.players.length);
    expect(state.phase).toBe('HOME_BONUS');
  });

  it('follows a long chain of owned sectors', () => {
    const base = blankGame();
    const ids = line(base, 4);
    let s = base;
    for (const id of ids) s = owned(s, id, me(base), 2);
    const [first, , , last] = ids as [SectorId, SectorId, SectorId, SectorId];
    expectOk(applyAction(s, me(s), fortify(first, last, 1)));
  });

  it('works between two adjacent owned sectors and keeps structures in place', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    let s = withSector(base, from, { owner: me(base), fleets: 3, structure: 'starbase' });
    s = withSector(s, to, { owner: me(base), fleets: 1, structure: 'colony' });
    const { state } = expectOk(applyAction(s, me(s), fortify(from, to, 2)));
    expect(state.sectors[from]).toMatchObject({ fleets: 1, structure: 'starbase' });
    expect(state.sectors[to]).toMatchObject({ fleets: 3, structure: 'colony' });
  });

  it('wraps the round counter when the last seat fortifies', () => {
    const base = blankGame();
    const last = atPhase(
      base,
      'MAIN',
      (base.players[base.players.length - 1] as { id: string }).id,
    );
    const [from, to] = adjacentPair(last);
    let s = owned(last, from, me(last), 3);
    s = owned(s, to, me(last), 1);
    const { state, events } = expectOk(applyAction(s, me(s), fortify(from, to, 1)));
    expect(state.current).toBe(0);
    expect(state.round).toBe(s.round + 1);
    expect(events.map((e) => e.type)).toEqual(['fortified', 'turnStarted']);
  });

  it('is blocked by an enemy sector in the middle with err.notConnected', () => {
    const base = blankGame();
    const [a, b, c] = line(base, 3) as [SectorId, SectorId, SectorId];
    let s = owned(base, a, me(base), 5);
    s = owned(s, b, foe(base), 2);
    s = owned(s, c, me(base), 1);
    expectErr(applyAction(s, me(s), fortify(a, c, 2)), 'err.notConnected');
  });

  it('is blocked by an unowned gap with err.notConnected', () => {
    const base = blankGame();
    const [a, , c] = line(base, 3) as [SectorId, SectorId, SectorId];
    let s = owned(base, a, me(base), 5);
    s = owned(s, c, me(base), 1);
    expectErr(applyAction(s, me(s), fortify(a, c, 2)), 'err.notConnected');
  });

  it('rejects sectors you do not own with err.notOwned', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    const onlyFrom = owned(base, from, me(base), 4);
    expectErr(applyAction(onlyFrom, me(onlyFrom), fortify(from, to, 1)), 'err.notOwned');
    const enemyTo = owned(onlyFrom, to, foe(base), 1);
    expectErr(applyAction(enemyTo, me(enemyTo), fortify(from, to, 1)), 'err.notOwned');
    const onlyTo = owned(base, to, me(base), 4);
    expectErr(applyAction(onlyTo, me(onlyTo), fortify(from, to, 1)), 'err.notOwned');
  });

  it('rejects fortifying a sector onto itself with err.invalidSector', () => {
    const base = blankGame();
    const [from] = adjacentPair(base);
    const s = owned(base, from, me(base), 4);
    expectErr(applyAction(s, me(s), fortify(from, from, 1)), 'err.invalidSector');
  });

  it('rejects counts outside 1..fleets-1 and non-integers with err.invalidCount', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    let s = owned(base, from, me(base), 4);
    s = owned(s, to, me(base), 1);
    for (const count of [0, 4, 9, -1, 2.5, Number.NaN]) {
      expectErr(applyAction(s, me(s), fortify(from, to, count)), 'err.invalidCount');
    }
  });

  it('rejects unknown sector ids, including prototype keys', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    let s = owned(base, from, me(base), 4);
    s = owned(s, to, me(base), 1);
    expectErr(applyAction(s, me(s), fortify('nope', to, 1)), 'err.invalidSector');
    expectErr(applyAction(s, me(s), fortify(from, 'nope', 1)), 'err.invalidSector');
    expectErr(applyAction(s, me(s), fortify('__proto__', to, 1)), 'err.invalidSector');
    expectErr(applyAction(s, me(s), fortify(from, 'constructor', 1)), 'err.invalidSector');
  });

  it('fails outside MAIN and for a non-current player', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    let s = owned(base, from, me(base), 4);
    s = owned(s, to, me(base), 1);
    for (const phase of ['HOME_BONUS', 'ROLL', 'DISCARD', 'PIRATE'] as const) {
      expectErr(applyAction(atPhase(s, phase), me(s), fortify(from, to, 1)), 'err.wrongPhase');
    }
    expectErr(applyAction(s, foe(s), fortify(from, to, 1)), 'err.notYourTurn');
  });

  it('does not mutate the input state', () => {
    const base = blankGame();
    const [from, to] = adjacentPair(base);
    let s = owned(base, from, me(base), 4);
    s = owned(s, to, me(base), 1);
    const snapshot = JSON.stringify(s);
    expectOk(applyAction(s, me(s), fortify(from, to, 2)));
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('maxMovable / maxAttackDice', () => {
  it('maxMovable is fleets-1 and never negative', () => {
    const base = blankGame();
    const [id] = adjacentPair(base);
    for (const [fleets, movable] of [
      [0, 0],
      [1, 0],
      [2, 1],
      [5, 4],
      [12, 11],
    ] as const) {
      expect(maxMovable(withSector(base, id, { fleets }), id)).toBe(movable);
    }
  });

  it('maxAttackDice is min(3, fleets-1), floored at 0', () => {
    const base = blankGame();
    const [id] = adjacentPair(base);
    for (const [fleets, dice] of [
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 3],
      [5, 3],
      [12, 3],
    ] as const) {
      expect(maxAttackDice(withSector(base, id, { fleets }), id)).toBe(dice);
    }
  });

  it('return 0 for an unknown sector and work on a player view', () => {
    const base = blankGame();
    const [id] = adjacentPair(base);
    const s = owned(base, id, me(base), 5);
    expect(maxMovable(s, 'nope')).toBe(0);
    expect(maxAttackDice(s, '__proto__')).toBe(0);
    const view = viewFor(s, me(s));
    expect(maxMovable(view, id)).toBe(4);
    expect(maxAttackDice(view, id)).toBe(3);
  });
});

describe('connectedOwned', () => {
  it('collects the owned sectors linked to the start, the start included', () => {
    const base = blankGame();
    const [a, b, c, d] = line(base, 4) as [SectorId, SectorId, SectorId, SectorId];
    let s = owned(base, a, me(base), 1);
    s = owned(s, b, me(base), 1);
    s = owned(s, c, me(base), 1);
    s = owned(s, d, foe(base), 1);
    expect(connectedOwned(s, me(s), a)).toEqual(new Set([a, b, c]));
    expect(connectedOwned(s, me(s), c)).toEqual(new Set([a, b, c]));
  });

  it('does not cross enemy, unowned or detached sectors', () => {
    const base = blankGame();
    const [a, b, c, d] = line(base, 4) as [SectorId, SectorId, SectorId, SectorId];
    let s = owned(base, a, me(base), 1);
    s = owned(s, b, foe(base), 1);
    s = owned(s, c, me(base), 1);
    s = owned(s, d, me(base), 1);
    expect(connectedOwned(s, me(s), a)).toEqual(new Set([a]));
    expect(connectedOwned(s, me(s), d)).toEqual(new Set([c, d]));
  });

  it('is empty when the start is not owned by that player or does not exist', () => {
    const base = blankGame();
    const [a, b] = adjacentPair(base);
    const s = owned(base, a, me(base), 1);
    expect(connectedOwned(s, me(s), b).size).toBe(0);
    expect(connectedOwned(s, foe(s), a).size).toBe(0);
    expect(connectedOwned(s, me(s), 'nope').size).toBe(0);
    expect(connectedOwned(s, me(s), '__proto__').size).toBe(0);
  });

  it('works on a player view', () => {
    const base = blankGame();
    const [a, b] = adjacentPair(base);
    const s = owned(owned(base, a, me(base), 1), b, me(base), 1);
    expect(connectedOwned(viewFor(s, me(s)), me(s), a)).toEqual(new Set([a, b]));
  });
});
