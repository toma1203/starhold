import { clone } from '../clone.ts';
import { currentPlayer } from '../state.ts';
import type { HandlerTable } from '../types.ts';

export const homeHandlers: HandlerTable = {
  chooseHomeBonus: (state, playerId, action) => {
    if (action.type !== 'chooseHomeBonus') return { ok: false, error: 'err.wrongPhase' };
    if (currentPlayer(state).id !== playerId) return { ok: false, error: 'err.notYourTurn' };
    if (state.phase !== 'HOME_BONUS') return { ok: false, error: 'err.wrongPhase' };
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
