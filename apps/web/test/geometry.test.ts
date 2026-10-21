import { describe, expect, it } from 'vitest';
import { HEX_DIRECTIONS, hexagon } from '@starhold/engine';
import type { Hex, Sector } from '@starhold/engine';
import {
  MAX_SCALE,
  MIN_SCALE,
  clampTransform,
  hexCorners,
  hexToPixel,
  mapBounds,
  zoomAt,
} from '../src/game/geometry.ts';

const SIZE = 40;

describe('hexToPixel', () => {
  it('puts the origin at (0,0)', () => {
    expect(hexToPixel({ q: 0, r: 0 }, SIZE)).toEqual({ x: 0, y: 0 });
  });

  it('places all six neighbours at distance sqrt(3) * size', () => {
    const origin = hexToPixel({ q: 0, r: 0 }, SIZE);
    for (const d of HEX_DIRECTIONS) {
      const p = hexToPixel(d, SIZE);
      expect(Math.hypot(p.x - origin.x, p.y - origin.y)).toBeCloseTo(Math.sqrt(3) * SIZE, 9);
    }
  });

  it('is pointy-top: (1,0) is straight to the right, (0,1) is down-right', () => {
    const east = hexToPixel({ q: 1, r: 0 }, SIZE);
    expect(east.y).toBeCloseTo(0, 9);
    expect(east.x).toBeGreaterThan(0);
    const southEast = hexToPixel({ q: 0, r: 1 }, SIZE);
    expect(southEast.x).toBeGreaterThan(0);
    expect(southEast.y).toBeCloseTo(1.5 * SIZE, 9);
  });

  it('scales linearly with size', () => {
    const a = hexToPixel({ q: 2, r: -1 }, 10);
    const b = hexToPixel({ q: 2, r: -1 }, 30);
    expect(b.x).toBeCloseTo(a.x * 3, 9);
    expect(b.y).toBeCloseTo(a.y * 3, 9);
  });
});

describe('hexCorners', () => {
  it('returns six x,y pairs, each exactly one size from the centre', () => {
    const points = hexCorners({ x: 10, y: -5 }, SIZE).split(' ');
    expect(points).toHaveLength(6);
    for (const pair of points) {
      const [x, y] = pair.split(',').map(Number) as [number, number];
      expect(Math.hypot(x - 10, y + 5)).toBeCloseTo(SIZE, 2);
    }
  });

  it('has a vertex straight above the centre (pointy-top)', () => {
    const points = hexCorners({ x: 0, y: 0 }, SIZE).split(' ');
    expect(points).toContain(`0,${-SIZE}`);
  });
});

function sectorAt(hex: Hex): Pick<Sector, 'hex'> {
  return { hex };
}

describe('mapBounds', () => {
  it('encloses every corner of every hex', () => {
    const sectors = hexagon(2).map(sectorAt);
    const b = mapBounds(sectors, SIZE);
    for (const s of sectors) {
      const c = hexToPixel(s.hex, SIZE);
      for (const pair of hexCorners(c, SIZE).split(' ')) {
        const [x, y] = pair.split(',').map(Number) as [number, number];
        expect(x).toBeGreaterThanOrEqual(b.minX - 1e-6);
        expect(x).toBeLessThanOrEqual(b.minX + b.width + 1e-6);
        expect(y).toBeGreaterThanOrEqual(b.minY - 1e-6);
        expect(y).toBeLessThanOrEqual(b.minY + b.height + 1e-6);
      }
    }
  });

  it('is tight: one hex is sqrt(3)*size wide and 2*size tall', () => {
    const b = mapBounds([sectorAt({ q: 0, r: 0 })], SIZE);
    expect(b.width).toBeCloseTo(Math.sqrt(3) * SIZE, 6);
    expect(b.height).toBeCloseTo(2 * SIZE, 6);
    expect(b.minX).toBeCloseTo((-Math.sqrt(3) * SIZE) / 2, 6);
    expect(b.minY).toBeCloseTo(-SIZE, 6);
  });

  it('returns an empty box for no sectors', () => {
    expect(mapBounds([], SIZE)).toEqual({ minX: 0, minY: 0, width: 0, height: 0 });
  });
});

describe('zoomAt', () => {
  const bounds = { minX: -100, minY: -100, width: 200, height: 200 };
  const identity = { scale: 1, x: 0, y: 0 };

  it('keeps the world point under the cursor fixed', () => {
    const next = zoomAt(identity, { x: 40, y: -20 }, 2, bounds);
    expect(next.scale).toBe(2);
    // The world point (40,-20) sat at screen (40,-20); after zooming it must still be there.
    expect(next.x + next.scale * 40).toBeCloseTo(40, 9);
    expect(next.y + next.scale * -20).toBeCloseTo(-20, 9);
  });

  it('clamps the scale to 0.6x..3x', () => {
    expect(zoomAt(identity, { x: 0, y: 0 }, 100, bounds).scale).toBe(MAX_SCALE);
    expect(zoomAt(identity, { x: 0, y: 0 }, 0.001, bounds).scale).toBe(MIN_SCALE);
    expect(MIN_SCALE).toBe(0.6);
    expect(MAX_SCALE).toBe(3);
  });

  it('does not move when already at a limit', () => {
    const atMax = { scale: MAX_SCALE, x: -50, y: 30 };
    expect(zoomAt(atMax, { x: 10, y: 10 }, 2, bounds)).toEqual(atMax);
  });
});

describe('clampTransform', () => {
  const bounds = { minX: -100, minY: -100, width: 200, height: 200 };

  it('leaves a transform that keeps the map centre in view alone', () => {
    const tr = { scale: 2, x: 30, y: -40 };
    expect(clampTransform(tr, bounds)).toEqual(tr);
  });

  it('stops the map centre from leaving the view box', () => {
    const far = clampTransform({ scale: 1, x: 5000, y: -5000 }, bounds);
    expect(far.x).toBe(100);
    expect(far.y).toBe(-100);
  });
});
