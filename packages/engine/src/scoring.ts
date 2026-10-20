import { clone } from './clone.ts';
import { ownedSectors } from './state.ts';
import type { Awards, GameEvent, GameState, PlayerId } from './types.ts';
import type { ReadState } from './view.ts';

const LARGEST_EMPIRE_MIN_SECTORS = 5;
const WARLORD_MIN_CONQUESTS = 3;
const AWARD_VP = 2;
export const ROUND_LIMIT = 60;

/** Sectors owned by `playerId` (claimed, colony or starbase; a home counts as its structure). */
export function sectorCount(state: ReadState, playerId: PlayerId): number {
  return ownedSectors(state, playerId).length;
}

function totalFleets(state: ReadState, playerId: PlayerId): number {
  return ownedSectors(state, playerId).reduce((sum, sector) => sum + sector.fleets, 0);
}

/** Colony 1, starbase 2, plus 2 for every award held. */
export function victoryPoints(state: ReadState, playerId: PlayerId): number {
  const structures = ownedSectors(state, playerId).reduce(
    (sum, sector) =>
      sum + (sector.structure === 'starbase' ? 2 : sector.structure === 'colony' ? 1 : 0),
    0,
  );
  const awards = (['largestEmpire', 'warlord'] as const).filter(
    (award) => state.awards[award] === playerId,
  ).length;
  return structures + awards * AWARD_VP;
}

/** Everybody, best first: VP, then sectors, then total fleets, then the lower seat. */
export function ranking(state: ReadState): PlayerId[] {
  const rows = state.players.map((player) => ({
    id: player.id,
    seat: player.seat,
    vp: victoryPoints(state, player.id),
    sectors: sectorCount(state, player.id),
    fleets: totalFleets(state, player.id),
  }));
  rows.sort(
    (a, b) => b.vp - a.vp || b.sectors - a.sectors || b.fleets - a.fleets || a.seat - b.seat,
  );
  return rows.map((row) => row.id);
}

/** Who should hold an award: the holder stays while still a threshold-meeting leader (ties keep it). */
function nextHolder(
  state: GameState,
  holder: PlayerId | null,
  metric: (id: PlayerId) => number,
  threshold: number,
): PlayerId | null {
  const scores = state.players.map((player) => ({ id: player.id, value: metric(player.id) }));
  const max = Math.max(...scores.map((s) => s.value));
  const leaders = scores.filter((s) => s.value === max);
  if (holder !== null && leaders.some((s) => s.id === holder) && max >= threshold) return holder;
  const only = leaders[0];
  if (leaders.length === 1 && only && max >= threshold) return only.id;
  return null;
}

/** Re-evaluates Largest Empire and Warlord; emits `awardChanged` only when a holder changes. */
export function updateAwards(state: GameState): { state: GameState; events: GameEvent[] } {
  const next: Awards = {
    largestEmpire: nextHolder(
      state,
      state.awards.largestEmpire,
      (id) => sectorCount(state, id),
      LARGEST_EMPIRE_MIN_SECTORS,
    ),
    warlord: nextHolder(
      state,
      state.awards.warlord,
      (id) => state.players.find((p) => p.id === id)?.conquests ?? 0,
      WARLORD_MIN_CONQUESTS,
    ),
  };
  const events: GameEvent[] = [];
  for (const award of ['largestEmpire', 'warlord'] as const) {
    if (next[award] !== state.awards[award]) {
      events.push({ type: 'awardChanged', award, player: next[award] });
    }
  }
  if (events.length === 0) return { state, events };
  const result = clone(state);
  result.awards = next;
  return { state: result, events };
}

/** Ends the game. Never mutates `state`. */
export function finishGame(
  state: GameState,
  winner: PlayerId,
  reason: 'target' | 'roundLimit',
): { state: GameState; events: GameEvent[] } {
  const next = clone(state);
  next.phase = 'FINISHED';
  next.winner = winner;
  next.endReason = reason;
  return { state: next, events: [{ type: 'gameOver', winner, reason }] };
}

/** Finishes the game by `target` if the current player has reached it; otherwise a no-op. */
export function checkTargetReached(state: GameState): { state: GameState; events: GameEvent[] } {
  const current = state.players[state.current];
  if (state.phase === 'FINISHED' || !current) return { state, events: [] };
  if (victoryPoints(state, current.id) < state.settings.targetVp) return { state, events: [] };
  return finishGame(state, current.id, 'target');
}
