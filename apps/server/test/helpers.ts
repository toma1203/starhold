import { loadConfig, type Config } from '../src/config.ts';
import type { RoomHooks } from '../src/room.ts';

export interface TestHooks extends RoomHooks {
  time: number;
  broadcasts: number;
}

/** Hooks with a controllable clock and a broadcast counter. */
export function makeHooks(start = 1_000_000): TestHooks {
  const hooks: TestHooks = {
    time: start,
    broadcasts: 0,
    broadcast: () => {
      hooks.broadcasts += 1;
    },
    emitTo: () => {},
    now: () => hooks.time,
  };
  return hooks;
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return { ...loadConfig({}), ...overrides };
}
