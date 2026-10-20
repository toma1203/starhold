import { describe, expect, it } from 'vitest';
import {
  COSTS,
  addBag,
  bagTotal,
  emptyBag,
  hasAtLeast,
  numberWeight,
  subBag,
} from '../src/costs.ts';
import { RESOURCES } from '../src/types.ts';

describe('costs', () => {
  it('cost tables', () => {
    expect(COSTS.fleet).toEqual({ metal: 1, energy: 1, crystal: 0, biomass: 0 });
    expect(COSTS.colony).toEqual({ metal: 1, energy: 1, crystal: 1, biomass: 1 });
    expect(COSTS.starbase).toEqual({ metal: 3, energy: 0, crystal: 2, biomass: 0 });
  });

  it('RESOURCES lists the four resources', () => {
    expect([...RESOURCES]).toEqual(['metal', 'energy', 'crystal', 'biomass']);
  });

  it('emptyBag returns a fresh zeroed bag', () => {
    const a = emptyBag();
    expect(a).toEqual({ metal: 0, energy: 0, crystal: 0, biomass: 0 });
    a.metal = 5;
    expect(emptyBag().metal).toBe(0);
  });

  it('bagTotal', () => {
    expect(bagTotal({ metal: 1, energy: 2, crystal: 3, biomass: 4 })).toBe(10);
  });

  it('hasAtLeast', () => {
    const have = { metal: 3, energy: 1, crystal: 2, biomass: 0 };
    expect(hasAtLeast(have, COSTS.starbase)).toBe(true);
    expect(hasAtLeast(have, COSTS.colony)).toBe(false);
    expect(hasAtLeast(have, emptyBag())).toBe(true);
  });

  it('addBag and subBag are pure', () => {
    const a = { metal: 3, energy: 1, crystal: 2, biomass: 0 };
    const b = { metal: 1, energy: 1, crystal: 1, biomass: 0 };
    expect(addBag(a, b)).toEqual({ metal: 4, energy: 2, crystal: 3, biomass: 0 });
    expect(subBag(a, b)).toEqual({ metal: 2, energy: 0, crystal: 1, biomass: 0 });
    expect(a).toEqual({ metal: 3, energy: 1, crystal: 2, biomass: 0 });
    expect(b).toEqual({ metal: 1, energy: 1, crystal: 1, biomass: 0 });
  });

  it('numberWeight', () => {
    expect(numberWeight(6)).toBe(5);
    expect(numberWeight(8)).toBe(5);
    expect(numberWeight(2)).toBe(1);
    expect(numberWeight(12)).toBe(1);
    expect(numberWeight(7)).toBe(0);
  });
});
