import { clone } from './clone.ts';
import { bagTotal } from './costs.ts';
import type { GameEvent, GameState, PlayerId, PlayerState, ResourceBag } from './types.ts';

export interface PublicPlayer extends Omit<PlayerState, 'resources'> {
  resources: ResourceBag | null;
  cardCount: number;
}

export interface PlayerView extends Omit<GameState, 'players' | 'rng'> {
  me: PlayerId | null;
  players: PublicPlayer[];
}

/** Anything read-only helpers can inspect: the full state (server, bots) or a player's view (clients). */
export type ReadState = GameState | PlayerView;

export function viewFor(state: GameState, me: PlayerId | null): PlayerView {
  const { players, ...rest } = clone(state);
  const publicState: Omit<typeof rest, 'rng'> & { rng?: number } = rest;
  delete publicState.rng; // the seed must never reach clients
  return {
    ...publicState,
    me,
    players: players.map(({ resources, ...player }) => ({
      ...player,
      resources: player.id === me ? resources : null,
      cardCount: bagTotal(resources),
    })),
  };
}

export function filterEventsFor(events: GameEvent[], me: PlayerId | null): GameEvent[] {
  return events.map((event) =>
    event.type === 'stolen' && me !== event.thief && me !== event.victim
      ? { ...event, resource: null }
      : event,
  );
}
