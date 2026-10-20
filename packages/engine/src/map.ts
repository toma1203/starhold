import { distance, hexId, hexagon, neighbors } from './hex.ts';
import { nextInt, shuffle } from './rng.ts';
import { RESOURCES } from './types.ts';
import type { Hex, Resource, Sector, SectorId } from './types.ts';

export const HOME_POSITIONS: Record<2 | 3 | 4, Hex[]> = {
  2: [
    { q: 0, r: -2 },
    { q: 0, r: 2 },
  ],
  3: [
    { q: 2, r: -3 },
    { q: 1, r: 2 },
    { q: -3, r: 1 },
  ],
  4: [
    { q: 3, r: -1 },
    { q: -1, r: -2 },
    { q: -3, r: 1 },
    { q: 1, r: 2 },
  ],
};

const NUMBER_POOL: readonly number[] = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const TRADE_STATIONS: Record<2 | 3 | 4, number> = { 2: 2, 3: 3, 4: 3 };
const MAX_NUMBER_ATTEMPTS = 1000;
const ORIGIN: Hex = { q: 0, r: 0 };

const isHot = (n: number | undefined): boolean => n === 6 || n === 8;

/** Corner of the radius-3 hexagon: distance 3 with q, r or s equal to 0. */
const isCorner = (h: Hex): boolean =>
  distance(ORIGIN, h) === 3 && (h.q === 0 || h.r === 0 || h.q + h.r === 0);

/** Number of adjacent tile pairs that both carry a 6 or 8. */
function hotPairs(numbers: readonly number[], adjacent: readonly (readonly number[])[]): number {
  let count = 0;
  numbers.forEach((n, i) => {
    if (!isHot(n)) return;
    for (const j of adjacent[i] ?? []) if (j > i && isHot(numbers[j])) count++;
  });
  return count;
}

/** A shuffled number pool of `count` entries (a second shuffled pool is appended if needed). */
function drawNumbers(seed: number, count: number): [number[], number] {
  let s = seed;
  const out: number[] = [];
  while (out.length < count) {
    const [pool, next] = shuffle(s, NUMBER_POOL);
    s = next;
    out.push(...pool);
  }
  return [out.slice(0, count), s];
}

/** Deterministic fallback: swap numbers until no 6/8 pair is adjacent (or no swap helps). */
function repairNumbers(numbers: number[], adjacent: readonly (readonly number[])[]): number[] {
  const out = [...numbers];
  let current = hotPairs(out, adjacent);
  while (current > 0) {
    let improved = false;
    for (let i = 0; i < out.length && current > 0; i++) {
      for (let j = 0; j < out.length && current > 0; j++) {
        if (i === j) continue;
        const a = out[i] as number;
        out[i] = out[j] as number;
        out[j] = a;
        const next = hotPairs(out, adjacent);
        if (next < current) {
          current = next;
          improved = true;
        } else {
          out[j] = out[i] as number;
          out[i] = a;
        }
      }
    }
    if (!improved) break;
  }
  return out;
}

export function generateMap(
  playerCount: 2 | 3 | 4,
  seed: number,
): { sectors: Record<SectorId, Sector>; sectorIds: SectorId[]; homeIds: SectorId[]; seed: number } {
  let s = seed;
  const radius = playerCount === 2 ? 2 : 3;
  const tiles = hexagon(radius).filter((h) => playerCount === 2 || !isCorner(h));
  const homeHexes = HOME_POSITIONS[playerCount];
  const homeIds = homeHexes.map(hexId);

  const kinds = new Map<SectorId, 'nebula' | 'home' | 'resource'>();
  for (const h of tiles) kinds.set(hexId(h), 'resource');
  kinds.set(hexId(ORIGIN), 'nebula');
  for (const id of homeIds) kinds.set(id, 'home');

  if (playerCount > 2) {
    const candidates = tiles.filter(
      (h) =>
        kinds.get(hexId(h)) === 'resource' && homeHexes.every((home) => distance(h, home) >= 2),
    );
    const [pick, next] = nextInt(s, candidates.length);
    s = next;
    kinds.set(hexId(candidates[pick] as Hex), 'nebula');
  }

  const resourceTiles = tiles.filter((h) => kinds.get(hexId(h)) === 'resource');
  const count = resourceTiles.length;

  const balanced: Resource[] = Array.from(
    { length: count },
    (_, i) => RESOURCES[i % RESOURCES.length] as Resource,
  );
  const [resources, afterResources] = shuffle(s, balanced);
  s = afterResources;

  const indexById = new Map(resourceTiles.map((h, i) => [hexId(h), i]));
  const adjacent = resourceTiles.map((h) =>
    neighbors(h)
      .map((nb) => indexById.get(hexId(nb)))
      .filter((i): i is number => i !== undefined),
  );

  let numbers: number[] = [];
  let valid = false;
  for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS && !valid; attempt++) {
    const [drawn, next] = drawNumbers(s, count);
    s = next;
    numbers = drawn;
    valid = hotPairs(numbers, adjacent) === 0;
  }
  if (!valid) numbers = repairNumbers(numbers, adjacent);

  const [stationOrder, afterStations] = shuffle(
    s,
    resourceTiles.map((_, i) => i),
  );
  s = afterStations;
  const stations = new Set(stationOrder.slice(0, TRADE_STATIONS[playerCount]));

  const sectors: Record<SectorId, Sector> = {};
  const sectorIds: SectorId[] = [];
  for (const h of tiles) {
    const id = hexId(h);
    const kind = kinds.get(id) as 'nebula' | 'home' | 'resource';
    const i = indexById.get(id);
    sectors[id] = {
      id,
      hex: { q: h.q, r: h.r },
      kind,
      resource: kind === 'resource' && i !== undefined ? (resources[i] as Resource) : null,
      number: kind === 'resource' && i !== undefined ? (numbers[i] as number) : null,
      tradeStation: i !== undefined && stations.has(i),
      owner: null,
      fleets: 0,
      structure: 'none',
    };
    sectorIds.push(id);
  }

  return { sectors, sectorIds, homeIds, seed: s };
}
