import { clone } from '../clone.ts';
import { COSTS, hasAtLeast, subBag } from '../costs.ts';
import { currentPlayer } from '../state.ts';
import type {
  Action,
  ErrorCode,
  GameState,
  Handler,
  HandlerTable,
  PlayerId,
  Sector,
  SectorId,
} from '../types.ts';
import { guardTurn } from './guard.ts';

type BuildKind = 'fleet' | 'colony' | 'starbase';

/** Why `sector` cannot take this build, or null if it can. */
type SectorCheck = (sector: Sector) => ErrorCode | null;

const canBuildFleet: SectorCheck = () => null;
const canBuildColony: SectorCheck = (sector) =>
  sector.structure === 'none' && sector.kind !== 'home' ? null : 'err.invalidSector';
const canBuildStarbase: SectorCheck = (sector) =>
  sector.structure === 'colony' ? null : 'err.invalidSector';

function apply(kind: BuildKind, sector: Sector): void {
  if (kind === 'fleet') sector.fleets += 1;
  else sector.structure = kind;
}

function makeBuildHandler(
  actionType: 'buildFleet' | 'buildColony' | 'buildStarbase',
  kind: BuildKind,
  check: SectorCheck,
): Handler {
  return (state: GameState, playerId: PlayerId, action: Action) => {
    if (action.type !== actionType) return { ok: false, error: 'err.wrongPhase' };
    const denied = guardTurn(state, playerId, 'MAIN');
    if (denied) return { ok: false, error: denied };
    const at: SectorId = action.at;
    if (!Object.hasOwn(state.sectors, at)) return { ok: false, error: 'err.invalidSector' };
    const sector = state.sectors[at];
    if (!sector) return { ok: false, error: 'err.invalidSector' };
    if (sector.owner !== playerId) return { ok: false, error: 'err.notOwned' };
    const invalid = check(sector);
    if (invalid) return { ok: false, error: invalid };
    if (!hasAtLeast(currentPlayer(state).resources, COSTS[kind])) {
      return { ok: false, error: 'err.insufficientResources' };
    }
    const next = clone(state);
    const player = currentPlayer(next);
    player.resources = subBag(player.resources, COSTS[kind]);
    const built = next.sectors[at];
    if (!built) return { ok: false, error: 'err.invalidSector' };
    apply(kind, built);
    return {
      ok: true,
      state: next,
      events: [{ type: 'built', player: playerId, what: kind, at }],
    };
  };
}

export const buildHandlers: HandlerTable = {
  buildFleet: makeBuildHandler('buildFleet', 'fleet', canBuildFleet),
  buildColony: makeBuildHandler('buildColony', 'colony', canBuildColony),
  buildStarbase: makeBuildHandler('buildStarbase', 'starbase', canBuildStarbase),
};
