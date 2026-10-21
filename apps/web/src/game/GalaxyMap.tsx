import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PlayerView, SectorId } from '@starhold/engine';
import { useT } from '../i18n/useT.ts';
import { Button } from '../ui/Button.tsx';
import { IDENTITY, clampTransform, mapBounds, zoomAt } from './geometry.ts';
import type { Bounds, Point, Transform } from './geometry.ts';
import { highlightTargets } from './selection.ts';
import { SectorHex } from './SectorHex.tsx';

const HEX_SIZE = 40;
const PADDING = 12;
/** Pointer travel (px) before a press becomes a drag instead of a click. */
const DRAG_THRESHOLD = 4;
const WHEEL_SENSITIVITY = 0.0015;

export interface GalaxyMapProps {
  view: PlayerView;
  me: string;
  selected: SectorId | null;
  onSectorClick: (id: SectorId) => void;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Maps client pixels to view-box units, honouring the letterboxing of `meet`. */
function pointToView(svg: SVGSVGElement | null, vb: Bounds, client: Point): Point {
  const rect = svg?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return client;
  const scale = Math.min(rect.width / vb.width, rect.height / vb.height);
  return {
    x: vb.minX + (client.x - rect.left - (rect.width - vb.width * scale) / 2) / scale,
    y: vb.minY + (client.y - rect.top - (rect.height - vb.height * scale) / 2) / scale,
  };
}

/** View-box units per client pixel. */
function unitsPerPixel(svg: SVGSVGElement | null, vb: Bounds): number {
  const rect = svg?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return 1;
  return 1 / Math.min(rect.width / vb.width, rect.height / vb.height);
}

export function GalaxyMap({ view, me, selected, onSectorClick }: GalaxyMapProps) {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tr, setTr] = useState<Transform>(IDENTITY);

  const sectors = useMemo(
    () => view.sectorIds.flatMap((id) => (view.sectors[id] ? [view.sectors[id]] : [])),
    [view.sectorIds, view.sectors],
  );
  const bounds = mapBounds(sectors, HEX_SIZE);
  const vb: Bounds = {
    minX: bounds.minX - PADDING,
    minY: bounds.minY - PADDING,
    width: bounds.width + 2 * PADDING,
    height: bounds.height + 2 * PADDING,
  };
  const vbRef = useRef(vb);
  vbRef.current = vb;

  const targets = useMemo(() => highlightTargets(view, me, selected), [view, me, selected]);
  const players = useMemo(() => new Map(view.players.map((p) => [p.id, p])), [view.players]);

  const clickRef = useRef(onSectorClick);
  useEffect(() => {
    clickRef.current = onSectorClick;
  });
  /** True from the first drag movement until just after the pointer is lifted. */
  const dragged = useRef(false);
  const pointers = useRef(new Map<number, Point>());
  const pressStart = useRef<Point>({ x: 0, y: 0 });

  const select = useCallback((id: SectorId) => {
    if (dragged.current) return; // the release of a drag is not a click
    clickRef.current(id);
  }, []);

  // React registers wheel listeners as passive, which cannot stop the page from scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const at = pointToView(svg, vbRef.current, { x: e.clientX, y: e.clientY });
      const factor = Math.exp(-e.deltaY * WHEEL_SENSITIVITY);
      setTr((cur) => zoomAt(cur, at, factor, vbRef.current));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const point = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, point);
    if (pointers.current.size === 1) {
      dragged.current = false;
      pressStart.current = point;
    } else {
      dragged.current = true; // a second finger makes this a pinch, never a tap
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    const current = { x: e.clientX, y: e.clientY };
    const svg = svgRef.current;
    const k = unitsPerPixel(svg, vbRef.current);

    if (pointers.current.size >= 2) {
      const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
      pointers.current.set(e.pointerId, current);
      if (!other) return;
      const before = distance(previous, other);
      const after = distance(current, other);
      const mid = midpoint(current, other);
      const shift = {
        x: mid.x - midpoint(previous, other).x,
        y: mid.y - midpoint(previous, other).y,
      };
      const at = pointToView(svg, vbRef.current, mid);
      setTr((cur) => {
        const zoomed = before > 0 ? zoomAt(cur, at, after / before, vbRef.current) : cur;
        return clampTransform(
          { ...zoomed, x: zoomed.x + shift.x * k, y: zoomed.y + shift.y * k },
          vbRef.current,
        );
      });
      return;
    }

    if (!dragged.current) {
      if (distance(current, pressStart.current) < DRAG_THRESHOLD) return;
      dragged.current = true;
      // Capturing earlier would redirect the click away from the hex that was pressed.
      if (typeof svg?.setPointerCapture === 'function') svg.setPointerCapture(e.pointerId);
    }
    pointers.current.set(e.pointerId, current);
    const dx = (current.x - previous.x) * k;
    const dy = (current.y - previous.y) * k;
    setTr((cur) => clampTransform({ ...cur, x: cur.x + dx, y: cur.y + dy }, vbRef.current));
  };

  const onPointerEnd = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!pointers.current.delete(e.pointerId)) return;
    if (typeof svg?.hasPointerCapture === 'function' && svg.hasPointerCapture(e.pointerId)) {
      svg.releasePointerCapture(e.pointerId);
    }
    if (pointers.current.size === 1) {
      // One finger of a pinch stays down: continue as a pan from where it is now.
      const [remaining] = [...pointers.current.values()];
      if (remaining) pressStart.current = remaining;
    }
    if (pointers.current.size === 0) {
      // The click for this release is dispatched right after; clear the flag once it has passed.
      setTimeout(() => {
        if (pointers.current.size === 0) dragged.current = false;
      }, 0);
    }
  };

  return (
    <div className="galaxy-map">
      <svg
        ref={svgRef}
        role="group"
        aria-label={t('map.title')}
        className="galaxy-map-svg"
        viewBox={`${vb.minX} ${vb.minY} ${vb.width} ${vb.height}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <g data-testid="map-viewport" transform={`translate(${tr.x} ${tr.y}) scale(${tr.scale})`}>
          {sectors.map((sector) => {
            const owner = sector.owner === null ? undefined : players.get(sector.owner);
            return (
              <SectorHex
                key={sector.id}
                id={sector.id}
                q={sector.hex.q}
                r={sector.hex.r}
                size={HEX_SIZE}
                kind={sector.kind}
                resource={sector.resource}
                number={sector.number}
                tradeStation={sector.tradeStation}
                structure={sector.structure}
                fleets={sector.fleets}
                ownerSeat={owner?.seat ?? null}
                ownerName={owner?.name ?? null}
                mine={sector.owner === me}
                hasPirate={view.pirate === sector.id}
                selected={selected === sector.id}
                target={targets.has(sector.id)}
                onSelect={select}
              />
            );
          })}
        </g>
      </svg>
      <Button variant="ghost" className="map-reset" onClick={() => setTr(IDENTITY)}>
        {t('map.resetView')}
      </Button>
    </div>
  );
}
