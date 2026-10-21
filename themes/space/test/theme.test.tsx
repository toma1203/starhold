import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { RESOURCES } from '@starhold/engine';
import { createT, en, hr } from '@starhold/i18n';
import { playerStyle, spaceTheme } from '../src/index.ts';

describe('spaceTheme', () => {
  it('has a label key for every resource present in i18n en and hr', () => {
    for (const r of RESOURCES) {
      const { labelKey } = spaceTheme.resources[r];
      expect(Object.hasOwn(en, labelKey)).toBe(true);
      expect(Object.hasOwn(hr, labelKey)).toBe(true);
      expect(createT('en')(labelKey)).not.toBe('');
    }
    expect(Object.hasOwn(en, spaceTheme.titleKey)).toBe(true);
    expect(Object.hasOwn(hr, spaceTheme.titleKey)).toBe(true);
  });

  it('uses the specified resource, sector and background colours', () => {
    expect(spaceTheme.id).toBe('space');
    expect(spaceTheme.resources.metal.color).toBe('#9AA5B1');
    expect(spaceTheme.resources.energy.color).toBe('#F2C94C');
    expect(spaceTheme.resources.crystal.color).toBe('#7FD3F7');
    expect(spaceTheme.resources.biomass.color).toBe('#6FCF97');
    expect(spaceTheme.sectorFill).toEqual({
      metal: '#9AA5B1',
      energy: '#F2C94C',
      crystal: '#7FD3F7',
      biomass: '#6FCF97',
      nebula: '#3B2F5C',
      home: '#1F2A44',
    });
    expect(spaceTheme.background).toContain('radial-gradient');
    expect(spaceTheme.background).toContain('#0B1020');
    expect(spaceTheme.background).toContain('#05070F');
  });

  it('has 4 player styles with distinct colours and shapes', () => {
    expect(spaceTheme.players).toEqual([
      { color: '#E69F00', shape: 'circle' },
      { color: '#56B4E9', shape: 'square' },
      { color: '#009E73', shape: 'triangle' },
      { color: '#CC79A7', shape: 'diamond' },
    ]);
    expect(new Set(spaceTheme.players.map((p) => p.color)).size).toBe(4);
    expect(new Set(spaceTheme.players.map((p) => p.shape)).size).toBe(4);
  });

  it('playerStyle returns the seat style', () => {
    expect(playerStyle(0)).toEqual({ color: '#E69F00', shape: 'circle' });
    expect(playerStyle(3)).toEqual({ color: '#CC79A7', shape: 'diamond' });
    expect(() => playerStyle(4)).toThrow();
    expect(() => playerStyle(-1)).toThrow();
  });
});

describe('icons', () => {
  const all = [
    ...RESOURCES.map((r) => [r, spaceTheme.resources[r].Icon] as const),
    ...Object.entries(spaceTheme.Icons),
  ];

  it('exposes every unit icon', () => {
    expect(Object.keys(spaceTheme.Icons).sort()).toEqual(
      ['Colony', 'Dice', 'Fleet', 'Pirate', 'Starbase', 'TradeStation'].sort(),
    );
  });

  it.each(all)('%s renders an aria-hidden 24x24 svg without text or remote refs', (_n, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.getAttribute('width')).toBe('24');
    expect(svg?.getAttribute('height')).toBe('24');
    expect(container.querySelector('text, image, use')).toBeNull();
    expect(container.innerHTML).not.toMatch(/https?:|data:/);
    expect(
      container.querySelectorAll('path, circle, rect, polygon, ellipse, line').length,
    ).toBeGreaterThan(0);
  });

  it.each(all)('%s honours the size prop', (_n, Icon) => {
    const { container } = render(<Icon size={40} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('40');
    expect(svg?.getAttribute('height')).toBe('40');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
  });
});
