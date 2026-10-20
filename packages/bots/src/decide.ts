import { legalActions } from '@starhold/engine';
import type { Action, BotLevel, PlayerId, PlayerView } from '@starhold/engine';
import { chooseEasy, easyDiscard } from './easy.ts';
import { chooseNormal, chooseResponse, normalDiscard } from './normal.ts';

/**
 * The bot's next action, or null when it has nothing to do. Reads only the player's view.
 * Priority: owed discard, then an open trade offer to answer, then its own turn.
 */
export function decide(
  view: PlayerView,
  me: PlayerId,
  level: BotLevel,
  random: () => number,
): Action | null {
  if (view.phase === 'FINISHED') return null;

  const owed = view.pendingDiscards[me];
  if (view.phase === 'DISCARD') {
    if (owed === undefined) return null;
    return level === 'easy' ? easyDiscard(view, me, owed, random) : normalDiscard(view, me, owed);
  }

  if (view.offer !== null && view.offer.from !== me) {
    const answers = legalActions(view, me).filter((a) => a.type === 'respondTrade');
    if (answers.length > 0) {
      return level === 'easy' ? { type: 'respondTrade', accept: false } : chooseResponse(view, me);
    }
  }

  if (view.players[view.current]?.id !== me) return null;
  return level === 'easy' ? chooseEasy(view, me, random) : chooseNormal(view, me, random);
}
