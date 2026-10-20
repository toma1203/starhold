import { COSTS, emptyBag, hasAtLeast } from './costs.ts';
import { hexId, neighbors } from './hex.ts';
import { connectedOwned, maxAttackDice, maxMovable } from './rules/military.ts';
import { tradeRate } from './rules/trade.ts';
import { ownedSectors } from './state.ts';
import type { Action, PlayerId, ResourceBag, Sector } from './types.ts';
import { RESOURCES } from './types.ts';
import type { ReadState } from './view.ts';

/** Cards a player is known to hold: their own hand, or nothing when a view hides it. */
function handOf(state: ReadState, playerId: PlayerId): ResourceBag | null {
  return state.players.find((p) => p.id === playerId)?.resources ?? null;
}

/** Sectors adjacent to `sector` that exist on this map. */
function adjacentSectors(state: ReadState, sector: Sector): Sector[] {
  return neighbors(sector.hex).flatMap((hex) => {
    const adjacent = state.sectors[hexId(hex)];
    return adjacent ? [adjacent] : [];
  });
}

function respondActions(state: ReadState, playerId: PlayerId): Action[] {
  const offer = state.offer;
  if (!offer || state.phase !== 'MAIN' || offer.from === playerId) return [];
  if (!state.players.some((p) => p.id === playerId)) return [];
  if (offer.accepted.includes(playerId) || offer.declined.includes(playerId)) return [];
  const actions: Action[] = [{ type: 'respondTrade', accept: false }];
  const hand = handOf(state, playerId);
  if (hand && hasAtLeast(hand, offer.want)) actions.push({ type: 'respondTrade', accept: true });
  return actions;
}

function builds(state: ReadState, playerId: PlayerId, hand: ResourceBag): Action[] {
  const actions: Action[] = [];
  const canFleet = hasAtLeast(hand, COSTS.fleet);
  const canColony = hasAtLeast(hand, COSTS.colony);
  const canStarbase = hasAtLeast(hand, COSTS.starbase);
  for (const sector of ownedSectors(state, playerId)) {
    if (canFleet) actions.push({ type: 'buildFleet', at: sector.id });
    if (canColony && sector.structure === 'none' && sector.kind !== 'home') {
      actions.push({ type: 'buildColony', at: sector.id });
    }
    if (canStarbase && sector.structure === 'colony') {
      actions.push({ type: 'buildStarbase', at: sector.id });
    }
  }
  return actions;
}

function bankTrades(state: ReadState, playerId: PlayerId, hand: ResourceBag): Action[] {
  const rate = tradeRate(state, playerId);
  const actions: Action[] = [];
  for (const give of RESOURCES) {
    if (hand[give] < rate) continue;
    for (const get of RESOURCES) {
      if (get !== give) actions.push({ type: 'bankTrade', give, get });
    }
  }
  return actions;
}

function movements(state: ReadState, playerId: PlayerId): Action[] {
  const actions: Action[] = [];
  for (const from of ownedSectors(state, playerId)) {
    const count = maxMovable(state, from.id);
    if (count < 1) continue;
    const dice = maxAttackDice(state, from.id);
    for (const to of adjacentSectors(state, from)) {
      if (to.owner === null) {
        actions.push({ type: 'expand', from: from.id, to: to.id, count });
      } else if (to.owner !== playerId && to.kind !== 'home' && dice >= 1) {
        actions.push({ type: 'attack', from: from.id, to: to.id, dice: dice as 1 | 2 | 3 });
      }
    }
    for (const toId of connectedOwned(state, playerId, from.id)) {
      if (toId !== from.id) actions.push({ type: 'fortify', from: from.id, to: toId, count });
    }
  }
  return actions;
}

function tradeManagement(state: ReadState, playerId: PlayerId, hand: ResourceBag): Action[] {
  const offer = state.offer;
  if (!offer || offer.from !== playerId) return [];
  const actions: Action[] = [{ type: 'cancelTrade' }];
  if (!hasAtLeast(hand, offer.give)) return actions; // the offerer spent it after offering
  for (const partnerId of offer.accepted) {
    // A view hides other hands; an acceptor could pay when they said yes.
    const partnerHand = handOf(state, partnerId);
    if (partnerHand && !hasAtLeast(partnerHand, offer.want)) continue;
    actions.push({ type: 'confirmTrade', with: partnerId });
  }
  return actions;
}

/**
 * Every action `playerId` may take right now, mirroring the validation in rules/*.ts so each one
 * is accepted by `applyAction` on the matching full state. Works on a full state or on a player's
 * view (other hands are hidden there, so only own resources are consulted).
 *
 * Not enumerated: `offerTrade` (an open-ended choice) and `discard` (an empty list in DISCARD:
 * the choice is made by `randomDiscard` or by bot logic). `attack` omits `moveIfConquered`, so the
 * engine moves in the maximum. `expand`, `attack` and `fortify` use the maximum count / dice.
 */
export function legalActions(state: ReadState, playerId: PlayerId): Action[] {
  if (state.phase === 'FINISHED') return [];
  const responses = respondActions(state, playerId);
  if (responses.length > 0) return responses;

  const current = state.players[state.current];
  if (!current || current.id !== playerId) return [];

  switch (state.phase) {
    case 'HOME_BONUS':
      return RESOURCES.map((resource) => ({ type: 'chooseHomeBonus', resource }));
    case 'ROLL':
      return [{ type: 'roll' }];
    case 'PIRATE':
      return state.sectorIds.flatMap((id) => {
        const sector = state.sectors[id];
        return sector && sector.kind !== 'home' && state.pirate !== id
          ? [{ type: 'movePirate' as const, to: id }]
          : [];
      });
    case 'MAIN': {
      const hand = handOf(state, playerId) ?? emptyBag();
      return [
        ...builds(state, playerId, hand),
        ...bankTrades(state, playerId, hand),
        ...movements(state, playerId),
        ...tradeManagement(state, playerId, hand),
        { type: 'endTurn' },
      ];
    }
    default:
      return [];
  }
}
