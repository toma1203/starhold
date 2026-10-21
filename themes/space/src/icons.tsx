import type { ReactNode } from 'react';

/** Props shared by every icon. Icons carry no text: labels come from i18n via a labelKey. */
export interface IconProps {
  size?: number;
}

function Svg({ size = 24, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
    >
      {children}
    </svg>
  );
}

/** Ingot of metal: lit top face over a solid front. */
export function MetalIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M7 5h10l5 7H2z" fillOpacity="0.6" />
      <path d="M2 13h20v6H2z" />
    </Svg>
  );
}

/** Lightning bolt. */
export function EnergyIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </Svg>
  );
}

/** Cut gem with a lighter crown facet. */
export function CrystalIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M7 3h10l5 6-10 12L2 9z" />
      <path d="M7 3h10l-2 6H9z" fill="#fff" fillOpacity="0.35" />
    </Svg>
  );
}

/** Leaf with a vein cut out. */
export function BiomassIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        fillRule="evenodd"
        d="M20 4C11 4 5 8.5 5 14.5c0 2.5 1 4.5 2.5 6C8 15 11 11 16 8.5c-3.5 3-6 6.5-7 12.3.7.1 1.3.2 2 .2 6 0 9-5.5 9-17z"
      />
    </Svg>
  );
}

/** Starship: pointed hull with a porthole. */
export function FleetIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path fillRule="evenodd" d="M12 2l6 10v7l-3-2H9l-3 2v-7zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
    </Svg>
  );
}

/** Habitat dome on a base, with an antenna and a doorway. */
export function ColonyIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path fillRule="evenodd" d="M3 18a9 9 0 0 1 18 0zm7.5 0v-4a1.5 1.5 0 0 1 3 0v4z" />
      <path d="M11.5 3h1v6h-1z" />
      <path d="M2 19.5h20v2H2z" />
    </Svg>
  );
}

/** Orbital station: ring, hub and four spokes. */
export function StarbaseIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        fillRule="evenodd"
        d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14z"
      />
      <circle cx="12" cy="12" r="3" />
      <path d="M11 5h2v4h-2zM11 15h2v4h-2zM5 11h4v2H5zM15 11h4v2h-4z" />
    </Svg>
  );
}

/** Skull over crossed bones. */
export function PirateIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        d="M4 21l16-6M20 21L4 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        fillRule="evenodd"
        d="M12 2.5a6.5 6.5 0 0 0-6.5 6.5c0 2 .9 3.7 2.3 4.9V16h8.4v-2.1c1.4-1.2 2.3-2.9 2.3-4.9A6.5 6.5 0 0 0 12 2.5zM9 8a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 9 8zm6 0a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 15 8z"
      />
    </Svg>
  );
}

/** Two opposing arrows: exchange. */
export function TradeStationIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M3 6h12V3l6 5-6 5v-3H3z" />
      <path d="M21 14H9v-3l-6 5 6 5v-3h12z" />
    </Svg>
  );
}

/** Die showing five, pips cut out. */
export function DiceIcon({ size }: IconProps) {
  return (
    <Svg size={size}>
      <path
        fillRule="evenodd"
        d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM8 14.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"
      />
    </Svg>
  );
}
