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

/**
 * Chance that one attack round goes the attacker's way (the defender loses strictly more fleets
 * than the attacker; ties on the dice favour the defender). `bonus` is a defending starbase.
 * Exact: enumerated once at module load from the engine's own dice resolution.
 */
export function attackWinChance(attDice: number, defDice: number, bonus: boolean): number {
  const outcomes = OUTCOMES[attDice - 1]?.[defDice - 1]?.[bonus ? 1 : 0] ?? [];
  return outcomes
    .filter((o) => o.defenderLosses > o.attackerLosses)
    .reduce((sum, o) => sum + o.probability, 0);
}

export const MIN_WIN_CHANCE = 0.55;

interface Outcome {
  attackerLosses: number;
  defenderLosses: number;
  probability: number;
}

/** [attDice - 1][defDice - 1][bonus ? 1 : 0] -> every possible (losses, losses) result of one round. */
const OUTCOMES: Outcome[][][][] = [1, 2, 3].map((att) =>
  [1, 2].map((def) =>
    [false, true].map((bonus) => {
      const attackRolls = allRolls(att);
      const defendRolls = allRolls(def);
      const total = attackRolls.length * defendRolls.length;
      const counts = new Map<string, Outcome>();
      for (const a of attackRolls) {
        for (const d of defendRolls) {
          const { attackerLosses, defenderLosses } = resolveBattle(a, d, bonus);
          const key = `${attackerLosses},${defenderLosses}`;
          const entry = counts.get(key) ?? { attackerLosses, defenderLosses, probability: 0 };
          entry.probability += 1 / total;
          counts.set(key, entry);
        }
      }
      return [...counts.values()];
    }),
  ),
);

const MAX_FLEETS = 30;

export interface Forecast {
  /** Chance the sector is captured. */
  capture: number;
  /** Expected fleets the attacker loses on the way (to a capture or to giving up at 1 fleet). */
  losses: number;
}

const forecastMemo = new Map<number, Forecast>();

/**
 * Attacking again and again with the most dice allowed (min(3, fleets - 1) against min(2, fleets))
 * until the defender is out of fleets (captured) or the attacker is down to one (failure).
 */
export function conquestForecast(
  attackerFleets: number,
  defenderFleets: number,
  defenderBonus: boolean,
): Forecast {
  const a = Math.min(MAX_FLEETS, Math.max(0, Math.floor(attackerFleets)));
  const d = Math.min(MAX_FLEETS, Math.max(0, Math.floor(defenderFleets)));
  if (d <= 0) return { capture: 1, losses: 0 };
  if (a <= 1) return { capture: 0, losses: 0 };
  const key = (a * (MAX_FLEETS + 1) + d) * 2 + (defenderBonus ? 1 : 0);
  const known = forecastMemo.get(key);
  if (known) return known;
  const dice = Math.min(3, a - 1);
  const defending = Math.min(2, d);
  let capture = 0;
  let losses = 0;
  for (const o of OUTCOMES[dice - 1]?.[defending - 1]?.[defenderBonus ? 1 : 0] ?? []) {
    const next = conquestForecast(a - o.attackerLosses, d - o.defenderLosses, defenderBonus);
    capture += o.probability * next.capture;
    losses += o.probability * (o.attackerLosses + next.losses);
  }
  const result = { capture, losses };
  forecastMemo.set(key, result);
  return result;
}

/**
 * Exact chance that attacking a sector again and again captures it (see `conquestForecast`).
 * Inputs are capped at 30 fleets.
 */
export function conquestChance(
  attackerFleets: number,
  defenderFleets: number,
  defenderBonus: boolean,
): number {
  return conquestForecast(attackerFleets, defenderFleets, defenderBonus).capture;
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

/** The resource `me` holds least of (the home bonus pick, spec �2.3); ties go to `RESOURCES` order. */
export function leastHeld(view: PlayerView, me: PlayerId): Resource {
  const hand = view.players.find((p) => p.id === me)?.resources;
  const held = (r: Resource): number => hand?.[r] ?? 0;
  const lowest = Math.min(...RESOURCES.map(held));
  return RESOURCES.find((r) => held(r) === lowest) ?? 'metal';
}
