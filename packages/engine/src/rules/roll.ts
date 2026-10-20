import { clone } from '../clone.ts';
import { addBag, emptyBag } from '../costs.ts';
import { rollDie } from '../rng.ts';
import { playerById } from '../state.ts';
import type { GameEvent, GameState, HandlerTable, PlayerId, ResourceBag } from '../types.ts';
import { guardTurn } from './guard.ts';
import { beginPirates } from './pirates.ts';

/** Resources each player gains when `sum` is rolled; players who gain nothing are omitted. */
export function productionFor(state: GameState, sum: number): Record<PlayerId, ResourceBag> {
  const gains: Record<PlayerId, ResourceBag> = {};
  for (const id of state.sectorIds) {
    const sector = state.sectors[id];
    if (!sector || sector.number !== sum || sector.resource === null) continue;
    if (sector.owner === null || state.pirate === id) continue;
    const amount = sector.structure === 'none' ? 1 : 2;
    const bag = gains[sector.owner] ?? emptyBag();
    bag[sector.resource] += amount;
    gains[sector.owner] = bag;
  }
  return gains;
}

export const rollHandlers: HandlerTable = {
  roll: (state, playerId, action) => {
    if (action.type !== 'roll') return { ok: false, error: 'err.wrongPhase' };
    const denied = guardTurn(state, playerId, 'ROLL');
    if (denied) return { ok: false, error: denied };
    const next = clone(state);
    const [d1, r1] = rollDie(next.rng);
    const [d2, r2] = rollDie(r1);
    next.rng = r2;
    next.dice = [d1, d2];
    const events: GameEvent[] = [{ type: 'diceRolled', player: playerId, dice: [d1, d2] }];
    if (d1 + d2 === 7) {
      const pirates = beginPirates(next);
      return { ok: true, state: pirates.state, events: [...events, ...pirates.events] };
    }
    next.phase = 'MAIN';
    const gains = productionFor(next, d1 + d2);
    for (const [id, bag] of Object.entries(gains)) {
      const player = playerById(next, id);
      player.resources = addBag(player.resources, bag);
    }
    if (Object.keys(gains).length > 0) events.push({ type: 'produced', gains });
    return { ok: true, state: next, events };
  },
};
