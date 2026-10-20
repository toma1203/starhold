import { clone } from '../clone.ts';
import { currentPlayer } from '../state.ts';
import type { GameEvent, GameState, HandlerTable } from '../types.ts';
import { guardTurn } from './guard.ts';

export interface Step {
  state: GameState;
  events: GameEvent[];
}

/** Begins the current player's turn. Never mutates `state`. (Task 10 adds winner/round-limit checks.) */
export function startTurn(state: GameState): Step {
  const next = clone(state);
  next.phase = 'HOME_BONUS';
  next.dice = null;
  next.conqueredThisTurn = false;
  next.offer = null;
  return {
    state: next,
    events: [{ type: 'turnStarted', player: currentPlayer(next).id, round: next.round }],
  };
}

/** Moves to the next seat (incrementing the round on wrap-around) and starts its turn. */
export function advanceTurn(state: GameState): Step {
  const next = clone(state);
  next.current = (next.current + 1) % next.players.length;
  if (next.current === 0) next.round += 1;
  return startTurn(next);
}

export const turnHandlers: HandlerTable = {
  endTurn: (state, playerId, action) => {
    if (action.type !== 'endTurn') return { ok: false, error: 'err.wrongPhase' };
    const denied = guardTurn(state, playerId, 'MAIN');
    if (denied) return { ok: false, error: denied };
    const { state: next, events } = advanceTurn(state);
    return { ok: true, state: next, events };
  },
};
