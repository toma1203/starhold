import { describe, expect, it } from 'vitest';
import { nextInt, nextRandom, rollDie, shuffle } from '../src/rng.ts';

function sequence(seed: number, n: number): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    const [v, next] = nextRandom(s);
    out.push(v);
    s = next;
  }
  return out;
}

describe('rng', () => {
  it('produces an identical 1000-value sequence for the same seed', () => {
    expect(sequence(12345, 1000)).toEqual(sequence(12345, 1000));
  });

  it('produces different sequences for different seeds', () => {
    expect(sequence(1, 20)).not.toEqual(sequence(2, 20));
  });

  it('nextRandom values are in [0,1)', () => {
    for (const v of sequence(7, 1000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextRandom returns a uint32 next seed', () => {
    const [, next] = nextRandom(99);
    expect(Number.isInteger(next)).toBe(true);
    expect(next).toBeGreaterThanOrEqual(0);
    expect(next).toBeLessThan(2 ** 32);
  });

  it('nextInt stays within [0,max)', () => {
    let s = 5;
    for (let i = 0; i < 500; i++) {
      const [v, next] = nextInt(s, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      s = next;
    }
  });

  it('rollDie hits each face 800-1200 times over 6000 rolls from seed 1', () => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    let s = 1;
    for (let i = 0; i < 6000; i++) {
      const [face, next] = rollDie(s);
      counts[face] = (counts[face] ?? 0) + 1;
      s = next;
    }
    for (let face = 1; face <= 6; face++) {
      expect(counts[face]).toBeGreaterThanOrEqual(800);
      expect(counts[face]).toBeLessThanOrEqual(1200);
    }
    expect(counts[0]).toBe(0);
  });

  it('shuffle is a permutation, does not mutate input, and is deterministic per seed', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const copy = [...items];
    const [a, nextA] = shuffle(42, items);
    const [b, nextB] = shuffle(42, items);
    expect(items).toEqual(copy);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
    expect(a).toEqual(b);
    expect(nextA).toBe(nextB);
    const [c] = shuffle(43, items);
    expect(c).not.toEqual(a);
  });
});
