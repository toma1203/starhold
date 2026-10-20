import { describe, expect, it } from 'vitest';
import {
  HEX_DIRECTIONS,
  distance,
  hexId,
  hexagon,
  neighbors,
  parseHexId,
  rotate60,
} from '../src/hex.ts';

describe('hex', () => {
  it('hexagon sizes', () => {
    expect(hexagon(0).length).toBe(1);
    expect(hexagon(2).length).toBe(19);
    expect(hexagon(3).length).toBe(37);
  });

  it('hexagon contains only hexes within the radius, without duplicates', () => {
    const hexes = hexagon(3);
    expect(new Set(hexes.map(hexId)).size).toBe(hexes.length);
    for (const h of hexes) expect(distance({ q: 0, r: 0 }, h)).toBeLessThanOrEqual(3);
  });

  it('has 6 axial directions', () => {
    expect(HEX_DIRECTIONS.length).toBe(6);
  });

  it('neighbors of origin are 6 unique hexes at distance 1', () => {
    const origin = { q: 0, r: 0 };
    const ns = neighbors(origin);
    expect(ns.length).toBe(6);
    expect(new Set(ns.map(hexId)).size).toBe(6);
    for (const n of ns) expect(distance(origin, n)).toBe(1);
  });

  it('distance', () => {
    expect(distance({ q: 3, r: -1 }, { q: -1, r: 3 })).toBe(4);
    expect(distance({ q: 2, r: 2 }, { q: 2, r: 2 })).toBe(0);
  });

  it('rotate60 applied 6 times is identity', () => {
    const h = { q: 2, r: -3 };
    let x = h;
    for (let i = 0; i < 6; i++) x = rotate60(x);
    expect(x).toEqual(h);
    expect(rotate60({ q: 1, r: 0 })).toEqual({ q: 0, r: 1 });
  });

  it('parseHexId(hexId(h)) round-trips including negatives', () => {
    for (const h of [
      { q: 0, r: 0 },
      { q: -2, r: 3 },
      { q: 3, r: -3 },
      { q: -1, r: -1 },
    ]) {
      expect(parseHexId(hexId(h))).toEqual(h);
    }
    expect(hexId({ q: -2, r: 3 })).toBe('-2,3');
  });
});
