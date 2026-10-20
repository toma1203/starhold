import type { Hex, SectorId } from './types.ts';

export const hexId = (h: Hex): SectorId => `${h.q},${h.r}`;

export const parseHexId = (id: SectorId): Hex => {
  const [q, r] = id.split(',').map(Number);
  return { q: q as number, r: r as number };
};

export const HEX_DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function neighbors(h: Hex): Hex[] {
  return HEX_DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

export function distance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** All hexes with distance(origin) <= radius. */
export function hexagon(radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) out.push({ q, r });
  }
  return out;
}

/** 60-degree rotation about the origin: (q,r) -> (-r, q+r). */
export function rotate60(h: Hex): Hex {
  return { q: 0 - h.r, r: h.q + h.r }; // 0 - r (not -r) avoids producing -0
}
