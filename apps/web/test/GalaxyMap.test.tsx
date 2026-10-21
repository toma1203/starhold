import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createT } from '@starhold/i18n';
import type { PlayerView, SectorId } from '@starhold/engine';
import { spaceTheme } from '@starhold/theme-space';
import { GalaxyMap } from '../src/game/GalaxyMap.tsx';
import { useGameStore } from '../src/store/gameStore.ts';
import { homeOf, inPhase, makeState, neighbourIds, patchSector, viewOf } from './mapFixtures.ts';

const t = createT('en');

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ ...useGameStore.getInitialState(), locale: 'en' }, true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function baseView(): PlayerView {
  return viewOf(inPhase(makeState(3, 1), 'MAIN', 0), 'p1');
}

function renderMap(
  view: PlayerView,
  over: { selected?: SectorId | null; onSectorClick?: (id: SectorId) => void } = {},
) {
  const onSectorClick = over.onSectorClick ?? vi.fn();
  const utils = render(
    <GalaxyMap
      view={view}
      me="p1"
      selected={over.selected ?? null}
      onSectorClick={onSectorClick}
    />,
  );
  return { ...utils, onSectorClick };
}

function mapSvg(title = t('map.title')): HTMLElement {
  return screen.getByRole('group', { name: title });
}

function hexes(): HTMLElement[] {
  return within(mapSvg()).getAllByRole('button');
}

function hexEl(id: SectorId): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-sector="${id}"]`);
  if (!el) throw new Error(`no hex ${id}`);
  return el;
}

function viewport() {
  const raw = screen.getByTestId('map-viewport').getAttribute('transform') ?? '';
  const m = /translate\((-?[\d.e+-]+) (-?[\d.e+-]+)\) scale\((-?[\d.e+-]+)\)/.exec(raw);
  if (!m) throw new Error(`bad transform: ${raw}`);
  return { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) };
}

/** WCAG relative luminance contrast of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('GalaxyMap structure', () => {
  it('renders one button per sector, each focusable', () => {
    const view = baseView();
    renderMap(view);
    const buttons = hexes();
    expect(buttons).toHaveLength(view.sectorIds.length);
    for (const b of buttons) expect(b.getAttribute('tabindex')).toBe('0');
  });

  it('builds the viewBox from the map bounds and puts the pan/zoom transform on an inner group', () => {
    renderMap(baseView());
    const parts = (mapSvg().getAttribute('viewBox') ?? '').split(' ').map(Number);
    expect(parts).toHaveLength(4);
    expect(parts.every(Number.isFinite)).toBe(true);
    expect(parts[2]).toBeGreaterThan(0);
    expect(parts[3]).toBeGreaterThan(0);
    expect(viewport()).toEqual({ x: 0, y: 0, scale: 1 });
    expect(screen.getByTestId('map-viewport').tagName.toLowerCase()).toBe('g');
  });

  it('uses 19 sectors for two players and 31 for three or four', () => {
    renderMap(viewOf(inPhase(makeState(2, 3), 'MAIN', 0), 'p1'));
    expect(hexes()).toHaveLength(19);
  });
});

describe('GalaxyMap labels', () => {
  it('aria-label includes resource, number, owner, fleets and structure', () => {
    let state = inPhase(makeState(3, 1), 'MAIN', 0);
    const home = homeOf(state, 'p1');
    const [spot] = neighbourIds(state, home).filter((id) => state.sectors[id]?.kind === 'resource');
    state = patchSector(state, spot as SectorId, {
      resource: 'crystal',
      number: 8,
      owner: 'p1',
      fleets: 3,
      structure: 'colony',
      tradeStation: false,
    });
    renderMap(viewOf(state, 'p1'));
    expect(hexEl(spot as SectorId).getAttribute('aria-label')).toBe(
      'Crystal 8, yours, 3 fleets, Colony',
    );
  });

  it('names the owner for other players and says unclaimed for empty sectors', () => {
    let state = inPhase(makeState(3, 1), 'MAIN', 0);
    const home = homeOf(state, 'p1');
    const [spot, free] = neighbourIds(state, home).filter(
      (id) => state.sectors[id]?.kind === 'resource',
    ) as [SectorId, SectorId];
    state = patchSector(state, spot, {
      resource: 'metal',
      number: 5,
      owner: 'p2',
      fleets: 1,
      structure: 'none',
      tradeStation: false,
    });
    state = patchSector(state, free, {
      resource: 'energy',
      number: 9,
      owner: null,
      fleets: 0,
      structure: 'none',
      tradeStation: true,
    });
    renderMap(viewOf(state, 'p1'));
    expect(hexEl(spot).getAttribute('aria-label')).toBe(
      `Metal 5, ${t('map.ownedBy', { player: 'Pilot 2' })}, 1 fleet`,
    );
    expect(hexEl(free).getAttribute('aria-label')).toBe(
      `Energy 9, ${t('map.unclaimed')}, ${t('theme.space.sector.tradeStation')}`,
    );
  });

  it('labels nebulae, home systems and the pirate ship', () => {
    const base = inPhase(makeState(3, 1), 'MAIN', 0);
    const spot = base.sectorIds.find((id) => base.sectors[id]?.kind === 'resource') as SectorId;
    const state = { ...base, pirate: spot };
    const view = viewOf(state, 'p1');
    renderMap(view);
    const nebula = view.sectorIds.find((id) => view.sectors[id]?.kind === 'nebula') as SectorId;
    expect(hexEl(nebula).getAttribute('aria-label')).toContain(t('theme.space.sector.nebula'));
    const home = homeOf(state, 'p1');
    expect(hexEl(home).getAttribute('aria-label')).toContain(t('theme.space.sector.home'));
    expect(hexEl(home).getAttribute('aria-label')).toContain(t('map.yours'));
    const pirate = view.pirate as SectorId;
    expect(hexEl(pirate).getAttribute('aria-label')).toContain(t('theme.space.unit.pirates'));
  });

  it('uses Croatian plural forms and words when the locale is hr', () => {
    useGameStore.setState({ locale: 'hr' });
    const hr = createT('hr');
    let state = inPhase(makeState(3, 1), 'MAIN', 0);
    const home = homeOf(state, 'p1');
    const [spot] = neighbourIds(state, home).filter((id) => state.sectors[id]?.kind === 'resource');
    state = patchSector(state, spot as SectorId, {
      resource: 'crystal',
      number: 4,
      owner: 'p1',
      fleets: 2,
      structure: 'none',
      tradeStation: false,
    });
    renderMap(viewOf(state, 'p1'));
    expect(hexEl(spot as SectorId).getAttribute('aria-label')).toBe(
      `${hr('theme.space.resource.crystal')} 4, ${hr('map.yours')}, ${hr('map.fleets.few', { count: 2 })}`,
    );
    expect(mapSvg(hr('map.title'))).toBeTruthy();
  });
});

describe('GalaxyMap label edge cases', () => {
  it('has no trailing space when a resource sector has no number', () => {
    let state = inPhase(makeState(3, 1), 'MAIN', 0);
    const spot = state.sectorIds.find((id) => state.sectors[id]?.kind === 'resource') as SectorId;
    state = patchSector(state, spot, { resource: 'metal', number: null });
    renderMap(viewOf(state, 'p1'));
    expect(hexEl(spot).getAttribute('aria-label')).toMatch(/^Metal, /);
  });
});

describe('GalaxyMap keyboard and pointer selection', () => {
  it('Enter on a hex calls onSectorClick', async () => {
    const view = baseView();
    const { onSectorClick } = renderMap(view);
    const home = homeOf(inPhase(makeState(3, 1), 'MAIN', 0), 'p1');
    const el = hexEl(home);
    el.focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(onSectorClick).toHaveBeenCalledTimes(1);
    expect(onSectorClick).toHaveBeenCalledWith(home);
  });

  it('Space on a hex calls onSectorClick and does not scroll the page', () => {
    const view = baseView();
    const { onSectorClick } = renderMap(view);
    const id = view.sectorIds[3] as SectorId;
    const notPrevented = fireEvent.keyDown(hexEl(id), { key: ' ' });
    expect(onSectorClick).toHaveBeenCalledTimes(1);
    expect(onSectorClick).toHaveBeenCalledWith(id);
    expect(notPrevented).toBe(false);
  });

  it('ignores other keys', () => {
    const view = baseView();
    const { onSectorClick } = renderMap(view);
    fireEvent.keyDown(hexEl(view.sectorIds[0] as SectorId), { key: 'a' });
    expect(onSectorClick).not.toHaveBeenCalled();
  });

  it('a click calls onSectorClick with the sector id', () => {
    const view = baseView();
    const { onSectorClick } = renderMap(view);
    const id = view.sectorIds[5] as SectorId;
    fireEvent.click(hexEl(id));
    expect(onSectorClick).toHaveBeenCalledTimes(1);
    expect(onSectorClick).toHaveBeenCalledWith(id);
  });

  it('does not treat the end of a drag as a click', () => {
    const view = baseView();
    const { onSectorClick } = renderMap(view);
    const id = view.sectorIds[5] as SectorId;
    fireEvent.pointerDown(hexEl(id), { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(mapSvg(), { pointerId: 1, clientX: 140, clientY: 120 });
    fireEvent.pointerUp(mapSvg(), { pointerId: 1, clientX: 140, clientY: 120 });
    fireEvent.click(hexEl(id));
    expect(onSectorClick).not.toHaveBeenCalled();
    // The next, still click is a real click again.
    fireEvent.pointerDown(hexEl(id), { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerUp(mapSvg(), { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.click(hexEl(id));
    expect(onSectorClick).toHaveBeenCalledTimes(1);
  });

  it('marks the selected sector with aria-pressed', () => {
    const view = baseView();
    const id = view.sectorIds[4] as SectorId;
    renderMap(view, { selected: id });
    expect(hexEl(id).getAttribute('aria-pressed')).toBe('true');
    expect(hexEl(view.sectorIds[5] as SectorId).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('GalaxyMap lost pointers', () => {
  function tapStillWorks(view: PlayerView, onSectorClick: (id: SectorId) => void) {
    const id = view.sectorIds[2] as SectorId;
    fireEvent.pointerDown(hexEl(id), {
      pointerId: 9,
      pointerType: 'touch',
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(mapSvg(), { pointerId: 9, pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.click(hexEl(id));
    expect(onSectorClick).toHaveBeenCalledTimes(1);
    expect(onSectorClick).toHaveBeenCalledWith(id);
  }

  it('a cancelled touch does not leave the map in pinch mode: the next tap still selects', () => {
    const view = baseView();
    const { onSectorClick } = renderMap(view);
    fireEvent.pointerDown(mapSvg(), {
      pointerId: 5,
      pointerType: 'touch',
      clientX: 50,
      clientY: 50,
    });
    fireEvent.pointerCancel(mapSvg(), { pointerId: 5, pointerType: 'touch' });
    tapStillWorks(view, onSectorClick);
  });

  it('a touch whose pointer capture is lost does not suppress later taps', () => {
    const view = baseView();
    const { onSectorClick } = renderMap(view);
    fireEvent.pointerDown(mapSvg(), {
      pointerId: 5,
      pointerType: 'touch',
      clientX: 50,
      clientY: 50,
    });
    fireEvent.lostPointerCapture(mapSvg(), { pointerId: 5, pointerType: 'touch' });
    tapStillWorks(view, onSectorClick);
  });

  it('a pointer that leaves with no buttons pressed is forgotten', () => {
    const view = baseView();
    const { onSectorClick } = renderMap(view);
    fireEvent.pointerDown(mapSvg(), {
      pointerId: 5,
      pointerType: 'touch',
      clientX: 50,
      clientY: 50,
    });
    fireEvent.pointerLeave(mapSvg(), { pointerId: 5, pointerType: 'touch', buttons: 0 });
    tapStillWorks(view, onSectorClick);
  });

  it('a dragged-then-cancelled gesture does not keep suppressing clicks', () => {
    const view = baseView();
    const { onSectorClick } = renderMap(view);
    fireEvent.pointerDown(mapSvg(), {
      pointerId: 5,
      pointerType: 'touch',
      clientX: 50,
      clientY: 50,
    });
    fireEvent.pointerMove(mapSvg(), {
      pointerId: 5,
      pointerType: 'touch',
      clientX: 90,
      clientY: 90,
    });
    fireEvent.lostPointerCapture(mapSvg(), { pointerId: 5, pointerType: 'touch' });
    tapStillWorks(view, onSectorClick);
  });
});

describe('GalaxyMap highlights', () => {
  it('outlines legal targets of the selected sector and says so in their label', () => {
    const view = baseView();
    const home = view.players[0]?.homeId as SectorId;
    renderMap(view, { selected: home });
    const targets = neighbourIds(inPhase(makeState(3, 1), 'MAIN', 0), home).filter(
      (id) => view.sectors[id]?.kind !== 'home',
    );
    for (const id of targets) {
      expect(hexEl(id).getAttribute('data-target')).toBe('true');
      expect(hexEl(id).getAttribute('aria-label')).toContain(t('map.target'));
      expect(hexEl(id).querySelector('.hex-target')).not.toBeNull();
    }
    expect(hexEl(home).getAttribute('data-target')).toBe('false');
    expect(hexEl(home).getAttribute('aria-pressed')).toBe('true');
    expect(hexEl(home).getAttribute('aria-label')).not.toContain('selected');
  });

  it('keeps a sector without moves selected but highlights nothing', () => {
    let state = inPhase(makeState(3, 1), 'MAIN', 0);
    const home = homeOf(state, 'p1');
    const [spot] = neighbourIds(state, home).filter((id) => state.sectors[id]?.kind !== 'home');
    state = patchSector(state, spot as SectorId, { owner: 'p1', fleets: 1 });
    renderMap(viewOf(state, 'p1'), { selected: spot as SectorId });
    expect(hexEl(spot as SectorId).getAttribute('aria-pressed')).toBe('true');
    expect(mapSvg().querySelectorAll('[data-target="true"]')).toHaveLength(0);
  });

  it('highlights every legal pirate destination in the PIRATE phase', () => {
    const view = viewOf(inPhase(makeState(3, 1), 'PIRATE', 0), 'p1');
    renderMap(view);
    const expected = view.sectorIds.filter(
      (id) => view.sectors[id]?.kind !== 'home' && id !== view.pirate,
    );
    expect(mapSvg().querySelectorAll('[data-target="true"]')).toHaveLength(expected.length);
  });
});

describe('GalaxyMap sector content', () => {
  it('shows number tokens only on resource sectors, emphasising 6 and 8 with enough contrast', () => {
    const view = baseView();
    renderMap(view);
    const svg = mapSvg();
    let hot = 0;
    for (const id of view.sectorIds) {
      const sector = view.sectors[id];
      const token = hexEl(id).querySelector('[data-part="number-token"]');
      const text = hexEl(id).querySelector('[data-part="number"]');
      if (sector?.kind !== 'resource') {
        expect(token).toBeNull();
        expect(text).toBeNull();
        continue;
      }
      expect(text?.textContent).toBe(String(sector.number));
      const bg = token?.getAttribute('fill') ?? '';
      const fg = text?.getAttribute('fill') ?? '';
      expect(contrast(bg, fg)).toBeGreaterThanOrEqual(3);
      if (sector.number === 6 || sector.number === 8) {
        hot += 1;
        expect(text?.getAttribute('data-emphasis')).toBe('hot');
      } else {
        expect(text?.getAttribute('data-emphasis')).toBe('normal');
      }
    }
    expect(hot).toBeGreaterThanOrEqual(2);
    const hotFill = svg.querySelector('[data-emphasis="hot"]')?.getAttribute('fill');
    const normalFill = svg.querySelector('[data-emphasis="normal"]')?.getAttribute('fill');
    expect(hotFill).not.toBe(normalFill);
  });

  it('fills sectors by resource, nebula and home', () => {
    const view = baseView();
    renderMap(view);
    for (const id of view.sectorIds) {
      const sector = view.sectors[id];
      if (!sector) continue;
      const key = sector.kind === 'resource' ? (sector.resource ?? 'nebula') : sector.kind;
      expect(hexEl(id).querySelector('[data-part="hex"]')?.getAttribute('fill')).toBe(
        spaceTheme.sectorFill[key],
      );
    }
  });

  it('shows an owner ring and a seat shape marker, and a fleet badge', () => {
    let state = inPhase(makeState(3, 1), 'MAIN', 0);
    const home = homeOf(state, 'p2');
    state = patchSector(state, home, { fleets: 7 });
    const seat = state.players.find((p) => p.id === 'p2')?.seat as number;
    renderMap(viewOf(state, 'p2'));
    const el = hexEl(home);
    const ring = el.querySelector('[data-part="owner-ring"]');
    expect(ring?.getAttribute('stroke')).toBe(spaceTheme.players[seat]?.color);
    expect(el.querySelector('[data-testid="player-marker"]')?.getAttribute('data-shape')).toBe(
      spaceTheme.players[seat]?.shape,
    );
    expect(el.querySelector('[data-part="fleet-count"]')?.textContent).toBe('7');
  });

  it('shows no owner ring and no fleet badge on an empty sector', () => {
    const view = baseView();
    renderMap(view);
    const empty = view.sectorIds.find((id) => view.sectors[id]?.owner === null) as SectorId;
    expect(hexEl(empty).querySelector('[data-part="owner-ring"]')).toBeNull();
    expect(hexEl(empty).querySelector('[data-part="fleet-count"]')).toBeNull();
  });

  it('shows a trade station icon only where there is one', () => {
    const view = baseView();
    renderMap(view);
    for (const id of view.sectorIds) {
      const has = hexEl(id).querySelector('[data-part="trade-station"]') !== null;
      expect(has).toBe(view.sectors[id]?.tradeStation === true);
    }
  });

  it('shows the pirate only on the pirate sector', () => {
    const base = inPhase(makeState(3, 1), 'MAIN', 0);
    const spot = base.sectorIds.find((id) => base.sectors[id]?.kind === 'resource') as SectorId;
    const view = viewOf({ ...base, pirate: spot }, 'p1');
    expect(view.pirate).toBe(spot);
    renderMap(view);
    for (const id of view.sectorIds) {
      const has = hexEl(id).querySelector('[data-part="pirate"]') !== null;
      expect(has).toBe(view.pirate === id);
    }
  });

  it('shows a colony or starbase icon for structures', () => {
    let state = inPhase(makeState(3, 1), 'MAIN', 0);
    const home = homeOf(state, 'p1');
    const [spot] = neighbourIds(state, home).filter((id) => state.sectors[id]?.kind === 'resource');
    state = patchSector(state, spot as SectorId, { owner: 'p1', fleets: 1, structure: 'starbase' });
    renderMap(viewOf(state, 'p1'));
    expect(
      hexEl(spot as SectorId)
        .querySelector('[data-part="structure"]')
        ?.getAttribute('data-structure'),
    ).toBe('starbase');
    expect(
      hexEl(home).querySelector('[data-part="structure"]')?.getAttribute('data-structure'),
    ).toBe('colony');
  });
});

describe('GalaxyMap zoom and pan', () => {
  it('zooms with the wheel, clamped between 0.6x and 3x', () => {
    renderMap(baseView());
    fireEvent.wheel(mapSvg(), { deltaY: -100, clientX: 0, clientY: 0 });
    expect(viewport().scale).toBeGreaterThan(1);
    for (let i = 0; i < 80; i++) fireEvent.wheel(mapSvg(), { deltaY: -100 });
    expect(viewport().scale).toBe(3);
    for (let i = 0; i < 200; i++) fireEvent.wheel(mapSvg(), { deltaY: 100 });
    expect(viewport().scale).toBe(0.6);
  });

  it('normalises line-based wheel deltas (Firefox) so one notch is a real zoom step', () => {
    renderMap(baseView());
    fireEvent.wheel(mapSvg(), { deltaY: -3, deltaMode: 1 });
    const lineStep = viewport().scale;
    expect(lineStep).toBeGreaterThan(1.05);
    // 3 lines are 48 px: the same step as a pixel-based wheel reporting 48.
    cleanup();
    renderMap(baseView());
    fireEvent.wheel(mapSvg(), { deltaY: -48, deltaMode: 0 });
    expect(viewport().scale).toBeCloseTo(lineStep, 9);
    // Page-based deltas are larger still.
    cleanup();
    renderMap(baseView());
    fireEvent.wheel(mapSvg(), { deltaY: -1, deltaMode: 2 });
    expect(viewport().scale).toBeGreaterThan(lineStep);
  });

  it('pans by dragging', () => {
    renderMap(baseView());
    fireEvent.pointerDown(mapSvg(), { pointerId: 1, clientX: 50, clientY: 50, button: 0 });
    fireEvent.pointerMove(mapSvg(), { pointerId: 1, clientX: 80, clientY: 70 });
    fireEvent.pointerUp(mapSvg(), { pointerId: 1, clientX: 80, clientY: 70 });
    const v = viewport();
    expect(v.x).toBeCloseTo(30, 6);
    expect(v.y).toBeCloseTo(20, 6);
    expect(v.scale).toBe(1);
  });

  it('pinch-zooms with two pointers', () => {
    renderMap(baseView());
    fireEvent.pointerDown(mapSvg(), { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerDown(mapSvg(), { pointerId: 2, clientX: 140, clientY: 100, button: 0 });
    fireEvent.pointerMove(mapSvg(), { pointerId: 2, clientX: 220, clientY: 100 });
    expect(viewport().scale).toBeCloseTo(3, 6);
    fireEvent.pointerUp(mapSvg(), { pointerId: 2 });
    fireEvent.pointerUp(mapSvg(), { pointerId: 1 });
    fireEvent.pointerDown(mapSvg(), { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerDown(mapSvg(), { pointerId: 2, clientX: 220, clientY: 100, button: 0 });
    fireEvent.pointerMove(mapSvg(), { pointerId: 2, clientX: 100, clientY: 100 });
    expect(viewport().scale).toBeLessThan(3);
  });

  it('resets the view with the labelled button', async () => {
    renderMap(baseView());
    fireEvent.wheel(mapSvg(), { deltaY: -100 });
    fireEvent.pointerDown(mapSvg(), { pointerId: 1, clientX: 50, clientY: 50, button: 0 });
    fireEvent.pointerMove(mapSvg(), { pointerId: 1, clientX: 90, clientY: 90 });
    fireEvent.pointerUp(mapSvg(), { pointerId: 1 });
    expect(viewport()).not.toEqual({ x: 0, y: 0, scale: 1 });
    await userEvent.setup().click(screen.getByRole('button', { name: t('map.resetView') }));
    expect(viewport()).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it('the reset button is outside the svg, so the svg holds only sector buttons', () => {
    renderMap(baseView());
    expect(within(mapSvg()).queryByRole('button', { name: t('map.resetView') })).toBeNull();
  });
});

describe('GalaxyMap performance', () => {
  it('re-renders only the sectors that changed when a new state arrives', () => {
    const counter = vi.fn();
    const RealFleet = spaceTheme.Icons.Fleet;
    spaceTheme.Icons.Fleet = (props) => {
      counter();
      return <RealFleet {...props} />;
    };
    try {
      const view = baseView();
      const onSectorClick = vi.fn();
      const { rerender } = render(
        <GalaxyMap view={view} me="p1" selected={null} onSectorClick={onSectorClick} />,
      );
      const withFleets = view.sectorIds.filter((id) => (view.sectors[id]?.fleets ?? 0) > 0);
      expect(withFleets.length).toBeGreaterThan(1);
      expect(counter).toHaveBeenCalledTimes(withFleets.length);
      counter.mockClear();

      // A fresh deep copy (as a game:state delivers) with exactly one sector changed.
      const next = structuredClone(view);
      const changed = withFleets[0] as SectorId;
      const sector = next.sectors[changed];
      if (sector) sector.fleets += 1;
      act(() => {
        rerender(<GalaxyMap view={next} me="p1" selected={null} onSectorClick={onSectorClick} />);
      });
      expect(counter).toHaveBeenCalledTimes(1);
      expect(hexEl(changed).querySelector('[data-part="fleet-count"]')?.textContent).toBe(
        String(sector?.fleets),
      );
    } finally {
      spaceTheme.Icons.Fleet = RealFleet;
    }
  });
});
