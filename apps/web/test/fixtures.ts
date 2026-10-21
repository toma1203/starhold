import { expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { GameEvent, GameState, PlayerId, ResourceBag } from '@starhold/engine';
import type { RoomInfo } from '@starhold/protocol';
import { useGameStore } from '../src/store/gameStore.ts';
import { viewOf } from './mapFixtures.ts';

export * from './mapFixtures.ts';

export const bag = (metal = 0, energy = 0, crystal = 0, biomass = 0): ResourceBag => ({
  metal,
  energy,
  crystal,
  biomass,
});

/** The state with `id`'s hand replaced. */
export function withBag(state: GameState, id: PlayerId, resources: ResourceBag): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, resources } : p)),
  };
}

export interface SeedOptions {
  turnDeadline?: number | null;
  discardDeadline?: number | null;
  version?: number;
  /** Player ids shown as away. */
  afk?: PlayerId[];
  /** Player ids shown as disconnected. */
  offline?: PlayerId[];
  log?: GameEvent[];
  connection?: 'connecting' | 'online' | 'offline';
}

/** Puts a room plus the viewer's game view into the store, as the server would. */
export function seedGame(state: GameState, me: PlayerId, opts: SeedOptions = {}) {
  const sendAction = vi.fn();
  const room: RoomInfo = {
    code: 'ABCDE',
    phase: 'IN_GAME',
    hostId: state.players[0]?.id ?? me,
    seats: state.players.map((p) => ({
      playerId: p.id,
      name: p.name,
      isBot: p.isBot,
      botLevel: p.botLevel,
      connected: !(opts.offline ?? []).includes(p.id),
      afk: (opts.afk ?? []).includes(p.id),
    })),
    settings: { targetVp: state.settings.targetVp, turnSeconds: 90 },
    you: me,
  };
  useGameStore.setState({
    ...useGameStore.getInitialState(),
    locale: 'en',
    connection: opts.connection ?? 'online',
    room,
    game: {
      version: opts.version ?? 1,
      view: viewOf(state, me),
      turnDeadline: opts.turnDeadline ?? null,
      discardDeadline: opts.discardDeadline ?? null,
    },
    log: (opts.log ?? []).map((event, i) => ({ id: i + 1, event })),
    sendAction,
  });
  return { sendAction };
}

/** Same room, a newer game state (a version bump), so open components must follow it. */
export function pushState(state: GameState, me: PlayerId): void {
  const game = useGameStore.getState().game;
  if (game === null) throw new Error('seedGame first');
  useGameStore.setState({ game: { ...game, version: game.version + 1, view: viewOf(state, me) } });
}

/** Appends events to the store's log, as a `game:events` push would. */
export function pushEvents(...events: GameEvent[]): void {
  const log = useGameStore.getState().log;
  const last = log.at(-1)?.id ?? 0;
  useGameStore.setState({
    log: [...log, ...events.map((event, i) => ({ id: last + i + 1, event }))],
  });
}

/** Asserts the spy was called exactly once and returns an assertion on that call's first argument. */
export function sentOnce(spy: Mock) {
  expect(spy).toHaveBeenCalledTimes(1);
  return expect(spy.mock.calls[0]?.[0]);
}
