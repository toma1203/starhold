import type { BotLevel, PlayerId } from '@starhold/engine';
import { describe, expect, it } from 'vitest';
import { makeState, playGame, seededRandom } from './play.ts';

const GAMES = 200;
const MAX_ACTIONS = 20_000;

describe('bot tournaments', () => {
  it(
    'normal wins at least 70% of 200 seeded 2-player games against easy, and every game ends',
    () => {
      let normalWins = 0;
      for (let i = 0; i < GAMES; i++) {
        const initial = makeState(2, 1000 + i);
        // Seats alternate: normal moves first in even games, second in odd games.
        const [first, second] = initial.players;
        if (!first || !second) throw new Error('expected two players');
        const normalFirst = i % 2 === 0;
        const normalId = normalFirst ? first.id : second.id;
        const levels: Record<PlayerId, BotLevel> = {
          [first.id]: normalFirst ? 'normal' : 'easy',
          [second.id]: normalFirst ? 'easy' : 'normal',
        };
        const { state } = playGame(initial, levels, seededRandom(7 + i), MAX_ACTIONS);
        expect(state.phase, `game ${i} did not finish in ${MAX_ACTIONS} actions`).toBe('FINISHED');
        if (state.winner === normalId) normalWins += 1;
      }
      expect(normalWins / GAMES, `normal won ${normalWins} of ${GAMES}`).toBeGreaterThanOrEqual(
        0.7,
      );
    },
    { timeout: 120_000 },
  );

  it(
    'mixed 3- and 4-player tables always finish',
    () => {
      for (let i = 0; i < 12; i++) {
        const players = (3 + (i % 2)) as 3 | 4;
        const initial = makeState(players, 3000 + i);
        const levels: Record<PlayerId, BotLevel> = {};
        initial.players.forEach((p, seat) => (levels[p.id] = seat % 2 === 0 ? 'normal' : 'easy'));
        const { state } = playGame(initial, levels, seededRandom(40 + i), MAX_ACTIONS);
        expect(state.phase, `table ${i} did not finish in ${MAX_ACTIONS} actions`).toBe('FINISHED');
      }
    },
    { timeout: 120_000 },
  );
  it(
    'normal bots are not pacifists: 40 normal-vs-normal 2-player games see real conquests',
    () => {
      let conquests = 0;
      let attacks = 0;
      for (let i = 0; i < 40; i++) {
        const initial = makeState(2, 5000 + i);
        const levels: Record<PlayerId, BotLevel> = {};
        initial.players.forEach((p) => (levels[p.id] = 'normal'));
        const result = playGame(initial, levels, seededRandom(90 + i), MAX_ACTIONS);
        expect(result.state.phase).toBe('FINISHED');
        attacks += result.attacks;
        conquests += result.state.players.reduce((sum, p) => sum + p.conquests, 0);
      }
      expect(conquests, `${attacks} attacks`).toBeGreaterThanOrEqual(30);
    },
    { timeout: 120_000 },
  );
});
