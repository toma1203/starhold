import { currentPlayer } from '../state.ts';
import type { ErrorCode, GameState, Phase, PlayerId } from '../types.ts';

/** Fails with `err.wrongPhase` unless the game is in one of the allowed phases. */
export function guardPhase(state: GameState, ...phases: Phase[]): ErrorCode | null {
  return phases.includes(state.phase) ? null : 'err.wrongPhase';
}

/**
 * Standard handler preamble: the acting player must be the current player
 * (`err.notYourTurn`), then the game must be in an allowed phase (`err.wrongPhase`).
 * Returns the error code, or null when the action may proceed.
 */
export function guardTurn(
  state: GameState,
  playerId: PlayerId,
  ...phases: Phase[]
): ErrorCode | null {
  if (currentPlayer(state).id !== playerId) return 'err.notYourTurn';
  return guardPhase(state, ...phases);
}
