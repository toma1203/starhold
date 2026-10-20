import { clone } from '../clone.ts';
import { checkTargetReached, finishGame, ranking, ROUND_LIMIT } from '../scoring.ts';
import { currentPlayer } from '../state.ts';
import type { GameEvent, GameState, HandlerTable } from '../types.ts';
import { guardTurn } from './guard.ts';

export interface Step {
  state: GameState;
  events: GameEvent[];
}

/**
 * Begins the current player's turn. Never mutates `state`. The game ends here instead (emitting only
 * `gameOver`) if the incoming player already has the target VP, or the round limit has passed.
 */
export function startTurn(state: GameState): Step {
  const reached = checkTargetReached(state);
  if (reached.state.phase === 'FINISHED') return reached;
  if (state.round > ROUND_LIMIT) {
    const [winner] = ranking(state);
    if (winner !== undefined) return finishGame(state, winner, 'roundLimit');
  }
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
