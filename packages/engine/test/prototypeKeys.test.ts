import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game.ts';
import type { Action, GameState } from '../src/types.ts';
import { atPhase, makeGame } from './helpers.ts';

/** Ids that name something on `Object.prototype`; they must be rejected like any unknown id. */
const PROTO_KEYS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];

function idTakingActions(key: string): Action[] {
  return [
    { type: 'movePirate', to: key },
    { type: 'buildFleet', at: key },
    { type: 'buildColony', at: key },
    { type: 'buildStarbase', at: key },
    { type: 'expand', from: key, to: key, count: 1 },
    { type: 'attack', from: key, to: key, dice: 1 },
    { type: 'fortify', from: key, to: key, count: 1 },
    { type: 'confirmTrade', with: key },
  ];
}

function statesFor(): GameState[] {
  const main = atPhase(makeGame(), 'MAIN');
  const withOffer: GameState = {
    ...main,
    offer: {
      from: 'p1',
      give: { metal: 1, energy: 0, crystal: 0, biomass: 0 },
      want: { metal: 0, energy: 1, crystal: 0, biomass: 0 },
      accepted: ['p2'],
      declined: [],
    },
  };
  return [main, withOffer, atPhase(makeGame(), 'PIRATE')];
}

describe('ids that are Object.prototype keys', () => {
  it.each(PROTO_KEYS)('%s is rejected by every id-taking action and never throws', (key) => {
    for (const state of statesFor()) {
      for (const action of idTakingActions(key)) {
        const current = state.players[state.current]?.id as string;
        let result: ReturnType<typeof applyAction> | undefined;
        expect(() => {
          result = applyAction(state, current, action);
        }, `${action.type} with ${key} in ${state.phase}`).not.toThrow();
        expect(result?.ok, `${action.type} with ${key} in ${state.phase}`).toBe(false);
        if (result && !result.ok) expect(result.error).toMatch(/^err\./);
      }
    }
  });
});
