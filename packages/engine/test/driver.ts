import { applyAction } from '../src/game.ts';
import { legalActions } from '../src/legal.ts';
import { nextInt } from '../src/rng.ts';
import { randomDiscard } from '../src/rules/pirates.ts';
import type { Action, GameEvent, GameState, PlayerId } from '../src/types.ts';

export interface RandomStep {
  state: GameState;
  seed: number;
  playerId: PlayerId;
  action: Action;
  events: GameEvent[];
}

/** Who acts next in random play: the first player owing a discard, otherwise the current player. */
export function nextActor(state: GameState): PlayerId {
  if (state.phase === 'DISCARD') {
    const owing = state.players.find((p) => state.pendingDiscards[p.id] !== undefined);
    if (owing) return owing.id;
  }
  const current = state.players[state.current];
  if (!current) throw new Error('invalid current player');
  return current.id;
}

/**
 * One step of seeded random play: discards use `randomDiscard`, everything else is drawn uniformly
 * from `legalActions`. `seed` is the driver's own PRNG state (independent of `state.rng`). Throws if
 * the chosen action is rejected, so every caller also checks "every legal action applies".
 */
export function randomStep(state: GameState, seed: number): RandomStep {
  const playerId = nextActor(state);
  let action: Action;
  let next = seed;
  if (state.phase === 'DISCARD') {
    action = randomDiscard(state, playerId);
  } else {
    const options = legalActions(state, playerId);
    if (options.length === 0) throw new Error(`no legal action for ${playerId} in ${state.phase}`);
    const [index, after] = nextInt(seed, options.length);
    next = after;
    action = options[index] as Action;
  }
  const result = applyAction(state, playerId, action);
  if (!result.ok) {
    throw new Error(`${playerId} ${JSON.stringify(action)} in ${state.phase}: ${result.error}`);
  }
  return { state: result.state, seed: next, playerId, action, events: result.events };
}

/** Plays up to `steps` random actions, stopping early when the game finishes. */
export function playRandom(state: GameState, driverSeed: number, steps: number): GameState {
  let current = state;
  let seed = driverSeed;
  for (let i = 0; i < steps && current.phase !== 'FINISHED'; i++) {
    const step = randomStep(current, seed);
    current = step.state;
    seed = step.seed;
  }
  return current;
}
