import {
  numberWeight,
  resolveBattle,
  RESOURCES,
  ownedSectors,
  hexId,
  neighbors,
  victoryPoints,
  sectorCount,
} from '@starhold/engine';
import type { PlayerId, PlayerView, Resource, ResourceBag, Sector } from '@starhold/engine';

/** Production weight of a sector: its number's roll odds, doubled once it holds a structure. */
export function sectorValue(sector: Sector): number {
  return numberWeight(sector.number) * (sector.structure === 'none' ? 1 : 2);
}

// ---- Exact combat odds -----------------------------------------------------------------------

/** Every ordered roll of `count` six-sided dice. */
function allRolls(count: number): number[][] {
  let rolls: number[][] = [[]];
  for (let i = 0; i < count; i++) {
    rolls = rolls.flatMap((roll) => [1, 2, 3, 4, 5, 6].map((face) => [...roll, face]));
  }
  return rolls;
}

/** [attDice - 1][defDice - 1][bonus ? 1 : 0] -> chance that the defender loses more than the attacker. */
const WIN_TABLE: number[][][] = [1, 2, 3].map((att) =>
  [1, 2].map((def) =>
    [false, true].map((bonus) => {
      const attackRolls = allRolls(att);
      const defendRolls = allRolls(def);
      let wins = 0;
      for (const a of attackRolls) {
        for (const d of defendRolls) {
          const { attackerLosses, defenderLosses } = resolveBattle(a, d, bonus);
          if (defenderLosses > attackerLosses) wins += 1;
        }
      }
      return wins / (attackRolls.length * defendRolls.length);
    }),
  ),
);

/**
 * Chance that one attack round goes the attacker's way (the defender loses strictly more fleets
 * than the attacker; ties on the dice favour the defender). `bonus` is a defending starbase.
 * Exact: enumerated once at module load from the engine's own dice resolution.
 */
export function attackWinChance(attDice: number, defDice: number, bonus: boolean): number {
  return WIN_TABLE[attDice - 1]?.[defDice - 1]?.[bonus ? 1 : 0] ?? 0;
}

export const MIN_WIN_CHANCE = 0.55;

/** Chance that an attack on this sector with `dice` dice wins the round. */
export function attackChance(dice: number, target: Sector): number {
  return attackWinChance(dice, Math.min(2, target.fleets), target.structure === 'starbase');
}

// ---- Resource scarcity -----------------------------------------------------------------------

export function productionByResource(view: PlayerView, me: PlayerId): Record<Resource, number> {
  const production: Record<Resource, number> = { metal: 0, energy: 0, crystal: 0, biomass: 0 };
  for (const sector of ownedSectors(view, me)) {
    if (sector.resource !== null) production[sector.resource] += sectorValue(sector);
  }
  return production;
}

/** How much one card of each resource is worth to me: scarce in my production means dear. */
export function resourceWeights(view: PlayerView, me: PlayerId): Record<Resource, number> {
  const production = productionByResource(view, me);
  const weights = { metal: 0, energy: 0, crystal: 0, biomass: 0 };
  for (const r of RESOURCES) weights[r] = 0.6 + 2 / (1 + production[r] / 5);
  return weights;
}

export function evalBag(bag: ResourceBag, view: PlayerView, me: PlayerId): number {
  const weights = resourceWeights(view, me);
  return RESOURCES.reduce((sum, r) => sum + bag[r] * weights[r], 0);
}

// ---- Geometry helpers ------------------------------------------------------------------------

export function adjacentSectors(view: PlayerView, sector: Sector): Sector[] {
  return neighbors(sector.hex).flatMap((hex) => {
    const adjacent = view.sectors[hexId(hex)];
    return adjacent ? [adjacent] : [];
  });
}

/** Fleets in neighbouring sectors that belong to somebody other than `me`. */
export function adjacentEnemyFleets(view: PlayerView, me: PlayerId, sector: Sector): number {
  return adjacentSectors(view, sector).reduce(
    (sum, s) => sum + (s.owner !== null && s.owner !== me ? s.fleets : 0),
    0,
  );
}

// ---- Awards ----------------------------------------------------------------------------------

/** Mirrors the engine's rule: the holder stays while tied for the lead, others need a strict lead. */
function holderAfter(
  holder: PlayerId | null,
  values: Record<PlayerId, number>,
  threshold: number,
): PlayerId | null {
  const entries = Object.entries(values);
  const max = Math.max(...entries.map(([, v]) => v));
  const leaders = entries.filter(([, v]) => v === max);
  if (holder !== null && leaders.some(([id]) => id === holder) && max >= threshold) return holder;
  const only = leaders[0];
  return leaders.length === 1 && only && max >= threshold ? only[0] : null;
}

/**
 * Victory-point-equivalent swing (2 VP per award) if `me` conquers a sector from `defender`:
 * positive when I gain or the defender loses Largest Empire / Warlord.
 */
export function awardSwing(view: PlayerView, me: PlayerId, defender: PlayerId): number {
  const sectors: Record<PlayerId, number> = {};
  const conquests: Record<PlayerId, number> = {};
  for (const p of view.players) {
    sectors[p.id] = sectorCount(view, p.id);
    conquests[p.id] = p.conquests;
  }
  const before = view.awards;
  sectors[me] = (sectors[me] ?? 0) + 1;
  sectors[defender] = (sectors[defender] ?? 0) - 1;
  conquests[me] = (conquests[me] ?? 0) + 1;
  const empire = holderAfter(before.largestEmpire, sectors, 5);
  const warlord = holderAfter(before.warlord, conquests, 3);
  let swing = 0;
  for (const [was, now] of [
    [before.largestEmpire, empire],
    [before.warlord, warlord],
  ] as const) {
    if (was === now) continue;
    if (now === me) swing += 2;
    if (was === me) swing -= 2;
    if (was === defender) swing += 2;
    if (now === defender) swing -= 2;
  }
  return swing;
}

/** VP the attacker gains by taking `target`: a starbase becomes a colony, a colony stays one. */
export function conquestVp(target: Sector): number {
  return target.structure === 'none' ? 0 : 1;
}

export function leaderAmongOthers(view: PlayerView, me: PlayerId): PlayerId | null {
  let best: PlayerId | null = null;
  let bestVp = -1;
  for (const p of view.players) {
    if (p.id === me) continue;
    const vp = victoryPoints(view, p.id);
    if (vp > bestVp) {
      best = p.id;
      bestVp = vp;
    }
  }
  return best;
}
