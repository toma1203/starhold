import {
  applyAction,
  createGame,
  nextRandom,
  viewFor,
  type Action,
  type BotLevel,
  type GameState,
  type PlayerId,
  type SeatConfig,
} from '@starhold/engine';
import { decide } from '../src/index.ts';

/** Seeded PRNG for bots (mulberry32 via the engine's pure generator); no Math.random in tests. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    const [value, next] = nextRandom(state);
    state = next;
    return value;
  };
}

export function makeState(players: 2 | 3 | 4, seed: number, targetVp: 6 | 8 | 10 = 8): GameState {
  const seats: SeatConfig[] = Array.from({ length: players }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    isBot: true,
    botLevel: 'normal',
  }));
  return createGame({ seats, targetVp }, seed);
}

/** Whoever must act: pending discarders first, then trade responders, then the current player. */
export function actorsInOrder(state: GameState): PlayerId[] {
  const discarders = state.players.filter((p) => state.pendingDiscards[p.id] !== undefined);
  const current = state.players[state.current];
  if (state.phase === 'DISCARD') return discarders.map((p) => p.id);
  const others = state.players.filter((p) => p.id !== current?.id).map((p) => p.id);
  return state.offer ? [...others, ...(current ? [current.id] : [])] : current ? [current.id] : [];
}

export interface Step {
  playerId: PlayerId;
  action: Action;
}

/** Asks `decide` (on a view only) for the first player with something to do, and applies it. */
export function stepGame(
  state: GameState,
  levels: Record<PlayerId, BotLevel>,
  random: () => number,
): { state: GameState; step: Step } | null {
  for (const playerId of actorsInOrder(state)) {
    const action = decide(viewFor(state, playerId), playerId, levels[playerId] ?? 'easy', random);
    if (!action) continue;
    const result = applyAction(state, playerId, action);
    if (!result.ok) {
      throw new Error(`${playerId} ${JSON.stringify(action)} rejected: ${result.error}`);
    }
    return { state: result.state, step: { playerId, action } };
  }
  return null;
}

export interface GameResult {
  state: GameState;
  actions: number;
}

export function playGame(
  initial: GameState,
  levels: Record<PlayerId, BotLevel>,
  random: () => number,
  maxActions = 20_000,
): GameResult {
  let state = initial;
  let actions = 0;
  while (state.phase !== 'FINISHED' && actions < maxActions) {
    const next = stepGame(state, levels, random);
    if (!next) throw new Error(`nobody can act in phase ${state.phase}`);
    state = next.state;
    actions += 1;
  }
  return { state, actions };
}
