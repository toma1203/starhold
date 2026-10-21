export interface Config {
  port: number;
  /** Inclusive [min, max] pause before a bot acts, in ms. */
  botDelayMs: [number, number];
  /** Test-only: forces every room's turn length (seconds). */
  turnSecondsOverride: number | null;
  discardSeconds: number;
  emptyRoomTtlMs: number;
  finishedRoomTtlMs: number;
  maxRooms: number;
  msgsPerSecond: number;
  /** Minimum gap between two `room:create` calls from one socket, in ms. */
  createCooldownMs: number;
}

/** Parses a non-negative integer env value; anything else yields `fallback`. */
function intEnv(raw: string | undefined, fallback: number): number;
function intEnv(raw: string | undefined, fallback: null): number | null;
function intEnv(raw: string | undefined, fallback: number | null): number | null {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return fallback;
  return Number(raw.trim());
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const delay = intEnv(env['STARHOLD_BOT_DELAY_MS'], null);
  const turn = intEnv(env['STARHOLD_TURN_SECONDS'], null);
  return {
    port: intEnv(env['PORT'], 3000),
    botDelayMs: delay === null ? [600, 1200] : [delay, delay],
    turnSecondsOverride: turn !== null && turn > 0 ? turn : null,
    discardSeconds: intEnv(env['STARHOLD_DISCARD_SECONDS'], 30),
    emptyRoomTtlMs: 1_800_000,
    finishedRoomTtlMs: 900_000,
    maxRooms: 500,
    msgsPerSecond: 20,
    createCooldownMs: 2000,
  };
}
