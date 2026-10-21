import { describe, expect, it } from 'vitest';
import { RoomCodeSchema, TokenSchema } from '@starhold/protocol';
import { generatePlayerId, generateRoomCode, generateToken } from '../src/codes.ts';

describe('codes', () => {
  it('room codes match RoomCodeSchema', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateRoomCode(Math.random, () => false);
      expect(RoomCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('retries while the candidate is taken', () => {
    let calls = 0;
    const code = generateRoomCode(
      () => 0,
      () => (calls += 1) < 3,
    );
    expect(calls).toBe(3);
    expect(code).toBe('AAAAA');
  });

  it('tokens match TokenSchema and differ', () => {
    const a = generateToken();
    expect(TokenSchema.safeParse(a).success).toBe(true);
    expect(generateToken()).not.toBe(a);
  });

  it('player ids are 8 base36 chars', () => {
    expect(generatePlayerId()).toMatch(/^[0-9a-z]{8}$/);
  });
});
