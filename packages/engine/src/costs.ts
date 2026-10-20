import type { ResourceBag } from './types.ts';
import { RESOURCES } from './types.ts';

export const COSTS: Record<'fleet' | 'colony' | 'starbase', ResourceBag> = {
  fleet: { metal: 1, energy: 1, crystal: 0, biomass: 0 },
  colony: { metal: 1, energy: 1, crystal: 1, biomass: 1 },
  starbase: { metal: 3, energy: 0, crystal: 2, biomass: 0 },
};

export const emptyBag = (): ResourceBag => ({ metal: 0, energy: 0, crystal: 0, biomass: 0 });

export const bagTotal = (b: ResourceBag): number => RESOURCES.reduce((sum, r) => sum + b[r], 0);

export const hasAtLeast = (have: ResourceBag, need: ResourceBag): boolean =>
  RESOURCES.every((r) => have[r] >= need[r]);

export const addBag = (a: ResourceBag, b: ResourceBag): ResourceBag => ({
  metal: a.metal + b.metal,
  energy: a.energy + b.energy,
  crystal: a.crystal + b.crystal,
  biomass: a.biomass + b.biomass,
});

export const subBag = (a: ResourceBag, b: ResourceBag): ResourceBag => ({
  metal: a.metal - b.metal,
  energy: a.energy - b.energy,
  crystal: a.crystal - b.crystal,
  biomass: a.biomass - b.biomass,
});

/** Production probability weight: 6 - |7-n|; 0 for null or 7. */
export const numberWeight = (n: number | null): number =>
  n === null || n === 7 ? 0 : 6 - Math.abs(7 - n);
