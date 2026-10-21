import { decide } from '@starhold/bots';
import {
  legalActions,
  randomDiscard,
  viewFor,
  type Action,
  type BotLevel,
  type GameState,
  type PlayerId,
} from '@starhold/engine';

export function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ');
}

/**
 * What a bot-controlled seat may play, best first: the AI's choice, then safe fallbacks
 * (evaluated lazily, so a good choice costs nothing extra). A throwing `decide` is reported
 * through `warn` and skipped.
 */
export function* botCandidates(
  state: GameState,
  id: PlayerId,
  level: BotLevel,
  warn: (message: string) => void,
): Generator<Action> {
  try {
    const chosen = decide(viewFor(state, id), id, level, Math.random);
    if (chosen) yield chosen;
  } catch (error) {
    warn(`bot decision failed: ${errorText(error)}`);
  }
  if (state.phase === 'DISCARD') {
    yield randomDiscard(state, id);
    return;
  }
  const isCurrent = state.players[state.current]?.id === id;
  if (state.offer && !isCurrent) {
    yield { type: 'respondTrade', accept: false };
    return;
  }
  const legal = legalActions(state, id);
  if (legal.some((a) => a.type === 'endTurn')) yield { type: 'endTurn' };
  yield* legal;
}
