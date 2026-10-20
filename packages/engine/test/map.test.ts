import { describe, expect, it } from 'vitest';
import { distance, hexId, neighbors } from '../src/hex.ts';
import { HOME_POSITIONS, generateMap } from '../src/map.ts';
import { RESOURCES } from '../src/types.ts';
import type { Resource, Sector } from '../src/types.ts';

const COUNTS = [2, 3, 4] as const;
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const ORIGIN = { q: 0, r: 0 };

const SECTOR_COUNT = { 2: 19, 3: 31, 4: 31 } as const;
const NEBULA_COUNT = { 2: 1, 3: 2, 4: 2 } as const;
const STATION_COUNT = { 2: 2, 3: 3, 4: 3 } as const;

function forEachMap(
  check: (map: ReturnType<typeof generateMap>, sectors: Sector[], n: 2 | 3 | 4) => void,
): void {
  for (const n of COUNTS) {
    for (const seed of SEEDS) {
      const map = generateMap(n, seed);
      check(map, Object.values(map.sectors), n);
    }
  }
}

describe('generateMap', () => {
  it('sector count is 19/31/31', () => {
    forEachMap((map, sectors, n) => {
      expect(sectors.length).toBe(SECTOR_COUNT[n]);
      expect(map.sectorIds.length).toBe(SECTOR_COUNT[n]);
      expect(new Set(map.sectorIds).size).toBe(map.sectorIds.length);
      for (const id of map.sectorIds) expect(map.sectors[id]?.id).toBe(id);
    });
  });

  it('uses radius 2 for 2p and radius 3 minus corners for 3-4p', () => {
    forEachMap((_map, sectors, n) => {
      const radius = n === 2 ? 2 : 3;
      for (const s of sectors) {
        expect(distance(ORIGIN, s.hex)).toBeLessThanOrEqual(radius);
        if (n > 2) {
          const sCoord = -s.hex.q - s.hex.r;
          const isCorner =
            distance(ORIGIN, s.hex) === 3 && (s.hex.q === 0 || s.hex.r === 0 || sCoord === 0);
          expect(isCorner).toBe(false);
        }
      }
    });
  });

  it('centre 0,0 is nebula', () => {
    forEachMap((map) => {
      expect(map.sectors['0,0']?.kind).toBe('nebula');
    });
  });

  it('nebula count is 1/2/2', () => {
    forEachMap((_map, sectors, n) => {
      expect(sectors.filter((s) => s.kind === 'nebula').length).toBe(NEBULA_COUNT[n]);
    });
  });

  it('extra nebula is at distance >= 2 from every home', () => {
    forEachMap((map, sectors) => {
      for (const s of sectors.filter((x) => x.kind === 'nebula' && x.id !== '0,0')) {
        for (const h of map.homeIds) {
          expect(distance(s.hex, (map.sectors[h] as Sector).hex)).toBeGreaterThanOrEqual(2);
        }
      }
    });
  });

  it('home count equals player count and homes are pairwise non-adjacent', () => {
    forEachMap((map, sectors, n) => {
      expect(map.homeIds.length).toBe(n);
      expect(sectors.filter((s) => s.kind === 'home').length).toBe(n);
      expect(map.homeIds).toEqual(HOME_POSITIONS[n].map(hexId));
      for (const a of map.homeIds) {
        for (const b of map.homeIds) {
          if (a === b) continue;
          expect(
            distance((map.sectors[a] as Sector).hex, (map.sectors[b] as Sector).hex),
          ).toBeGreaterThan(1);
        }
      }
    });
  });

  it('every home is at distance 2 (2p) or 3 (3-4p) from centre', () => {
    forEachMap((map, _sectors, n) => {
      for (const id of map.homeIds) {
        expect(distance(ORIGIN, (map.sectors[id] as Sector).hex)).toBe(n === 2 ? 2 : 3);
      }
    });
  });

  it('homes and nebulae carry no resource or number; everything starts unowned', () => {
    forEachMap((_map, sectors) => {
      for (const s of sectors) {
        expect(s.owner).toBeNull();
        expect(s.fleets).toBe(0);
        expect(s.structure).toBe('none');
        if (s.kind !== 'resource') {
          expect(s.resource).toBeNull();
          expect(s.number).toBeNull();
          expect(s.tradeStation).toBe(false);
        }
      }
    });
  });

  it('resource counts differ by at most 1', () => {
    forEachMap((_map, sectors) => {
      const counts = new Map<Resource, number>(RESOURCES.map((r) => [r, 0]));
      for (const s of sectors) {
        if (s.kind === 'resource')
          counts.set(s.resource as Resource, (counts.get(s.resource as Resource) ?? 0) + 1);
      }
      const values = [...counts.values()];
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
    });
  });

  it('every resource sector has a number in 2..12 except 7', () => {
    forEachMap((_map, sectors) => {
      for (const s of sectors.filter((x) => x.kind === 'resource')) {
        expect(s.resource).not.toBeNull();
        expect(s.number).not.toBeNull();
        expect(s.number).toBeGreaterThanOrEqual(2);
        expect(s.number).toBeLessThanOrEqual(12);
        expect(s.number).not.toBe(7);
      }
    });
  });

  it('no two adjacent sectors are both in {6,8}', () => {
    forEachMap((map, sectors) => {
      const hot = (s: Sector | undefined): boolean => s?.number === 6 || s?.number === 8;
      for (const s of sectors.filter(hot)) {
        for (const nb of neighbors(s.hex)) {
          expect(hot(map.sectors[hexId(nb)])).toBe(false);
        }
      }
    });
  });

  it('trade station count is 2/3/3 and only on resource sectors', () => {
    forEachMap((_map, sectors, n) => {
      const stations = sectors.filter((s) => s.tradeStation);
      expect(stations.length).toBe(STATION_COUNT[n]);
      for (const s of stations) expect(s.kind).toBe('resource');
    });
  });

  it('same seed gives identical map', () => {
    for (const n of COUNTS) {
      expect(generateMap(n, 42)).toEqual(generateMap(n, 42));
    }
  });

  it('different seeds give different maps (seed 1 vs 2)', () => {
    for (const n of COUNTS) {
      expect(generateMap(n, 1).sectors).not.toEqual(generateMap(n, 2).sectors);
    }
  });

  it('returns an advanced rng seed', () => {
    for (const n of COUNTS) expect(generateMap(n, 7).seed).not.toBe(7);
  });
});
