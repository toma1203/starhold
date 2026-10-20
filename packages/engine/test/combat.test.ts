import { describe, expect, it } from 'vitest';
import { resolveBattle } from '../src/combat.ts';

describe('resolveBattle', () => {
  it('[6,5,1] vs [6,4]: the tie on the highest die costs the attacker, the 5 beats the 4', () => {
    expect(resolveBattle([6, 5, 1], [6, 4], false)).toEqual({
      attackerLosses: 1,
      defenderLosses: 1,
    });
  });

  it('[3] vs [2,2]: one comparison, the attacker wins it', () => {
    expect(resolveBattle([3], [2, 2], false)).toEqual({ attackerLosses: 0, defenderLosses: 1 });
  });

  it('[5,5] vs [5]: a tie goes to the defender', () => {
    expect(resolveBattle([5, 5], [5], false)).toEqual({ attackerLosses: 1, defenderLosses: 0 });
  });

  it('sorts both sides descending before pairing, whatever order they were rolled in', () => {
    expect(resolveBattle([1, 5, 6], [4, 6], false)).toEqual({
      attackerLosses: 1,
      defenderLosses: 1,
    });
    expect(resolveBattle([2, 6], [3, 4], false)).toEqual({ attackerLosses: 1, defenderLosses: 1 });
  });

  it('the starbase bonus (+1 on the defender highest die) turns [5] vs [4] into an attacker loss', () => {
    expect(resolveBattle([5], [4], false)).toEqual({ attackerLosses: 0, defenderLosses: 1 });
    expect(resolveBattle([5], [4], true)).toEqual({ attackerLosses: 1, defenderLosses: 0 });
  });

  it('the bonus lands on the defender highest die only, after sorting', () => {
    // [3,6] sorts to [6,3] and becomes [7,3]: 6 loses to 7, 4 beats 3. A bonus on the unsorted
    // first die or on the lowest die would give [6,4] and cost the attacker both comparisons.
    expect(resolveBattle([6, 4], [3, 6], true)).toEqual({ attackerLosses: 1, defenderLosses: 1 });
    expect(resolveBattle([5, 4], [3, 6], true)).toEqual({ attackerLosses: 1, defenderLosses: 1 });
  });

  it('[5] vs [5] is an attacker loss with or without the bonus', () => {
    expect(resolveBattle([5], [5], false)).toEqual({ attackerLosses: 1, defenderLosses: 0 });
    expect(resolveBattle([5], [5], true)).toEqual({ attackerLosses: 1, defenderLosses: 0 });
  });

  it('does not mutate or reorder its input arrays', () => {
    const attack = [1, 5, 3];
    const defend = [2, 6];
    resolveBattle(attack, defend, true);
    expect(attack).toEqual([1, 5, 3]);
    expect(defend).toEqual([2, 6]);
  });

  it('an empty side means no comparisons and no losses, bonus or not', () => {
    expect(resolveBattle([6, 6], [], false)).toEqual({ attackerLosses: 0, defenderLosses: 0 });
    expect(resolveBattle([6, 6], [], true)).toEqual({ attackerLosses: 0, defenderLosses: 0 });
    expect(resolveBattle([], [3], false)).toEqual({ attackerLosses: 0, defenderLosses: 0 });
  });

  it('losses are never negative, never exceed min(len), and always sum to min(len)', () => {
    const dice = (n: number): number[][] =>
      n === 0
        ? [[]]
        : dice(n - 1).flatMap((rest) => [1, 2, 3, 4, 5, 6].map((face) => [face, ...rest]));
    const violations: string[] = [];
    for (let a = 1; a <= 3; a++) {
      for (let d = 1; d <= 2; d++) {
        for (const attack of dice(a)) {
          for (const defend of dice(d)) {
            for (const bonus of [false, true]) {
              const { attackerLosses, defenderLosses } = resolveBattle(attack, defend, bonus);
              const valid =
                attackerLosses >= 0 &&
                defenderLosses >= 0 &&
                attackerLosses + defenderLosses === Math.min(a, d);
              if (!valid) violations.push(`[${attack}] vs [${defend}] bonus=${bonus}`);
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
