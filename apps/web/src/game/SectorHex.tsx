import { memo } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { tPlural } from '@starhold/i18n';
import type { Locale, Translate } from '@starhold/i18n';
import type { Resource, SectorId, SectorKind, Structure } from '@starhold/engine';
import { playerStyle, spaceTheme } from '@starhold/theme-space';
import { useT } from '../i18n/useT.ts';
import { useGameStore } from '../store/gameStore.ts';
import { PlayerMarker } from '../ui/PlayerMarker.tsx';
import { hexCorners, hexToPixel } from './geometry.ts';

const INK = '#0B1020';
const TOKEN_FILL = '#F5EFE0';
const TOKEN_TEXT = '#1B2236';
/** Warm accent for the 6 and 8 (the likeliest rolls); 4.4:1 on TOKEN_FILL. */
const TOKEN_TEXT_HOT = '#C2410C';
const PIRATE_TINT = '#FFB3B3';
const ORIGIN = { x: 0, y: 0 };

export interface SectorHexProps {
  id: SectorId;
  q: number;
  r: number;
  size: number;
  kind: SectorKind;
  resource: Resource | null;
  number: number | null;
  tradeStation: boolean;
  structure: Structure;
  fleets: number;
  /** Seat of the owner, or null when unclaimed. */
  ownerSeat: number | null;
  ownerName: string | null;
  mine: boolean;
  hasPirate: boolean;
  selected: boolean;
  target: boolean;
  onSelect: (id: SectorId) => void;
}

function baseLabel(p: SectorHexProps, t: Translate): string {
  if (p.kind === 'resource' && p.resource !== null) {
    const resource = t(spaceTheme.resources[p.resource].labelKey);
    return p.number === null ? resource : t('map.sector.resource', { resource, number: p.number });
  }
  return t(p.kind === 'home' ? 'theme.space.sector.home' : 'theme.space.sector.nebula');
}

/** Spoken description, e.g. "Crystal 8, yours, 3 fleets, Colony". All words come from i18n. */
function ariaLabel(p: SectorHexProps, t: Translate, locale: Locale): string {
  const parts = [baseLabel(p, t)];
  if (p.ownerSeat === null) parts.push(t('map.unclaimed'));
  else parts.push(p.mine ? t('map.yours') : t('map.ownedBy', { player: p.ownerName ?? '' }));
  if (p.fleets > 0) parts.push(tPlural(t, locale, 'map.fleets', p.fleets));
  if (p.structure === 'colony') parts.push(t('theme.space.unit.colony'));
  if (p.structure === 'starbase') parts.push(t('theme.space.unit.starbase'));
  if (p.tradeStation) parts.push(t('theme.space.sector.tradeStation'));
  if (p.hasPirate) parts.push(t('theme.space.unit.pirates'));
  if (p.target) parts.push(t('map.target'));
  return parts.join(', ');
}

/** An icon centred on (cx, cy); icons draw from their top-left corner. */
function Slot({
  cx,
  cy,
  size,
  color,
  part,
  children,
}: {
  cx: number;
  cy: number;
  size: number;
  color: string;
  part?: string;
  children: ReactNode;
}) {
  return (
    <g
      transform={`translate(${cx - size / 2} ${cy - size / 2})`}
      style={{ color }}
      data-part={part}
    >
      {children}
    </g>
  );
}

function Disc({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return <circle cx={cx} cy={cy} r={r} fill={INK} fillOpacity={0.82} />;
}

function SectorHexView(p: SectorHexProps) {
  const t = useT();
  const locale = useGameStore((s) => s.locale);
  const { size: S } = p;
  const center = hexToPixel({ q: p.q, r: p.r }, S);
  const fillKey = p.kind === 'resource' ? (p.resource ?? 'nebula') : p.kind;
  const owner = p.ownerSeat === null ? null : playerStyle(p.ownerSeat);
  const { Fleet, Colony, Starbase, Pirate, TradeStation } = spaceTheme.Icons;
  const ResourceIcon = p.resource === null ? null : spaceTheme.resources[p.resource].Icon;
  const StructureIcon = p.structure === 'starbase' ? Starbase : Colony;
  const hot = p.number === 6 || p.number === 8;
  const activate = () => p.onSelect(p.id);

  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); // Space must not scroll the page
    activate();
  };

  return (
    <g
      className="sector"
      data-sector={p.id}
      data-target={p.target}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel(p, t, locale)}
      aria-pressed={p.selected}
      transform={`translate(${center.x} ${center.y})`}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      <polygon
        data-part="hex"
        points={hexCorners(ORIGIN, S)}
        fill={spaceTheme.sectorFill[fillKey]}
        stroke={INK}
        strokeWidth={S * 0.04}
        strokeLinejoin="round"
      />
      {owner !== null && (
        <polygon
          data-part="owner-ring"
          points={hexCorners(ORIGIN, S * 0.86)}
          fill="none"
          stroke={owner.color}
          strokeWidth={S * 0.08}
          strokeLinejoin="round"
        />
      )}

      {ResourceIcon !== null && (
        <Slot cx={-0.3 * S} cy={-0.58 * S} size={0.3 * S} color={INK} part="resource-icon">
          <ResourceIcon size={0.3 * S} />
        </Slot>
      )}
      {p.hasPirate && (
        <g data-part="pirate">
          <Disc cx={0.3 * S} cy={-0.55 * S} r={0.17 * S} />
          <Slot cx={0.3 * S} cy={-0.55 * S} size={0.24 * S} color={PIRATE_TINT}>
            <Pirate size={0.24 * S} />
          </Slot>
        </g>
      )}

      {p.kind === 'resource' && p.number !== null && (
        <g>
          <circle data-part="number-token" cx={0} cy={-0.08 * S} r={0.25 * S} fill={TOKEN_FILL} />
          <text
            data-part="number"
            data-emphasis={hot ? 'hot' : 'normal'}
            x={0}
            y={-0.08 * S}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={(hot ? 0.34 : 0.29) * S}
            fontWeight={hot ? 800 : 600}
            fontFamily="var(--font-body)"
            fill={hot ? TOKEN_TEXT_HOT : TOKEN_TEXT}
          >
            {p.number}
          </text>
        </g>
      )}

      {p.tradeStation && (
        <g data-part="trade-station">
          <Disc cx={-0.58 * S} cy={-0.18 * S} r={0.17 * S} />
          <Slot cx={-0.58 * S} cy={-0.18 * S} size={0.24 * S} color="#fff">
            <TradeStation size={0.24 * S} />
          </Slot>
        </g>
      )}
      {owner !== null && p.ownerSeat !== null && (
        <g transform={`translate(${0.58 * S - 0.12 * S} ${-0.18 * S - 0.12 * S})`}>
          <Disc cx={0.12 * S} cy={0.12 * S} r={0.17 * S} />
          <PlayerMarker seat={p.ownerSeat} size={0.24 * S} />
        </g>
      )}

      {p.structure !== 'none' && (
        <g data-part="structure" data-structure={p.structure}>
          <Disc cx={-0.28 * S} cy={0.45 * S} r={0.17 * S} />
          <Slot cx={-0.28 * S} cy={0.45 * S} size={0.24 * S} color="#fff">
            <StructureIcon size={0.24 * S} />
          </Slot>
        </g>
      )}
      {p.fleets > 0 && (
        <g>
          <rect
            x={0.02 * S}
            y={0.45 * S - 0.17 * S}
            width={0.56 * S}
            height={0.34 * S}
            rx={0.17 * S}
            fill={INK}
            fillOpacity={0.82}
          />
          <Slot cx={0.17 * S} cy={0.45 * S} size={0.22 * S} color="#fff">
            <Fleet size={0.22 * S} />
          </Slot>
          <text
            data-part="fleet-count"
            x={0.38 * S}
            y={0.45 * S}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={0.25 * S}
            fontWeight={700}
            fontFamily="var(--font-body)"
            fill="#fff"
          >
            {p.fleets}
          </text>
        </g>
      )}

      {p.target && (
        <polygon
          className="hex-target"
          points={hexCorners(ORIGIN, S * 0.94)}
          fill="none"
          strokeWidth={S * 0.09}
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
      {p.selected && (
        <polygon
          className="hex-selected"
          points={hexCorners(ORIGIN, S * 0.94)}
          fill="none"
          strokeWidth={S * 0.1}
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}
      <polygon
        className="hex-focus"
        points={hexCorners(ORIGIN, S * 0.98)}
        fill="none"
        strokeWidth={S * 0.07}
        strokeLinejoin="round"
        pointerEvents="none"
      />
    </g>
  );
}

/**
 * Props are all primitives, so the default shallow comparison skips every sector whose data did
 * not change: the map receives a fresh deep copy of the view on each `game:state`.
 */
export const SectorHex = memo(SectorHexView);
