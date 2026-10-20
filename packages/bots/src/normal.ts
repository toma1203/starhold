import {
  COSTS,
  bagTotal,
  hasAtLeast,
  legalActions,
  ownedSectors,
  RESOURCES,
  tradeRate,
  victoryPoints,
} from '@starhold/engine';
import type { Action, PlayerId, PlayerView, Resource, ResourceBag, Sector } from '@starhold/engine';
import {
  MIN_WIN_CHANCE,
  adjacentEnemyFleets,
  adjacentSectors,
  attackChance,
  awardSwing,
  conquestVp,
  evalBag,
  leaderAmongOthers,
  resourceWeights,
  sectorValue,
} from './eval.ts';

const VP_VALUE = 10;
const TRADE_MARGIN = 0.5;
const WIN_NOW = 1000;
const TIE_EPSILON = 1e-9;

const emptyBag = (): ResourceBag => ({ metal: 0, energy: 0, crystal: 0, biomass: 0 });

function handOf(view: PlayerView, me: PlayerId): ResourceBag {
  return view.players.find((p) => p.id === me)?.resources ?? emptyBag();
}

/** Highest score wins; ties are broken with `random`. */
function pickBest<T>(
  items: readonly T[],
  score: (item: T) => number,
  random: () => number,
): T | null {
  let best: T[] = [];
  let bestScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s > bestScore + TIE_EPSILON) {
      best = [item];
      bestScore = s;
    } else if (Math.abs(s - bestScore) <= TIE_EPSILON) {
      best.push(item);
    }
  }
  return best[Math.floor(random() * best.length)] ?? null;
}

// ---- Discards and trade answers --------------------------------------------------------------

/** Cards worth holding on to: enough for a colony or a starbase, whichever needs more of each. */
const KEEP: ResourceBag = {
  metal: Math.max(COSTS.colony.metal, COSTS.starbase.metal),
  energy: Math.max(COSTS.colony.energy, COSTS.starbase.energy),
  crystal: Math.max(COSTS.colony.crystal, COSTS.starbase.crystal),
  biomass: Math.max(COSTS.colony.biomass, COSTS.starbase.biomass),
};

/** Discards `count` cards, surplus beyond the next build's needs first. */
export function normalDiscard(view: PlayerView, me: PlayerId, count: number): Action {
  const held = { ...handOf(view, me) };
  const weights = resourceWeights(view, me);
  const resources = emptyBag();
  for (let left = count; left > 0 && bagTotal(held) > 0; left--) {
    let pick: Resource | null = null;
    let pickScore = -Infinity;
    for (const r of RESOURCES) {
      if (held[r] <= 0) continue;
      // Cards above the kit are free to lose (most surplus first); inside the kit the cheapest goes.
      const surplus = held[r] - KEEP[r];
      const score = surplus > 0 ? 100 + surplus : -weights[r];
      if (score > pickScore) {
        pick = r;
        pickScore = score;
      }
    }
    if (!pick) break;
    held[pick] -= 1;
    resources[pick] += 1;
  }
  return { type: 'discard', resources };
}

/** Accepts an offer only when what I receive is clearly worth more than what I give. */
export function chooseResponse(view: PlayerView, me: PlayerId): Action {
  const offer = view.offer;
  if (!offer) return { type: 'respondTrade', accept: false };
  const affordable = hasAtLeast(handOf(view, me), offer.want);
  const gain = evalBag(offer.give, view, me) - evalBag(offer.want, view, me);
  return { type: 'respondTrade', accept: affordable && gain > TRADE_MARGIN };
}

// ---- Turn actions ----------------------------------------------------------------------------

interface Context {
  view: PlayerView;
  me: PlayerId;
  hand: ResourceBag;
  weights: Record<Resource, number>;
  vp: number;
}

function isThreatened(view: PlayerView, me: PlayerId, sector: Sector): boolean {
  const enemy = adjacentEnemyFleets(view, me, sector);
  return enemy > 0 && sector.fleets <= enemy;
}

function hasFreeNeighbour(view: PlayerView, sector: Sector): boolean {
  return adjacentSectors(view, sector).some((s) => s.owner === null);
}

function colonyScore(ctx: Context, sector: Sector): number {
  const resource = sector.resource;
  const production = resource === null ? 0 : numberGain(sector) * ctx.weights[resource];
  return VP_VALUE + production + winBonus(ctx, 1);
}

function numberGain(sector: Sector): number {
  // Claimed sectors yield 1 card, a structure 2: a colony adds the sector's weight once more.
  return (
    sectorValue({ ...sector, structure: 'colony' }) - sectorValue({ ...sector, structure: 'none' })
  );
}

function winBonus(ctx: Context, gainedVp: number): number {
  return ctx.vp + gainedVp >= ctx.view.settings.targetVp ? WIN_NOW : 0;
}

function starbaseScore(ctx: Context, sector: Sector): number {
  const guard = isThreatened(ctx.view, ctx.me, sector) ? 1 : 0;
  return VP_VALUE + guard + winBonus(ctx, 1);
}

function fleetScore(ctx: Context, sector: Sector): number {
  if (isThreatened(ctx.view, ctx.me, sector)) return 3;
  // Fleets are the fuel for expansion: a lone fleet beside free land can start moving out.
  if (sector.fleets === 1 && hasFreeNeighbour(ctx.view, sector)) return 1.5;
  return 1;
}

function expandScore(ctx: Context, from: Sector, to: Sector): number {
  const exposed = adjacentEnemyFleets(ctx.view, ctx.me, from) > 1 ? 2 : 0;
  return 4 + sectorValue({ ...to, structure: 'none' }) - exposed;
}

function attackScore(ctx: Context, to: Sector, dice: number): number {
  const chance = attackChance(dice, to);
  if (chance < MIN_WIN_CHANCE || to.owner === null) return -Infinity;
  const vp = conquestVp(to);
  const swing = awardSwing(ctx.view, ctx.me, to.owner);
  const gain = sectorValue(to) + VP_VALUE * (vp + swing);
  return chance * gain - 2;
}

function fortifyScore(ctx: Context, from: Sector, to: Sector, count: number): number {
  if (!isThreatened(ctx.view, ctx.me, to) || isThreatened(ctx.view, ctx.me, from)) return -Infinity;
  const enemy = adjacentEnemyFleets(ctx.view, ctx.me, to);
  return to.fleets + count > enemy ? 0.5 : -Infinity;
}

type Build = 'buildColony' | 'buildStarbase' | 'buildFleet';

/** The best score each build could reach if I could pay for it (null: no site for it). */
function bestBuildScores(ctx: Context): Record<Build, number | null> {
  const scores: Record<Build, number | null> = {
    buildColony: null,
    buildStarbase: null,
    buildFleet: null,
  };
  for (const sector of ownedSectors(ctx.view, ctx.me)) {
    const options: [Build, number][] = [['buildFleet', fleetScore(ctx, sector)]];
    if (sector.structure === 'none' && sector.kind !== 'home') {
      options.push(['buildColony', colonyScore(ctx, sector)]);
    }
    if (sector.structure === 'colony') options.push(['buildStarbase', starbaseScore(ctx, sector)]);
    for (const [kind, score] of options) {
      scores[kind] = Math.max(scores[kind] ?? -Infinity, score);
    }
  }
  return scores;
}

const BUILD_COST: Record<Build, ResourceBag> = {
  buildColony: COSTS.colony,
  buildStarbase: COSTS.starbase,
  buildFleet: COSTS.fleet,
};

/** A bank trade is worth it only when it immediately pays for the best build I could make. */
function bankTradeScore(ctx: Context, give: Resource, get: Resource): number {
  const rate = tradeRate(ctx.view, ctx.me);
  const after = { ...ctx.hand, [give]: ctx.hand[give] - rate, [get]: ctx.hand[get] + 1 };
  const scores = bestBuildScores(ctx);
  let top: Build | null = null;
  for (const kind of ['buildColony', 'buildStarbase'] as const) {
    const score = scores[kind];
    if (score !== null && (top === null || score > (scores[top] ?? -Infinity))) top = kind;
  }
  if (top === null) return -Infinity;
  const fleet = scores.buildFleet;
  if (fleet !== null && fleet > (scores[top] ?? -Infinity)) return -Infinity;
  const cost = BUILD_COST[top];
  if (hasAtLeast(ctx.hand, cost) || !hasAtLeast(after, cost)) return -Infinity;
  return (scores[top] ?? 0) - 0.5;
}

function scoreMain(ctx: Context, action: Action): number {
  const sectors = ctx.view.sectors;
  switch (action.type) {
    case 'endTurn':
      return 0;
    case 'buildColony': {
      const at = sectors[action.at];
      return at ? colonyScore(ctx, at) : -Infinity;
    }
    case 'buildStarbase': {
      const at = sectors[action.at];
      return at ? starbaseScore(ctx, at) : -Infinity;
    }
    case 'buildFleet': {
      const at = sectors[action.at];
      return at ? fleetScore(ctx, at) : -Infinity;
    }
    case 'expand': {
      const from = sectors[action.from];
      const to = sectors[action.to];
      return from && to ? expandScore(ctx, from, to) : -Infinity;
    }
    case 'attack': {
      const to = sectors[action.to];
      return to ? attackScore(ctx, to, action.dice) : -Infinity;
    }
    case 'fortify': {
      const from = sectors[action.from];
      const to = sectors[action.to];
      return from && to ? fortifyScore(ctx, from, to, action.count) : -Infinity;
    }
    case 'bankTrade':
      return bankTradeScore(ctx, action.give, action.get);
    default:
      return -Infinity; // offers are managed by the human at the table, not by a bot
  }
}

// ---- Other phases ----------------------------------------------------------------------------

function homeBonusScore(ctx: Context, resource: Resource): number {
  const after = { ...ctx.hand, [resource]: ctx.hand[resource] + 1 };
  let score = ctx.weights[resource];
  if (!hasAtLeast(ctx.hand, COSTS.colony) && hasAtLeast(after, COSTS.colony)) score += 6;
  else if (!hasAtLeast(ctx.hand, COSTS.starbase) && hasAtLeast(after, COSTS.starbase)) score += 3;
  return score;
}

function pirateScore(ctx: Context, sector: Sector, leader: PlayerId | null): number {
  if (sector.owner === ctx.me) return -Infinity;
  if (sector.owner === null) return 0;
  const victim = ctx.view.players.find((p) => p.id === sector.owner);
  const target = sector.owner === leader ? 1.5 : 1;
  return sectorValue(sector) * target + ((victim?.cardCount ?? 0) > 0 ? 1 : 0);
}

/** The normal bot: scores every legal action and plays the best, `endTurn` being worth 0. */
export function chooseNormal(view: PlayerView, me: PlayerId, random: () => number): Action | null {
  const legal = legalActions(view, me);
  const ctx: Context = {
    view,
    me,
    hand: handOf(view, me),
    weights: resourceWeights(view, me),
    vp: victoryPoints(view, me),
  };
  switch (view.phase) {
    case 'HOME_BONUS':
      return pickBest(
        legal.filter((a) => a.type === 'chooseHomeBonus'),
        (a) => (a.type === 'chooseHomeBonus' ? homeBonusScore(ctx, a.resource) : -Infinity),
        random,
      );
    case 'ROLL':
      return legal.find((a) => a.type === 'roll') ?? null;
    case 'PIRATE': {
      const leader = leaderAmongOthers(view, me);
      return pickBest(
        legal.filter((a) => a.type === 'movePirate'),
        (a) => {
          const sector = a.type === 'movePirate' ? view.sectors[a.to] : undefined;
          return sector ? pirateScore(ctx, sector, leader) : -Infinity;
        },
        random,
      );
    }
    case 'MAIN':
      return pickBest(legal, (a) => scoreMain(ctx, a), random);
    default:
      return null;
  }
}
