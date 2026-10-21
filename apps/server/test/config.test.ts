import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('uses the documented defaults', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      botDelayMs: [600, 1200],
      turnSecondsOverride: null,
      discardSeconds: 30,
      emptyRoomTtlMs: 1_800_000,
      finishedRoomTtlMs: 900_000,
      maxRooms: 500,
      msgsPerSecond: 20,
      createCooldownMs: 2000,
    });
  });

  it('reads PORT and the test-only overrides', () => {
    const c = loadConfig({
      PORT: '8080',
      STARHOLD_TURN_SECONDS: '2',
      STARHOLD_DISCARD_SECONDS: '1',
    });
    expect(c.port).toBe(8080);
    expect(c.turnSecondsOverride).toBe(2);
    expect(c.discardSeconds).toBe(1);
  });

  it('a single STARHOLD_BOT_DELAY_MS sets both bounds', () => {
    expect(loadConfig({ STARHOLD_BOT_DELAY_MS: '5' }).botDelayMs).toEqual([5, 5]);
  });

  it('ignores unparseable values', () => {
    const c = loadConfig({ PORT: 'abc', STARHOLD_BOT_DELAY_MS: '-3', STARHOLD_TURN_SECONDS: '' });
    expect(c.port).toBe(3000);
    expect(c.botDelayMs).toEqual([600, 1200]);
    expect(c.turnSecondsOverride).toBeNull();
  });
});

describe('loadConfig turn override', () => {
  it('treats STARHOLD_TURN_SECONDS=0 as unset', () => {
    expect(loadConfig({ STARHOLD_TURN_SECONDS: '0' }).turnSecondsOverride).toBeNull();
  });
});
