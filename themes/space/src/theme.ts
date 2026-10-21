import type { ComponentType } from 'react';
import type { Resource } from '@starhold/engine';
import type { MessageKey } from '@starhold/i18n';
import {
  BiomassIcon,
  ColonyIcon,
  CrystalIcon,
  DiceIcon,
  EnergyIcon,
  FleetIcon,
  MetalIcon,
  PirateIcon,
  StarbaseIcon,
  TradeStationIcon,
} from './icons.tsx';

type IconComponent = ComponentType<{ size?: number }>;

export type PlayerShape = 'circle' | 'square' | 'triangle' | 'diamond';

export interface PlayerStyle {
  color: string;
  shape: PlayerShape;
}

export interface Theme {
  id: 'space';
  titleKey: MessageKey;
  resources: Record<Resource, { labelKey: MessageKey; color: string; Icon: IconComponent }>;
  sectorFill: Record<Resource | 'nebula' | 'home', string>;
  /** Indexed by seat. Colour-blind safe palette; the shape doubles the colour. */
  players: PlayerStyle[];
  Icons: {
    Fleet: IconComponent;
    Colony: IconComponent;
    Starbase: IconComponent;
    Pirate: IconComponent;
    TradeStation: IconComponent;
    Dice: IconComponent;
  };
  background: string;
}

const RESOURCE_COLORS: Record<Resource, string> = {
  metal: '#9AA5B1',
  energy: '#F2C94C',
  crystal: '#7FD3F7',
  biomass: '#6FCF97',
};

export const spaceTheme: Theme = {
  id: 'space',
  titleKey: 'theme.space.title',
  resources: {
    metal: {
      labelKey: 'theme.space.resource.metal',
      color: RESOURCE_COLORS.metal,
      Icon: MetalIcon,
    },
    energy: {
      labelKey: 'theme.space.resource.energy',
      color: RESOURCE_COLORS.energy,
      Icon: EnergyIcon,
    },
    crystal: {
      labelKey: 'theme.space.resource.crystal',
      color: RESOURCE_COLORS.crystal,
      Icon: CrystalIcon,
    },
    biomass: {
      labelKey: 'theme.space.resource.biomass',
      color: RESOURCE_COLORS.biomass,
      Icon: BiomassIcon,
    },
  },
  sectorFill: { ...RESOURCE_COLORS, nebula: '#3B2F5C', home: '#1F2A44' },
  players: [
    { color: '#E69F00', shape: 'circle' },
    { color: '#56B4E9', shape: 'square' },
    { color: '#009E73', shape: 'triangle' },
    { color: '#CC79A7', shape: 'diamond' },
  ],
  Icons: {
    Fleet: FleetIcon,
    Colony: ColonyIcon,
    Starbase: StarbaseIcon,
    Pirate: PirateIcon,
    TradeStation: TradeStationIcon,
    Dice: DiceIcon,
  },
  background: 'radial-gradient(ellipse at center, #0B1020 0%, #05070F 100%)',
};

/** Colour and shape of the player in `seat` (0-3). */
export function playerStyle(seat: number): PlayerStyle {
  const style = spaceTheme.players[seat];
  if (style === undefined) throw new RangeError(`No player style for seat ${seat}`);
  return style;
}
