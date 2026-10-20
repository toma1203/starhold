import { clone } from '../clone.ts';
import { currentPlayer } from '../state.ts';
import type { HandlerTable } from '../types.ts';
import { guardTurn } from './guard.ts';

export const homeHandlers: HandlerTable = {
  chooseHomeBonus: (state, playerId, action) => {
    if (action.type !== 'chooseHomeBonus') return { ok: false, error: 'err.wrongPhase' };
    const denied = guardTurn(state, playerId, 'HOME_BONUS');
    if (denied) return { ok: false, error: denied };
    const next = clone(state);
    currentPlayer(next).resources[action.resource] += 1;
    next.phase = 'ROLL';
    return {
      ok: true,
      state: next,
      events: [{ type: 'homeBonus', player: playerId, resource: action.resource }],
    };
  },
};
