import {
  applyAction,
  bagTotal,
  clone,
  distance,
  legalActions,
  viewFor,
  type BotLevel,
  type GameState,
  type PlayerId,
  type ResourceBag,
  type Sector,
  type SectorId,
} from '@starhold/engine';
import { describe, expect, it } from 'vitest';
import { attackWinChance, decide } from '../src/index.ts';
import { actorsInOrder, makeState, seededRandom } from './play.ts';

const LEVELS: BotLevel[] = ['easy', 'normal'];

function patchSector(state: GameState, id: SectorId, patch: Partial<Sector>): GameState {
  const next = clone(state);
  const sector = next.sectors[id];
  if (!sector) throw new Error(`unknown sector ${id}`);
  next.sectors[id] = { ...sector, ...patch };
  return next;
}

function withHand(state: GameState, id: PlayerId, resources: ResourceBag): GameState {
  const next = clone(state);
  const player = next.players.find((p) => p.id === id);
  if (!player) throw new Error(`unknown player ${id}`);
  player.resources = { ...resources };
  return next;
}

const bag = (metal = 0, energy = 0, crystal = 0, biomass = 0): ResourceBag => ({
  metal,
  energy,
  crystal,
  biomass,
});

/** MAIN phase with `id` to move. */
function mainFor(state: GameState, id: PlayerId): GameState {
  const next = clone(state);
  next.phase = 'MAIN';
  next.current = next.players.findIndex((p) => p.id === id);
  return next;
}

function decideFor(state: GameState, id: PlayerId, level: BotLevel, seed = 1) {
  return decide(viewFor(state, id), id, level, seededRandom(seed));
}

/** Two adjacent resource sectors (no homes), in the order the map lists them. */
function adjacentPair(state: GameState): [SectorId, SectorId] {
  const ids = state.sectorIds.filter((id) => state.sectors[id]?.kind === 'resource');
  for (const a of ids) {
    for (const b of ids) {
      const ha = (state.sectors[a] as Sector).hex;
      const hb = (state.sectors[b] as Sector).hex;
      if (a !== b && distance(ha, hb) === 1) return [a, b];
    }
  }
  throw new Error('no adjacent resource sectors');
}

function sectorWithNumber(state: GameState, numbers: number[]): Sector {
  const found = state.sectorIds
    .map((id) => state.sectors[id])
    .find(
      (s): s is Sector =>
        s !== undefined &&
        s.kind === 'resource' &&
        s.owner === null &&
        numbers.includes(s.number ?? 0),
    );
  if (!found) throw new Error('no sector with the wanted number');
  return found;
}

describe('decide', () => {
  it('returns null when nothing to do', () => {
    const state = mainFor(makeState(2, 3), 'p1');
    const other = state.players.find((p) => p.id !== 'p1')?.id as string;
    for (const level of LEVELS) {
      expect(decideFor(state, other, level)).toBeNull();
    }
    const done = clone(state);
    done.phase = 'FINISHED';
    for (const level of LEVELS) expect(decideFor(done, 'p1', level)).toBeNull();
    // A discard owed by somebody else is none of my business.
    const discard = clone(state);
    discard.phase = 'DISCARD';
    discard.pendingDiscards = { [other]: 2 };
    expect(decideFor(discard, 'p1', 'normal')).toBeNull();
  });

  it('discards exactly the pending amount', () => {
    for (const level of LEVELS) {
      let state = makeState(3, 5);
      state = withHand(state, 'p2', bag(5, 3, 1, 2));
      state.phase = 'DISCARD';
      state.pendingDiscards = { p2: 5 };
      const action = decideFor(state, 'p2', level);
      expect(action?.type).toBe('discard');
      if (action?.type !== 'discard') continue;
      expect(bagTotal(action.resources)).toBe(5);
      expect(applyAction(state, 'p2', action).ok).toBe(true);
    }
  });

  it('normal bot keeps what the cheapest build needs when discarding', () => {
    let state = makeState(2, 5);
    state = withHand(state, 'p1', bag(1, 1, 1, 1 + 8)); // a colony kit plus 8 spare biomass
    state.phase = 'DISCARD';
    state.pendingDiscards = { p1: 6 };
    const action = decideFor(state, 'p1', 'normal');
    expect(action?.type).toBe('discard');
    if (action?.type !== 'discard') return;
    expect(action.resources).toEqual(bag(0, 0, 0, 6));
  });

  it('normal bot builds a colony when affordable on a 6/8 sector', () => {
    let state = makeState(2, 11);
    const target = sectorWithNumber(state, [6, 8]);
    state = patchSector(state, target.id, { owner: 'p1', fleets: 1, structure: 'none' });
    state = withHand(state, 'p1', bag(1, 1, 1, 1));
    state = mainFor(state, 'p1');
    expect(decideFor(state, 'p1', 'normal')).toEqual({ type: 'buildColony', at: target.id });
  });

  it('normal bot does not attack with win chance < 0.55', () => {
    const [from, to] = adjacentPair(makeState(2, 11));
    let state = patchSector(makeState(2, 11), from, { owner: 'p1', fleets: 2, structure: 'none' });
    state = patchSector(state, to, { owner: 'p2', fleets: 2, structure: 'none' });
    state = withHand(state, 'p1', bag());
    state = mainFor(state, 'p1');
    expect(attackWinChance(1, 2, false)).toBeLessThan(0.55);
    for (let seed = 1; seed <= 20; seed++) {
      expect(decideFor(state, 'p1', 'normal', seed)?.type).not.toBe('attack');
    }
  });

  it('normal bot attacks a lone defender with an overwhelming force', () => {
    const [from, to] = adjacentPair(makeState(2, 11));
    let state = patchSector(makeState(2, 11), from, { owner: 'p1', fleets: 6, structure: 'none' });
    state = patchSector(state, to, { owner: 'p2', fleets: 1, structure: 'colony' });
    state = withHand(state, 'p1', bag());
    state = mainFor(state, 'p1');
    expect(decideFor(state, 'p1', 'normal')).toEqual({ type: 'attack', from, to, dice: 3 });
  });

  it('responds to trade offers: normal accepts a good one, declines a bad one; easy declines', () => {
    let state = makeState(2, 13);
    state = withHand(state, 'p1', bag(2, 0, 0, 0));
    state = withHand(state, 'p2', bag(0, 0, 1, 1));
    state = mainFor(state, 'p1');
    // p1 gives 2 metal for 1 crystal: p2 receives more than it hands over.
    const good = applyAction(state, 'p1', { type: 'offerTrade', give: bag(2), want: bag(0, 0, 1) });
    if (!good.ok) throw new Error(good.error);
    expect(decideFor(good.state, 'p2', 'normal')).toEqual({ type: 'respondTrade', accept: true });
    expect(decideFor(good.state, 'p2', 'easy')).toEqual({ type: 'respondTrade', accept: false });
    // The offerer is never asked to answer its own offer.
    expect(decideFor(good.state, 'p1', 'normal')?.type).not.toBe('respondTrade');

    // 1 metal for crystal + biomass is a clear loss for p2.
    const bad = applyAction(withHand(state, 'p1', bag(1)), 'p1', {
      type: 'offerTrade',
      give: bag(1),
      want: bag(0, 0, 1, 1),
    });
    if (!bad.ok) throw new Error(bad.error);
    expect(decideFor(bad.state, 'p2', 'normal')).toEqual({ type: 'respondTrade', accept: false });
    // Once p2 has answered it has nothing left to do.
    const answered = applyAction(bad.state, 'p2', { type: 'respondTrade', accept: false });
    if (!answered.ok) throw new Error(answered.error);
    expect(decideFor(answered.state, 'p2', 'normal')).toBeNull();
  });

  it('easy bot picks the resource it holds least as its home bonus', () => {
    const state0 = makeState(2, 17);
    const first = state0.players[0]?.id as string;
    const state = withHand(state0, first, bag(3, 2, 0, 4));
    expect(state.phase).toBe('HOME_BONUS');
    expect(decideFor(state, first, 'easy')).toEqual({
      type: 'chooseHomeBonus',
      resource: 'crystal',
    });
  });

  it('easy bot never fortifies and attacks only with 3 dice', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let state = makeState(2, seed);
      const random = seededRandom(seed);
      for (let step = 0; step < 150 && state.phase !== 'FINISHED'; step++) {
        const actor = actorsInOrder(state)[0] as string;
        const action = decide(viewFor(state, actor), actor, 'easy', random);
        if (!action) break;
        expect(action.type).not.toBe('fortify');
        if (action.type === 'attack') expect(action.dice).toBe(3);
        const result = applyAction(state, actor, action);
        if (!result.ok) throw new Error(result.error);
        state = result.state;
      }
    }
  });

  it('bot never returns an action that applyAction rejects (100 random states per level)', () => {
    for (const level of LEVELS) {
      for (let i = 0; i < 100; i++) {
        const players = (2 + (i % 3)) as 2 | 3 | 4;
        const random = seededRandom(i + 1);
        let state = makeState(players, 500 + i);
        // Reach a varied state by letting the bots play a random number of steps.
        const steps = Math.floor(random() * 150);
        for (let s = 0; s < steps && state.phase !== 'FINISHED'; s++) {
          const actor = actorsInOrder(state)[0] as string;
          const action = decide(viewFor(state, actor), actor, level, random);
          if (!action) break;
          const result = applyAction(state, actor, action);
          if (!result.ok) throw new Error(`warm-up ${JSON.stringify(action)}: ${result.error}`);
          state = result.state;
        }
        // Sometimes the mover opens a trade so the responders have something to answer.
        const me = state.players[state.current];
        if (me && state.phase === 'MAIN' && i % 3 === 0) {
          const give = (['metal', 'energy', 'crystal', 'biomass'] as const).find(
            (r) => me.resources[r] > 0,
          );
          if (give) {
            const want = give === 'metal' ? 'energy' : 'metal';
            const offered = applyAction(state, me.id, {
              type: 'offerTrade',
              give: { ...bag(), [give]: 1 },
              want: { ...bag(), [want]: 1 },
            });
            if (offered.ok) state = offered.state;
          }
        }
        for (const p of state.players) {
          const view = viewFor(state, p.id);
          const action = decide(view, p.id, level, seededRandom(i));
          if (!action) continue;
          const result = applyAction(state, p.id, action);
          expect(result.ok, `${level} #${i} ${p.id} ${JSON.stringify(action)}`).toBe(true);
          if (action.type !== 'discard') {
            expect(legalActions(view, p.id)).toContainEqual(action);
          }
        }
      }
    }
  });

  it('decides quickly (normal, mid-game, under 200 ms)', () => {
    let state = makeState(4, 99);
    const random = seededRandom(3);
    let slowest = 0;
    for (let s = 0; s < 400 && state.phase !== 'FINISHED'; s++) {
      const actor = actorsInOrder(state)[0] as string;
      const view = viewFor(state, actor);
      const started = Date.now();
      const action = decide(view, actor, 'normal', random);
      slowest = Math.max(slowest, Date.now() - started);
      if (!action) break;
      const result = applyAction(state, actor, action);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    expect(slowest).toBeLessThan(200);
  });
});

describe('attackWinChance', () => {
  it('matches the dice odds', () => {
    expect(attackWinChance(3, 1, false)).toBeGreaterThan(0.65);
    expect(attackWinChance(1, 2, false)).toBeLessThan(0.3);
  });

  it('is a probability that a starbase bonus lowers and more dice raise', () => {
    for (const att of [1, 2, 3] as const) {
      for (const def of [1, 2] as const) {
        const plain = attackWinChance(att, def, false);
        expect(plain).toBeGreaterThanOrEqual(0);
        expect(plain).toBeLessThanOrEqual(1);
        expect(attackWinChance(att, def, true)).toBeLessThan(plain);
      }
    }
    expect(attackWinChance(3, 2, false)).toBeGreaterThan(attackWinChance(1, 2, false));
  });

  it('matches a hand-computed value', () => {
    // 1 die vs 1 die: the attacker needs a strictly higher roll, 15 of the 36 pairs.
    expect(attackWinChance(1, 1, false)).toBeCloseTo(15 / 36, 10);
  });
});
