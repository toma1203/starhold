import { clone } from '../clone.ts';
import { addBag, bagTotal, hasAtLeast, subBag } from '../costs.ts';
import { currentPlayer, ownedSectors } from '../state.ts';
import type { HandlerTable, PlayerId, ResourceBag } from '../types.ts';
import { RESOURCES } from '../types.ts';
import type { ReadState } from '../view.ts';
import { guardPhase, guardTurn } from './guard.ts';

/** Bank exchange rate: 3:1 when the player owns any trade station sector, otherwise 4:1. */
export function tradeRate(state: ReadState, playerId: PlayerId): 3 | 4 {
  return ownedSectors(state, playerId).some((sector) => sector.tradeStation) ? 3 : 4;
}

/** True for a bag with exactly the four resource keys, each a non-negative integer (client data is untrusted). */
function isValidBag(value: unknown): value is ResourceBag {
  if (typeof value !== 'object' || value === null) return false;
  const keys = Object.keys(value);
  if (keys.length !== RESOURCES.length || !RESOURCES.every((r) => keys.includes(r))) return false;
  const bag = value as Record<string, unknown>;
  return RESOURCES.every((r) => Number.isInteger(bag[r]) && (bag[r] as number) >= 0);
}

/** Copy of a validated bag with a fixed key order, so a stored offer never aliases client input. */
const copyBag = (b: ResourceBag): ResourceBag => ({
  metal: b.metal,
  energy: b.energy,
  crystal: b.crystal,
  biomass: b.biomass,
});

export const tradeHandlers: HandlerTable = {
  bankTrade: (state, playerId, action) => {
    if (action.type !== 'bankTrade') return { ok: false, error: 'err.wrongPhase' };
    const denied = guardTurn(state, playerId, 'MAIN');
    if (denied) return { ok: false, error: denied };
    const { give, get } = action;
    if (give === get || !RESOURCES.includes(give) || !RESOURCES.includes(get)) {
      return { ok: false, error: 'err.invalidTrade' };
    }
    const giveCount = tradeRate(state, playerId);
    const need = { metal: 0, energy: 0, crystal: 0, biomass: 0, [give]: giveCount };
    if (!hasAtLeast(currentPlayer(state).resources, need)) {
      return { ok: false, error: 'err.insufficientResources' };
    }
    const next = clone(state);
    const player = currentPlayer(next);
    player.resources[give] -= giveCount;
    player.resources[get] += 1;
    return {
      ok: true,
      state: next,
      events: [{ type: 'bankTraded', player: playerId, give, giveCount, get }],
    };
  },

  offerTrade: (state, playerId, action) => {
    if (action.type !== 'offerTrade') return { ok: false, error: 'err.wrongPhase' };
    const denied = guardTurn(state, playerId, 'MAIN');
    if (denied) return { ok: false, error: denied };
    const { give, want } = action;
    if (!isValidBag(give) || !isValidBag(want)) return { ok: false, error: 'err.invalidTrade' };
    const overlap = RESOURCES.some((r) => give[r] > 0 && want[r] > 0);
    if (bagTotal(give) < 1 || bagTotal(want) < 1 || overlap) {
      return { ok: false, error: 'err.invalidTrade' };
    }
    if (!hasAtLeast(currentPlayer(state).resources, give)) {
      return { ok: false, error: 'err.insufficientResources' };
    }
    const next = clone(state);
    const offer = {
      from: playerId,
      give: copyBag(give),
      want: copyBag(want),
      accepted: [],
      declined: [],
    };
    next.offer = offer;
    return { ok: true, state: next, events: [{ type: 'tradeOffered', offer: clone(offer) }] };
  },

  respondTrade: (state, playerId, action) => {
    if (action.type !== 'respondTrade') return { ok: false, error: 'err.wrongPhase' };
    const denied = guardPhase(state, 'MAIN');
    if (denied) return { ok: false, error: denied };
    if (!state.offer) return { ok: false, error: 'err.noOffer' };
    const responder = state.players.find((p) => p.id === playerId);
    if (!responder || playerId === state.offer.from) {
      return { ok: false, error: 'err.invalidTrade' };
    }
    const accept = action.accept === true;
    if (accept && !hasAtLeast(responder.resources, state.offer.want)) {
      return { ok: false, error: 'err.insufficientResources' };
    }
    const next = clone(state);
    const offer = next.offer;
    if (!offer) return { ok: false, error: 'err.noOffer' };
    offer.accepted = offer.accepted.filter((id) => id !== playerId);
    offer.declined = offer.declined.filter((id) => id !== playerId);
    (accept ? offer.accepted : offer.declined).push(playerId);
    return {
      ok: true,
      state: next,
      events: [{ type: 'tradeResponded', player: playerId, accept }],
    };
  },

  confirmTrade: (state, playerId, action) => {
    if (action.type !== 'confirmTrade') return { ok: false, error: 'err.wrongPhase' };
    const denied = guardTurn(state, playerId, 'MAIN');
    if (denied) return { ok: false, error: denied };
    const offer = state.offer;
    if (!offer) return { ok: false, error: 'err.noOffer' };
    if (offer.from !== playerId || !offer.accepted.includes(action.with)) {
      return { ok: false, error: 'err.invalidTrade' };
    }
    const next = clone(state);
    const offerer = next.players.find((p) => p.id === playerId);
    const partner = next.players.find((p) => p.id === action.with);
    if (!offerer || !partner) return { ok: false, error: 'err.invalidTrade' };
    if (!hasAtLeast(offerer.resources, offer.give) || !hasAtLeast(partner.resources, offer.want)) {
      return { ok: false, error: 'err.insufficientResources' };
    }
    offerer.resources = addBag(subBag(offerer.resources, offer.give), offer.want);
    partner.resources = addBag(subBag(partner.resources, offer.want), offer.give);
    next.offer = null;
    return {
      ok: true,
      state: next,
      events: [
        {
          type: 'traded',
          a: playerId,
          b: partner.id,
          aGave: copyBag(offer.give),
          bGave: copyBag(offer.want),
        },
      ],
    };
  },

  cancelTrade: (state, playerId, action) => {
    if (action.type !== 'cancelTrade') return { ok: false, error: 'err.wrongPhase' };
    const denied = guardTurn(state, playerId, 'MAIN');
    if (denied) return { ok: false, error: denied };
    if (!state.offer) return { ok: false, error: 'err.noOffer' };
    if (state.offer.from !== playerId) return { ok: false, error: 'err.invalidTrade' };
    const next = clone(state);
    next.offer = null;
    return { ok: true, state: next, events: [{ type: 'tradeCancelled' }] };
  },
};
