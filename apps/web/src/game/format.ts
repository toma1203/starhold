import type { Translate } from '@starhold/i18n';
import { RESOURCES } from '@starhold/engine';
import type { PlayerId, PlayerView, Resource, ResourceBag, SectorId } from '@starhold/engine';
import { spaceTheme } from '@starhold/theme-space';

/** The player's nickname, or the raw id for somebody the view does not know. */
export function playerName(view: PlayerView, id: PlayerId): string {
  return view.players.find((p) => p.id === id)?.name ?? id;
}

export function resourceName(resource: Resource, t: Translate): string {
  return t(spaceTheme.resources[resource].labelKey);
}

/** "2 Metal, 1 Energy": only the non-zero entries, in the fixed resource order. */
export function bagText(bag: ResourceBag, t: Translate): string {
  return RESOURCES.filter((r) => bag[r] > 0)
    .map((r) => `${bag[r]} ${resourceName(r, t)}`)
    .join(', ');
}

/** A sector as people would call it: "Crystal 8", "Nebula", "Home system (Name)". */
export function sectorLabel(view: PlayerView, id: SectorId, t: Translate): string {
  const sector = view.sectors[id];
  if (!sector) return id;
  if (sector.kind === 'resource' && sector.resource !== null) {
    const resource = resourceName(sector.resource, t);
    return sector.number === null
      ? resource
      : t('map.sector.resource', { resource, number: sector.number });
  }
  if (sector.kind === 'home') {
    const home = t('theme.space.sector.home');
    return sector.owner === null ? home : `${home} (${playerName(view, sector.owner)})`;
  }
  return t('theme.space.sector.nebula');
}
