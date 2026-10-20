// mulberry32. The state is a uint32 stored in GameState.rng. All functions are pure.

export function nextRandom(seed: number): [value: number, nextSeed: number] {
  const nextSeed = (seed + 0x6d2b79f5) >>> 0;
  let t = nextSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, nextSeed];
}

export function nextInt(seed: number, maxExclusive: number): [number, number] {
  const [value, nextSeed] = nextRandom(seed);
  return [Math.floor(value * maxExclusive), nextSeed];
}

export function rollDie(seed: number): [1 | 2 | 3 | 4 | 5 | 6, number] {
  const [n, nextSeed] = nextInt(seed, 6);
  return [(n + 1) as 1 | 2 | 3 | 4 | 5 | 6, nextSeed];
}

/** Fisher-Yates; returns a new array and leaves the input untouched. */
export function shuffle<T>(seed: number, items: readonly T[]): [T[], number] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    const [j, next] = nextInt(s, i + 1);
    s = next;
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return [out, s];
}
