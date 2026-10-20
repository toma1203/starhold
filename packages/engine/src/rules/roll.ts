import { clone } from '../clone.ts';
import { addBag, emptyBag } from '../costs.ts';
import { rollDie } from '../rng.ts';
import { currentPlayer, playerById } from '../state.ts';
import type { GameEvent, GameState, HandlerTable, PlayerId, ResourceBag } from '../types.ts';

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
    if (currentPlayer(state).id !== playerId) return { ok: false, error: 'err.notYourTurn' };
    if (state.phase !== 'ROLL') return { ok: false, error: 'err.wrongPhase' };
    const next = clone(state);
    const [d1, r1] = rollDie(next.rng);
    const [d2, r2] = rollDie(r1);
    next.rng = r2;
    next.dice = [d1, d2];
    const events: GameEvent[] = [{ type: 'diceRolled', player: playerId, dice: [d1, d2] }];
    next.phase = 'MAIN';
    if (d1 + d2 === 7) {
      // Task 6: beginPirates
      return { ok: true, state: next, events };
    }
    const gains = productionFor(next, d1 + d2);
    for (const [id, bag] of Object.entries(gains)) {
      const player = playerById(next, id);
      player.resources = addBag(player.resources, bag);
    }
    if (Object.keys(gains).length > 0) events.push({ type: 'produced', gains });
    return { ok: true, state: next, events };
  },
};
