import type { GameState, PlayerId, PlayerState, Sector } from './types.ts';
import type { PublicPlayer, ReadState } from './view.ts';

/** The player type a given state shape exposes: full state -> PlayerState, view -> PublicPlayer. */
export type PlayerOf<S extends ReadState> = S extends GameState ? PlayerState : PublicPlayer;

export function currentPlayer<S extends ReadState>(state: S): PlayerOf<S> {
  const player = state.players[state.current];
  if (!player) throw new Error('invalid current player');
  return player as PlayerOf<S>;
}

export function playerById<S extends ReadState>(state: S, id: PlayerId): PlayerOf<S> {
  const player = (state.players as ReadonlyArray<PlayerState | PublicPlayer>).find(
    (p) => p.id === id,
  );
  if (!player) throw new Error(`unknown player ${id}`);
  return player as PlayerOf<S>;
}

export function ownedSectors(state: ReadState, id: PlayerId): Sector[] {
  return state.sectorIds.flatMap((sid) => {
    const sector = state.sectors[sid];
    return sector && sector.owner === id ? [sector] : [];
  });
}
