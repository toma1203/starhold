import type { Hex, Sector } from '@starhold/engine';

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** Pan (in view-box units) and zoom of the map's inner group. */
export interface Transform {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 0.6;
export const MAX_SCALE = 3;
export const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

const SQRT3 = Math.sqrt(3);

/** Centre of a pointy-top hex with circumradius `size`. */
export function hexToPixel(h: Hex, size: number): Point {
  return { x: size * (SQRT3 * h.q + (SQRT3 / 2) * h.r), y: size * 1.5 * h.r };
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

/** SVG `points` for the six corners of a pointy-top hex, starting at the top vertex. */
export function hexCorners(center: Point, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 90);
    return `${round(center.x + size * Math.cos(angle))},${round(center.y + size * Math.sin(angle))}`;
  }).join(' ');
}

/** Tight box around every hex of the map, corners included. */
export function mapBounds(sectors: Iterable<Pick<Sector, 'hex'>>, size: number): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { hex } of sectors) {
    const c = hexToPixel(hex, size);
    minX = Math.min(minX, c.x - (SQRT3 / 2) * size);
    maxX = Math.max(maxX, c.x + (SQRT3 / 2) * size);
    minY = Math.min(minY, c.y - size);
    maxY = Math.max(maxY, c.y + size);
  }
  if (minX === Infinity) return { minX: 0, minY: 0, width: 0, height: 0 };
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Keeps the map's centre inside the view box so the map can never be dragged out of reach. */
export function clampTransform(tr: Transform, bounds: Bounds): Transform {
  const cx = bounds.minX + bounds.width / 2;
  const cy = bounds.minY + bounds.height / 2;
  const x = clamp(tr.x + tr.scale * cx, bounds.minX, bounds.minX + bounds.width) - tr.scale * cx;
  const y = clamp(tr.y + tr.scale * cy, bounds.minY, bounds.minY + bounds.height) - tr.scale * cy;
  return { scale: tr.scale, x, y };
}

/** Scales by `factor` (clamped to MIN_SCALE..MAX_SCALE) keeping the view-box point `at` fixed. */
export function zoomAt(tr: Transform, at: Point, factor: number, bounds: Bounds): Transform {
  const scale = clamp(tr.scale * factor, MIN_SCALE, MAX_SCALE);
  if (scale === tr.scale) return tr;
  const ratio = scale / tr.scale;
  return clampTransform(
    { scale, x: at.x - (at.x - tr.x) * ratio, y: at.y - (at.y - tr.y) * ratio },
    bounds,
  );
}
