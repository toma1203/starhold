import { clone } from '../clone.ts';
import { hasAtLeast } from '../costs.ts';
import { currentPlayer, ownedSectors } from '../state.ts';
import type { HandlerTable, PlayerId } from '../types.ts';
import { RESOURCES } from '../types.ts';
import type { ReadState } from '../view.ts';
import { guardTurn } from './guard.ts';

/** Bank exchange rate: 3:1 when the player owns any trade station sector, otherwise 4:1. */
export function tradeRate(state: ReadState, playerId: PlayerId): 3 | 4 {
  return ownedSectors(state, playerId).some((sector) => sector.tradeStation) ? 3 : 4;
}

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
};
