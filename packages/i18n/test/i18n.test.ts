import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@starhold/engine';
import { ROOM_CLOSED_REASONS, ROOM_ERROR_CODES } from '@starhold/protocol';
import { createT, detectLocale, en, hr, plural } from '../src/index.ts';

const enRecord: Record<string, string> = en;
const hrRecord: Record<string, string> = hr;
const enKeys = Object.keys(en).sort();

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);

const joined = (dict: Record<string, string>, prefix: string): string =>
  Object.entries(dict)
    .filter(([k]) => k.startsWith(prefix))
    .map(([, v]) => v)
    .join('\n');

describe('dictionaries', () => {
  it('hr has exactly the same keys as en', () => {
    expect(Object.keys(hr).sort()).toEqual(enKeys);
  });

  it('no value is empty', () => {
    for (const [locale, dict] of [
      ['en', enRecord],
      ['hr', hrRecord],
    ] as const) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${locale}:${key}`).not.toBe('');
      }
    }
  });

  it('every engine ErrorCode has a key', () => {
    expect(ERROR_CODES.length).toBeGreaterThan(0);
    for (const code of ERROR_CODES) {
      expect(enRecord[code], code).toBeTypeOf('string');
      expect(hrRecord[code], code).toBeTypeOf('string');
    }
  });

  it('every protocol RoomErrorCode has a key', () => {
    expect(ROOM_ERROR_CODES.length).toBeGreaterThan(0);
    for (const code of ROOM_ERROR_CODES) {
      expect(enRecord[code], code).toBeTypeOf('string');
      expect(hrRecord[code], code).toBeTypeOf('string');
    }
  });

  it('every room:closed reason has a key', () => {
    expect(ROOM_CLOSED_REASONS.length).toBeGreaterThan(0);
    for (const reason of ROOM_CLOSED_REASONS) {
      expect(enRecord[`room.closed.${reason}`], reason).toBeTypeOf('string');
      expect(hrRecord[`room.closed.${reason}`], reason).toBeTypeOf('string');
    }
    expect(enRecord['room.closed.replaced']).toBe('This game was opened in another tab or device.');
    expect(hrRecord['room.closed.replaced']).toBe(
      'Ova igra je otvorena u drugoj kartici ili na drugom uređaju.',
    );
  });

  it('hr uses the same {placeholders} as en for every key', () => {
    for (const key of enKeys) {
      expect(placeholders(hrRecord[key]!).sort(), key).toEqual(placeholders(enRecord[key]!).sort());
    }
  });

  it('has a message for every GameEvent type', () => {
    const types = [
      'turnStarted',
      'homeBonus',
      'diceRolled',
      'produced',
      'discarded',
      'pirateMoved',
      'stolen',
      'bankTraded',
      'tradeOffered',
      'tradeResponded',
      'traded',
      'tradeCancelled',
      'built',
      'expanded',
      'battle',
      'fortified',
      'awardChanged',
      'gameOver',
    ];
    for (const type of types) {
      expect(
        enKeys.some((k) => k === `event.${type}` || k.startsWith(`event.${type}.`)),
        type,
      ).toBe(true);
    }
  });

  it('every counted event has one/few/other forms in both languages', () => {
    for (const base of ['event.discarded', 'event.expanded', 'event.fortified']) {
      for (const form of ['one', 'few', 'other']) {
        expect(enRecord[`${base}.${form}`], `${base}.${form}`).toBeTypeOf('string');
        expect(hrRecord[`${base}.${form}`], `${base}.${form}`).toBeTypeOf('string');
      }
    }
  });

  it('names the theme vocabulary', () => {
    expect(en['theme.space.resource.metal']).toBe('Metal');
    expect(en['theme.space.resource.energy']).toBe('Energy');
    expect(en['theme.space.resource.crystal']).toBe('Crystal');
    expect(en['theme.space.resource.biomass']).toBe('Biomass');
    expect(hr['theme.space.resource.metal']).toBe('Metal');
    expect(hr['theme.space.resource.energy']).toBe('Energija');
    expect(hr['theme.space.resource.crystal']).toBe('Kristali');
    expect(hr['theme.space.resource.biomass']).toBe('Biomasa');
    expect(hr['theme.space.unit.fleet']).toBe('Flota');
    expect(hr['theme.space.unit.starbase']).toBe('Zvjezdana baza');
    expect(hr['theme.space.sector.home']).toBe('Matični sustav');
    expect(hr['theme.space.sector.tradeStation']).toBe('Trgovačka stanica');
  });

  it('never uses the forbidden words', () => {
    for (const text of [...Object.values(enRecord), ...Object.values(hrRecord)]) {
      expect(text).not.toMatch(/\brisk\b|catan/i);
    }
  });

  it('privacy copy states the required facts in both languages', () => {
    for (const dict of [enRecord, hrRecord]) {
      const privacy = joined(dict, 'pages.privacy.');
      expect(privacy).toContain('localStorage');
      expect(privacy).toContain('github.com/toma1203/starhold/issues');
    }
    expect(en['pages.privacy.memory']).toMatch(/server memory/i);
    expect(en['pages.privacy.logs']).toMatch(/no nicknames/i);
    expect(en['pages.privacy.none']).toMatch(/no accounts/i);
    expect(hr['pages.privacy.memory']).toMatch(/memorij/i);
  });

  it('credits copy names the author and the stack', () => {
    for (const dict of [enRecord, hrRecord]) {
      const credits = joined(dict, 'pages.credits.');
      expect(credits).toContain('toma1203');
      for (const tech of ['TypeScript', 'React', 'Vite', 'Node.js', 'Socket.IO']) {
        expect(credits).toContain(tech);
      }
    }
  });
});

describe('createT', () => {
  it('interpolates {name}', () => {
    const t = createT('en');
    expect(t('game.waitingFor', { player: 'Ana' })).toBe(
      en['game.waitingFor'].replace('{player}', 'Ana'),
    );
    expect(t('game.waitingFor', { player: 'Ana' })).toContain('Ana');
  });

  it('interpolates numbers and replaces every occurrence of a placeholder', () => {
    const t = createT('en');
    const out = t('event.turnStarted', { player: 'Ana', round: 3 });
    expect(out).toContain('Ana');
    expect(out).toContain('3');
    expect(out).not.toMatch(/\{\w+\}/);
    expect(createT('en')('common.close', { unused: 1 })).toBe(en['common.close']);
  });

  it('leaves a missing param as {name}', () => {
    const t = createT('en');
    expect(t('event.turnStarted', { player: 'Ana' })).toContain('{round}');
    expect(t('event.turnStarted')).toContain('{player}');
  });

  it('does not re-interpolate param values', () => {
    const t = createT('en');
    expect(t('event.turnStarted', { player: '{round}', round: 2 })).toContain('{round}');
  });

  it('uses the requested locale', () => {
    expect(createT('hr')('common.close')).toBe(hr['common.close']);
    expect(createT('en')('common.close')).toBe(en['common.close']);
    expect(hr['common.close']).not.toBe(en['common.close']);
  });
});

describe('detectLocale', () => {
  it('maps hr tags to hr and everything else to en', () => {
    expect(detectLocale(['hr-HR', 'en'])).toBe('hr');
    expect(detectLocale(['hr'])).toBe('hr');
    expect(detectLocale(['HR-hr'])).toBe('hr');
    expect(detectLocale(['de'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('picks hr when any tag starts with hr', () => {
    expect(detectLocale(['de', 'hr'])).toBe('hr');
  });
});

describe('plural', () => {
  const forms = { one: 'flota', few: 'flote', other: 'flota' };

  it('HR: 1 flota, 2 flote, 5 flota, 11 flota, 21 flota, 22 flote', () => {
    expect(plural('hr', 1, forms)).toBe('flota');
    expect(plural('hr', 2, forms)).toBe('flote');
    expect(plural('hr', 5, forms)).toBe('flota');
    expect(plural('hr', 11, forms)).toBe('flota');
    expect(plural('hr', 21, forms)).toBe('flota');
    expect(plural('hr', 22, forms)).toBe('flote');
  });

  it('HR: teens and larger numbers', () => {
    const f = { one: 'one', few: 'few', other: 'other' };
    const ns = [0, 1, 3, 4, 10, 12, 13, 14, 15, 20, 24, 100, 101, 111, 112, 114];
    expect(ns.map((n) => plural('hr', n, f))).toEqual([
      'other',
      'one',
      'few',
      'few',
      'other',
      'other',
      'other',
      'other',
      'other',
      'other',
      'few',
      'other',
      'one',
      'other',
      'other',
      'other',
    ]);
  });

  it('HR: falls back to other when few is omitted', () => {
    expect(plural('hr', 2, { one: 'a', other: 'b' })).toBe('b');
  });

  it('EN: one for 1, other for everything else', () => {
    const f = { one: 'fleet', few: 'ignored', other: 'fleets' };
    expect(plural('en', 1, f)).toBe('fleet');
    expect(plural('en', 2, f)).toBe('fleets');
    expect(plural('en', 21, f)).toBe('fleets');
    expect(plural('en', 0, f)).toBe('fleets');
  });
});
