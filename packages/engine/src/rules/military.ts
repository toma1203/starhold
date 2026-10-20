import { clone } from '../clone.ts';
import { resolveBattle } from '../combat.ts';
import { hexId, neighbors } from '../hex.ts';
import { rollDie } from '../rng.ts';
import type { GameEvent, HandlerTable, PlayerId, Sector, SectorId } from '../types.ts';
import type { ReadState } from '../view.ts';
import { guardTurn } from './guard.ts';
import { stealRandom } from './pirates.ts';
import { advanceTurn } from './turn.ts';

/** The sector with this id, or null. Client ids are untrusted, so prototype keys must not resolve. */
function sectorAt(state: ReadState, id: SectorId): Sector | null {
  if (typeof id !== 'string' || !Object.hasOwn(state.sectors, id)) return null;
  return state.sectors[id] ?? null;
}

function adjacent(a: Sector, b: Sector): boolean {
  return neighbors(a.hex).some((hex) => hexId(hex) === b.id);
}

/** Fleets a sector can send elsewhere: everything but the one that has to stay behind. */
export function maxMovable(state: ReadState, sectorId: SectorId): number {
  return Math.max(0, (sectorAt(state, sectorId)?.fleets ?? 0) - 1);
}

/** Most dice an attack from this sector may use: min(3, fleets - 1), 0 when it cannot attack. */
export function maxAttackDice(state: ReadState, sectorId: SectorId): 0 | 1 | 2 | 3 {
  return Math.min(3, maxMovable(state, sectorId)) as 0 | 1 | 2 | 3;
}

/**
 * Every sector `playerId` can reach from `from` by walking through sectors that player owns
 * (`from` included). Empty when `from` does not exist or is not theirs.
 */
export function connectedOwned(
  state: ReadState,
  playerId: PlayerId,
  from: SectorId,
): Set<SectorId> {
  const reached = new Set<SectorId>();
  const start = sectorAt(state, from);
  if (!start || start.owner !== playerId) return reached;
  reached.add(start.id);
  const queue: Sector[] = [start];
  for (let current = queue.shift(); current; current = queue.shift()) {
    for (const hex of neighbors(current.hex)) {
      const id = hexId(hex);
      const sector = state.sectors[id];
      if (sector && sector.owner === playerId && !reached.has(id)) {
        reached.add(id);
        queue.push(sector);
      }
    }
  }
  return reached;
}

/** True for an integer within [min, max]; client numbers are untrusted (NaN, floats, Infinity). */
const inRange = (value: unknown, min: number, max: number): boolean =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

/** Rolls `count` dice in order, threading the seed. */
function rollDice(seed: number, count: number): [dice: number[], seed: number] {
  const dice: number[] = [];
  let s = seed;
  for (let i = 0; i < count; i++) {
    const [die, next] = rollDie(s);
    dice.push(die);
    s = next;
  }
  return [dice, s];
}

const descending = (a: number, b: number): number => b - a;

export const militaryHandlers: HandlerTable = {
  expand: (state, playerId, action) => {
    if (action.type !== 'expand') return { ok: false, error: 'err.wrongPhase' };
    const denied = guardTurn(state, playerId, 'MAIN');
    if (denied) return { ok: false, error: denied };
    const from = sectorAt(state, action.from);
    const to = sectorAt(state, action.to);
    if (!from || !to) return { ok: false, error: 'err.invalidSector' };
    if (from.owner !== playerId) return { ok: false, error: 'err.notOwned' };
    if (!adjacent(from, to)) return { ok: false, error: 'err.notAdjacent' };
    if (to.owner !== null) return { ok: false, error: 'err.invalidSector' };
    const { count } = action;
    if (!inRange(count, 1, maxMovable(state, from.id))) {
      return { ok: false, error: 'err.invalidCount' };
    }
    const next = clone(state);
    const origin = next.sectors[from.id] as Sector;
    const target = next.sectors[to.id] as Sector;
    origin.fleets -= count;
    target.owner = playerId;
    target.fleets = count;
    target.structure = 'none';
    return {
      ok: true,
      state: next,
      events: [{ type: 'expanded', player: playerId, from: from.id, to: to.id, count }],
    };
  },

  attack: (state, playerId, action) => {
    if (action.type !== 'attack') return { ok: false, error: 'err.wrongPhase' };
    const denied = guardTurn(state, playerId, 'MAIN');
    if (denied) return { ok: false, error: denied };
    const from = sectorAt(state, action.from);
    const to = sectorAt(state, action.to);
    if (!from || !to) return { ok: false, error: 'err.invalidSector' };
    if (from.owner !== playerId) return { ok: false, error: 'err.notOwned' };
    if (!adjacent(from, to)) return { ok: false, error: 'err.notAdjacent' };
    if (to.owner === null || to.owner === playerId) {
      return { ok: false, error: 'err.invalidSector' };
    }
    if (to.kind === 'home') return { ok: false, error: 'err.homeProtected' };
    const { dice, moveIfConquered } = action;
    if (!inRange(dice, 1, maxAttackDice(state, from.id))) {
      return { ok: false, error: 'err.invalidDice' };
    }
    if (moveIfConquered !== undefined && !Number.isInteger(moveIfConquered)) {
      return { ok: false, error: 'err.invalidCount' };
    }

    // The attacker's dice are rolled first, then the defender's.
    const defender = to.owner;
    const [attackRolled, afterAttack] = rollDice(state.rng, dice);
    const [defendRolled, rng] = rollDice(afterAttack, Math.min(2, to.fleets));
    const attackRoll = attackRolled.sort(descending);
    const defendRoll = defendRolled.sort(descending);
    const { attackerLosses, defenderLosses } = resolveBattle(
      attackRoll,
      defendRoll,
      to.structure === 'starbase',
    );

    const next = clone(state);
    next.rng = rng;
    const origin = next.sectors[from.id] as Sector;
    const target = next.sectors[to.id] as Sector;
    origin.fleets -= attackerLosses;
    target.fleets -= defenderLosses;
    const conquered = target.fleets === 0;
    const events: GameEvent[] = [
      {
        type: 'battle',
        attacker: playerId,
        defender,
        from: from.id,
        to: to.id,
        attackRoll,
        defendRoll,
        attackerLosses,
        defenderLosses,
        conquered,
      },
    ];
    if (!conquered) return { ok: true, state: next, events };

    // The victor moves in: at least the dice used, at most all but one; the upper bound wins a clash.
    const spare = origin.fleets - 1;
    const moved = Math.min(spare, Math.max(dice, moveIfConquered ?? spare));
    origin.fleets -= moved;
    target.fleets = moved;
    target.owner = playerId;
    if (target.structure === 'starbase') target.structure = 'colony';
    const attacker = next.players.find((p) => p.id === playerId);
    if (attacker) attacker.conquests += 1;
    if (next.conqueredThisTurn) return { ok: true, state: next, events };
    next.conqueredThisTurn = true;
    const steal = stealRandom(next, playerId, defender);
    return { ok: true, state: steal.state, events: [...events, ...steal.events] };
  },

  fortify: (state, playerId, action) => {
    if (action.type !== 'fortify') return { ok: false, error: 'err.wrongPhase' };
    const denied = guardTurn(state, playerId, 'MAIN');
    if (denied) return { ok: false, error: denied };
    const from = sectorAt(state, action.from);
    const to = sectorAt(state, action.to);
    if (!from || !to) return { ok: false, error: 'err.invalidSector' };
    if (from.owner !== playerId || to.owner !== playerId) {
      return { ok: false, error: 'err.notOwned' };
    }
    if (from.id === to.id) return { ok: false, error: 'err.invalidSector' };
    if (!connectedOwned(state, playerId, from.id).has(to.id)) {
      return { ok: false, error: 'err.notConnected' };
    }
    const { count } = action;
    if (!inRange(count, 1, maxMovable(state, from.id))) {
      return { ok: false, error: 'err.invalidCount' };
    }
    const next = clone(state);
    (next.sectors[from.id] as Sector).fleets -= count;
    (next.sectors[to.id] as Sector).fleets += count;
    const fortified: GameEvent = {
      type: 'fortified',
      player: playerId,
      from: from.id,
      to: to.id,
      count,
    };
    const turn = advanceTurn(next); // fortify ends the turn
    return { ok: true, state: turn.state, events: [fortified, ...turn.events] };
  },
};
