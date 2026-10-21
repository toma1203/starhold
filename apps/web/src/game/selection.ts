import type { Action, PlayerId, PlayerView, SectorId } from '@starhold/engine';
import { legalActionsFor } from './legalCache.ts';

export type Intent =
  | { kind: 'expand' | 'attack' | 'fortify'; from: SectorId; to: SectorId }
  | { kind: 'build'; at: SectorId }
  | { kind: 'pirate'; to: SectorId };

/**
 * What clicking `clicked` could mean, given the sector `selected` earlier. Everything comes from
 * `legalActions`: this module never decides what is allowed, it only maps actions to clicks.
 *
 * A build intent stands for "this sector has at least one affordable build"; the caller offers
 * the choice. Movement intents need a selected origin.
 */
export function intentsFor(
  view: PlayerView,
  me: PlayerId,
  selected: SectorId | null,
  clicked: SectorId,
): Intent[] {
  const intents: Intent[] = [];
  let canBuild = false;
  for (const action of legalActionsFor(view, me)) {
    switch (action.type) {
      case 'movePirate':
        if (action.to === clicked) intents.push({ kind: 'pirate', to: clicked });
        break;
      case 'expand':
      case 'attack':
      case 'fortify':
        if (action.from === selected && action.to === clicked) {
          intents.push({ kind: action.type, from: action.from, to: action.to });
        }
        break;
      case 'buildFleet':
      case 'buildColony':
      case 'buildStarbase':
        if (action.at === clicked) canBuild = true;
        break;
      default:
        break;
    }
  }
  if (canBuild) intents.push({ kind: 'build', at: clicked });
  return intents;
}

function targetOf(action: Action, selected: SectorId | null): SectorId | null {
  switch (action.type) {
    case 'movePirate':
      return action.to;
    case 'expand':
    case 'attack':
    case 'fortify':
      return action.from === selected ? action.to : null;
    default:
      return null;
  }
}

/** Sectors worth outlining: legal destinations from the selected sector, or for the pirate. */
export function highlightTargets(
  view: PlayerView,
  me: PlayerId,
  selected: SectorId | null,
): Set<SectorId> {
  const targets = new Set<SectorId>();
  for (const action of legalActionsFor(view, me)) {
    const to = targetOf(action, selected);
    if (to !== null) targets.add(to);
  }
  return targets;
}
