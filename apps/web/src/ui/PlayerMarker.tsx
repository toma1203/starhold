import { playerStyle } from '@starhold/theme-space';

/** Seat colour plus shape, so players stay distinguishable without relying on colour alone. */
export function PlayerMarker({ seat, size = 16 }: { seat: number; size?: number }) {
  const { color, shape } = playerStyle(seat);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      data-testid="player-marker"
      data-shape={shape}
      data-color={color}
    >
      {shape === 'circle' && <circle cx="8" cy="8" r="7" fill={color} />}
      {shape === 'square' && <rect x="1.5" y="1.5" width="13" height="13" fill={color} />}
      {shape === 'triangle' && <polygon points="8,1 15,15 1,15" fill={color} />}
      {shape === 'diamond' && <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill={color} />}
    </svg>
  );
}
