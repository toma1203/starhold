import { describe, expect, it } from 'vitest';
import type { Action } from '@starhold/engine';
import {
  ActionSchema,
  DEFAULT_ROOM_SETTINGS,
  NicknameSchema,
  ROOM_CLOSED_REASONS,
  ROOM_ERROR_CODES,
  RoomCodeSchema,
  SettingsSchema,
  TokenSchema,
} from '../src/index.ts';

const bag = { metal: 1, energy: 0, crystal: 2, biomass: 3 };

const samples: Action[] = [
  { type: 'chooseHomeBonus', resource: 'crystal' },
  { type: 'roll' },
  { type: 'discard', resources: bag },
  { type: 'movePirate', to: '1,-2' },
  { type: 'bankTrade', give: 'metal', get: 'biomass' },
  { type: 'offerTrade', give: bag, want: { metal: 0, energy: 1, crystal: 0, biomass: 0 } },
  { type: 'respondTrade', accept: true },
  { type: 'confirmTrade', with: 'abcd1234' },
  { type: 'cancelTrade' },
  { type: 'buildFleet', at: '0,0' },
  { type: 'buildColony', at: '0,1' },
  { type: 'buildStarbase', at: '1,0' },
  { type: 'expand', from: '0,0', to: '0,1', count: 2 },
  { type: 'attack', from: '0,0', to: '0,1', dice: 3 },
  { type: 'attack', from: '0,0', to: '0,1', dice: 1, moveIfConquered: 4 },
  { type: 'fortify', from: '0,0', to: '0,1', count: 999 },
  { type: 'endTurn' },
];

describe('ActionSchema', () => {
  it('accepts every Action variant', () => {
    for (const a of samples) {
      const r = ActionSchema.safeParse(a);
      expect(r.success, JSON.stringify(a)).toBe(true);
      if (r.success) expect(r.data).toEqual(a);
    }
  });

  it('rejects unknown type', () => {
    expect(ActionSchema.safeParse({ type: 'hack' }).success).toBe(false);
    expect(ActionSchema.safeParse({}).success).toBe(false);
    expect(ActionSchema.safeParse(null).success).toBe(false);
    expect(ActionSchema.safeParse('roll').success).toBe(false);
  });

  it('rejects negative, fractional and oversized bag values', () => {
    expect(
      ActionSchema.safeParse({ type: 'discard', resources: { ...bag, metal: -1 } }).success,
    ).toBe(false);
    expect(
      ActionSchema.safeParse({ type: 'discard', resources: { ...bag, metal: 1.5 } }).success,
    ).toBe(false);
    expect(
      ActionSchema.safeParse({ type: 'discard', resources: { ...bag, metal: 100 } }).success,
    ).toBe(false);
    expect(ActionSchema.safeParse({ type: 'discard', resources: { metal: 1 } }).success).toBe(
      false,
    );
  });

  it('rejects count 0, 1000 and non-integers', () => {
    for (const count of [0, 1000, -1, 1.5]) {
      expect(
        ActionSchema.safeParse({ type: 'expand', from: '0,0', to: '0,1', count }).success,
        `expand ${count}`,
      ).toBe(false);
      expect(
        ActionSchema.safeParse({ type: 'fortify', from: '0,0', to: '0,1', count }).success,
        `fortify ${count}`,
      ).toBe(false);
    }
  });

  it('rejects dice outside 1..3', () => {
    for (const dice of [0, 4, 2.5, '2']) {
      expect(
        ActionSchema.safeParse({ type: 'attack', from: '0,0', to: '0,1', dice }).success,
        `dice ${String(dice)}`,
      ).toBe(false);
    }
  });

  it('rejects moveIfConquered outside 1..999', () => {
    for (const moveIfConquered of [0, 1000, 1.5, -2]) {
      expect(
        ActionSchema.safeParse({ type: 'attack', from: '0,0', to: '0,1', dice: 1, moveIfConquered })
          .success,
      ).toBe(false);
    }
  });

  it('accepts only axial "q,r" sector ids', () => {
    const sectorFields = (id: string): unknown[] => [
      { type: 'movePirate', to: id },
      { type: 'buildFleet', at: id },
      { type: 'buildColony', at: id },
      { type: 'buildStarbase', at: id },
      { type: 'expand', from: id, to: '0,0', count: 1 },
      { type: 'attack', from: '0,0', to: id, dice: 1 },
      { type: 'fortify', from: id, to: '0,0', count: 1 },
    ];
    for (const id of ['0,0', '-3,2', '3,-3', '12,-12']) {
      for (const a of sectorFields(id)) {
        expect(ActionSchema.safeParse(a).success, `${id} ${JSON.stringify(a)}`).toBe(true);
      }
    }
    const bad = [
      '__proto__',
      'constructor',
      'toString',
      '',
      '1',
      '1,',
      ',1',
      'a,b',
      '1,2,3',
      '123,1',
      '1,-',
      '+1,2',
      ' 1,2',
      'x'.repeat(17),
    ];
    for (const id of bad) {
      for (const a of sectorFields(id)) {
        expect(ActionSchema.safeParse(a).success, `${id} ${JSON.stringify(a)}`).toBe(false);
      }
    }
  });

  it('accepts only 8-char base36 player ids for confirmTrade', () => {
    expect(ActionSchema.safeParse({ type: 'confirmTrade', with: 'abcd1234' }).success).toBe(true);
    for (const id of ['__proto__', 'constructor', 'abc', 'ABCD1234', 'abcd12345', 'abcd-123', '']) {
      expect(ActionSchema.safeParse({ type: 'confirmTrade', with: id }).success, id).toBe(false);
    }
  });

  it('rejects unknown keys on every variant and bag', () => {
    for (const a of samples) {
      expect(ActionSchema.safeParse({ ...a, extra: 1 }).success, a.type).toBe(false);
    }
    expect(
      ActionSchema.safeParse({ type: 'discard', resources: { ...bag, gold: 1 } }).success,
    ).toBe(false);
  });

  it('rejects non-boolean accept and unknown resources', () => {
    expect(ActionSchema.safeParse({ type: 'respondTrade', accept: 'yes' }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: 'respondTrade', accept: 1 }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: 'chooseHomeBonus', resource: 'gold' }).success).toBe(
      false,
    );
    expect(ActionSchema.safeParse({ type: 'bankTrade', give: 'metal', get: 'x' }).success).toBe(
      false,
    );
  });
});

describe('NicknameSchema', () => {
  it('trims and strips control chars', () => {
    expect(NicknameSchema.parse('  Ana  ')).toBe('Ana');
    expect(NicknameSchema.parse('A\u0000n\u0007a\n')).toBe('Ana');
    expect(NicknameSchema.parse('​Bo‮b')).toBe('Bob');
  });

  it('rejects empty after trim or stripping', () => {
    expect(NicknameSchema.safeParse('   ').success).toBe(false);
    expect(NicknameSchema.safeParse('').success).toBe(false);
    expect(NicknameSchema.safeParse('\u0000\u0001').success).toBe(false);
    expect(NicknameSchema.safeParse(42).success).toBe(false);
  });

  it('accepts 20 chars and rejects 21', () => {
    expect(NicknameSchema.safeParse('a'.repeat(20)).success).toBe(true);
    expect(NicknameSchema.safeParse('a'.repeat(21)).success).toBe(false);
  });
});

describe('RoomCodeSchema', () => {
  it('uppercases and accepts valid codes', () => {
    expect(RoomCodeSchema.parse('abcde')).toBe('ABCDE');
    expect(RoomCodeSchema.parse('K7M2X')).toBe('K7M2X');
  });

  it('rejects ambiguous chars (O,0,I,1,L), wrong length and non-strings', () => {
    for (const bad of ['ABCDO', 'ABCD0', 'ABCDI', 'ABCD1', 'ABCDL', 'abcdl']) {
      expect(RoomCodeSchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(RoomCodeSchema.safeParse('ABCD').success).toBe(false);
    expect(RoomCodeSchema.safeParse('ABCDEF').success).toBe(false);
    expect(RoomCodeSchema.safeParse(12345).success).toBe(false);
  });
});

describe('TokenSchema', () => {
  it('accepts exactly 32 lowercase hex chars', () => {
    expect(TokenSchema.safeParse('0123456789abcdef0123456789abcdef').success).toBe(true);
  });
  it('rejects uppercase, wrong length and non-hex', () => {
    expect(TokenSchema.safeParse('0123456789ABCDEF0123456789ABCDEF').success).toBe(false);
    expect(TokenSchema.safeParse('0123456789abcdef0123456789abcde').success).toBe(false);
    expect(TokenSchema.safeParse('0123456789abcdef0123456789abcdef0').success).toBe(false);
    expect(TokenSchema.safeParse('0123456789abcdef0123456789abcdeg').success).toBe(false);
  });
});

describe('SettingsSchema', () => {
  it('accepts allowed combinations, strictly', () => {
    expect(SettingsSchema.safeParse({ targetVp: 6, turnSeconds: 120 }).success).toBe(true);
    expect(SettingsSchema.safeParse(DEFAULT_ROOM_SETTINGS).success).toBe(true);
    expect(SettingsSchema.safeParse({ targetVp: 7, turnSeconds: 90 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ targetVp: 8, turnSeconds: 45 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ targetVp: 8, turnSeconds: 90, x: 1 }).success).toBe(false);
  });
  it('defaults are 8 VP / 90 s', () => {
    expect(DEFAULT_ROOM_SETTINGS).toEqual({ targetVp: 8, turnSeconds: 90 });
  });
});

describe('ROOM_ERROR_CODES', () => {
  it('lists every room error code', () => {
    expect([...ROOM_ERROR_CODES].sort()).toEqual(
      [
        'err.roomNotFound',
        'err.roomFull',
        'err.gameStarted',
        'err.notHost',
        'err.badRequest',
        'err.rateLimited',
        'err.serverFull',
        'err.notEnoughPlayers',
      ].sort(),
    );
  });
});

describe('ROOM_CLOSED_REASONS', () => {
  it('lists every reason a room:closed can carry', () => {
    expect([...ROOM_CLOSED_REASONS].sort()).toEqual(['expired', 'replaced', 'serverRestart']);
  });
});
