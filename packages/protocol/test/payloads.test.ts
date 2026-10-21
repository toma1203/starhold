import { describe, expect, it } from 'vitest';
import {
  AddBotPayloadSchema,
  CreateRoomPayloadSchema,
  JoinRoomPayloadSchema,
  RejoinPayloadSchema,
  RemoveBotPayloadSchema,
} from '../src/index.ts';

const token = '0123456789abcdef0123456789abcdef';

describe('CreateRoomPayloadSchema', () => {
  it('accepts a nickname and sanitizes it', () => {
    expect(CreateRoomPayloadSchema.parse({ name: '  Ana ' })).toEqual({ name: 'Ana' });
  });
  it('rejects missing, empty, oversized, non-string names and extra keys', () => {
    for (const bad of [
      {},
      { name: '' },
      { name: 'a'.repeat(21) },
      { name: 5 },
      { name: 'Ana', extra: 1 },
      null,
      'Ana',
    ]) {
      expect(CreateRoomPayloadSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('JoinRoomPayloadSchema', () => {
  it('accepts a code (case-insensitive) and a nickname', () => {
    expect(JoinRoomPayloadSchema.parse({ code: 'abcde', name: 'Bo' })).toEqual({
      code: 'ABCDE',
      name: 'Bo',
    });
  });
  it('rejects bad codes, bad names and extra keys', () => {
    for (const bad of [
      { code: 'ABCD', name: 'Bo' },
      { code: 'ABCDO', name: 'Bo' },
      { code: 'ABCDE' },
      { name: 'Bo' },
      { code: 'ABCDE', name: '' },
      { code: 'ABCDE', name: 'Bo', extra: true },
    ]) {
      expect(JoinRoomPayloadSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('RejoinPayloadSchema', () => {
  it('accepts a code and a 32-hex token', () => {
    expect(RejoinPayloadSchema.parse({ code: 'abcde', token })).toEqual({ code: 'ABCDE', token });
  });
  it('rejects malformed tokens, codes and extra keys', () => {
    for (const bad of [
      { code: 'ABCDE', token: 'short' },
      { code: 'ABCDE', token: token.toUpperCase() },
      { code: 'ABCD', token },
      { code: 'ABCDE' },
      { code: 'ABCDE', token, extra: 1 },
    ]) {
      expect(RejoinPayloadSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('AddBotPayloadSchema', () => {
  it('accepts easy and normal', () => {
    expect(AddBotPayloadSchema.parse({ level: 'easy' })).toEqual({ level: 'easy' });
    expect(AddBotPayloadSchema.parse({ level: 'normal' })).toEqual({ level: 'normal' });
  });
  it('rejects other levels, missing level and extra keys', () => {
    for (const bad of [{ level: 'hard' }, {}, { level: 'easy', x: 1 }, { level: 1 }]) {
      expect(AddBotPayloadSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('RemoveBotPayloadSchema', () => {
  it('accepts an 8-char base36 id', () => {
    expect(RemoveBotPayloadSchema.parse({ playerId: 'abc12345' })).toEqual({
      playerId: 'abc12345',
    });
  });
  it('rejects long ids, non-strings, missing and extra keys', () => {
    for (const bad of [
      { playerId: 'x'.repeat(17) },
      { playerId: 'abc123' },
      { playerId: '__proto__' },
      { playerId: 'ABCD1234' },
      { playerId: 4 },
      {},
      { playerId: 'a', extra: 1 },
    ]) {
      expect(RemoveBotPayloadSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
