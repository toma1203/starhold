import { legalActions } from '@starhold/engine';
import type { Action, PlayerId, PlayerView } from '@starhold/engine';

/** Views are never mutated (every game state is a new object), so results can be kept per view. */
const cache = new WeakMap<PlayerView, Map<PlayerId, Action[]>>();

/** `legalActions` computed once per view and player instead of once per component per render. */
export function legalActionsFor(view: PlayerView, me: PlayerId): Action[] {
  let perPlayer = cache.get(view);
  if (!perPlayer) {
    perPlayer = new Map();
    cache.set(view, perPlayer);
  }
  let actions = perPlayer.get(me);
  if (!actions) {
    actions = legalActions(view, me);
    perPlayer.set(me, actions);
  }
  return actions;
}
