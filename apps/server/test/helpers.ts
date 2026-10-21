import { loadConfig, type Config } from '../src/config.ts';
import type { RoomHooks } from '../src/room.ts';

export interface Emitted {
  playerId: string;
  event: string;
  payload: unknown;
}

export interface TestHooks extends RoomHooks {
  time: number;
  broadcasts: number;
  emitted: Emitted[];
}

/** Hooks with a controllable clock, a broadcast counter and a log of everything emitted. */
export function makeHooks(start = 1_000_000): TestHooks {
  const hooks: TestHooks = {
    time: start,
    broadcasts: 0,
    emitted: [],
    broadcast: () => {
      hooks.broadcasts += 1;
    },
    emitTo: (playerId, event, payload) => {
      hooks.emitted.push({ playerId, event, payload });
    },
    now: () => hooks.time,
  };
  return hooks;
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  // The per-socket create cooldown is off unless a test asks for it.
  return { ...loadConfig({}), createCooldownMs: 0, ...overrides };
}
