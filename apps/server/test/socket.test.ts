import { afterEach, describe, expect, it, vi } from 'vitest';
import { io as connectClient, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  GameStatePayload,
  JoinAck,
  RoomInfo,
  ServerError,
  ServerToClientEvents,
} from '@starhold/protocol';
import { startServer } from '../src/server.ts';
import { testConfig } from './helpers.ts';

const logSpy = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../src/log.ts', () => ({ log: logSpy }));

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

/** A connected test client that records everything the server sends it. */
interface Probe {
  socket: Client;
  rooms: RoomInfo[];
  games: GameStatePayload[];
  errors: ServerError[];
  closed: unknown[];
}

let stop: (() => Promise<void>) | null = null;
let port = 0;
const probes: Probe[] = [];

async function boot(overrides: Parameters<typeof testConfig>[0] = {}): Promise<void> {
  const server = await startServer(testConfig({ port: 0, ...overrides }), { staticDir: null });
  stop = server.close;
  port = server.port;
}

async function connect(): Promise<Probe> {
  const socket: Client = connectClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  const probe: Probe = { socket, rooms: [], games: [], errors: [], closed: [] };
  socket.on('room:state', (r) => probe.rooms.push(r));
  socket.on('game:state', (g) => probe.games.push(g));
  socket.on('error', (e) => probe.errors.push(e));
  socket.on('room:closed', (c) => probe.closed.push(c));
  probes.push(probe);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return probe;
}

/** Untyped emit: the tests deliberately send payloads the typed client would refuse. */
function raw(p: Probe): Socket {
  return p.socket as unknown as Socket;
}

function call(p: Probe, event: 'room:create' | 'room:join' | 'room:rejoin', payload: unknown) {
  return new Promise<JoinAck>((resolve) => {
    raw(p).emit(event, payload, resolve);
  });
}

function send(p: Probe, event: string, payload?: unknown): void {
  raw(p).emit(event, payload);
}

async function until(check: () => boolean, what: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

const last = <T>(xs: T[]): T | undefined => xs[xs.length - 1];

async function okAck(ack: Promise<JoinAck>) {
  const a = await ack;
  if (!a.ok) throw new Error(`expected ok ack, got ${a.error}`);
  return a;
}

/** Host creates a room, a second human joins it; returns both with their acks. */
async function twoPlayerRoom() {
  const a = await connect();
  const b = await connect();
  const created = await okAck(call(a, 'room:create', { name: 'Ana' }));
  const joined = await okAck(call(b, 'room:join', { code: created.code, name: 'Bo' }));
  return { a, b, created, joined };
}

afterEach(async () => {
  expect(logSpy.error).not.toHaveBeenCalled(); // no handler ever blew up
  for (const p of probes.splice(0)) p.socket.disconnect();
  await stop?.();
  stop = null;
});

async function healthz(): Promise<number> {
  return (await fetch(`http://127.0.0.1:${port}/healthz`)).status;
}

describe('room lifecycle over sockets', () => {
  it('create -> join -> start -> state received by both', async () => {
    await boot();
    const { a, b, created, joined } = await twoPlayerRoom();
    expect(created.code).toMatch(/^[A-Z2-9]{5}$/);
    expect(created.playerId).not.toBe(joined.playerId);

    await until(() => last(a.rooms)?.seats.length === 2, 'host sees both seats');
    expect(last(a.rooms)?.you).toBe(created.playerId);
    expect(last(b.rooms)?.you).toBe(joined.playerId);
    expect(last(b.rooms)?.hostId).toBe(created.playerId);

    send(a, 'room:start');
    await until(() => a.games.length > 0 && b.games.length > 0, 'both receive game:state');
    expect(last(a.rooms)?.phase).toBe('IN_GAME');
    expect(last(b.rooms)?.phase).toBe('IN_GAME');
    expect(a.games[0]?.view.me).toBe(created.playerId);
    expect(b.games[0]?.view.me).toBe(joined.playerId);
    expect(a.errors).toEqual([]);
  });

  it('join unknown room -> err.roomNotFound', async () => {
    await boot();
    const c = await connect();
    expect(await call(c, 'room:join', { code: 'ZZZZZ', name: 'Cy' })).toEqual({
      ok: false,
      error: 'err.roomNotFound',
    });
  });

  it('rejoin with an unknown token -> err.roomNotFound, with a malformed one -> err.badRequest', async () => {
    await boot();
    const a = await connect();
    const { code } = await okAck(call(a, 'room:create', { name: 'Ana' }));
    const c = await connect();
    expect(await call(c, 'room:rejoin', { code, token: 'f'.repeat(32) })).toEqual({
      ok: false,
      error: 'err.roomNotFound',
    });
    expect(await call(c, 'room:rejoin', { code, token: 'nope' })).toEqual({
      ok: false,
      error: 'err.badRequest',
    });
  });

  it('rejoin after socket disconnect restores seat', async () => {
    await boot();
    const { a, b, created, joined } = await twoPlayerRoom();
    send(a, 'room:start');
    await until(() => a.games.length > 0 && b.games.length > 0, 'game started');

    a.socket.disconnect();
    await until(
      () => last(b.rooms)?.seats.find((s) => s.playerId === created.playerId)?.connected === false,
      'B sees A disconnected',
    );

    const a2 = await connect();
    const ack = await call(a2, 'room:rejoin', { code: created.code, token: created.token });
    expect(ack).toEqual({
      ok: true,
      code: created.code,
      playerId: created.playerId,
      token: created.token,
    });
    await until(() => a2.rooms.length > 0 && a2.games.length > 0, 'A2 gets room + game state');
    expect(last(a2.rooms)?.you).toBe(created.playerId);
    expect(last(a2.games)?.view.me).toBe(created.playerId);
    await until(
      () => last(b.rooms)?.seats.find((s) => s.playerId === created.playerId)?.connected === true,
      'B sees A back',
    );
    expect(last(b.rooms)?.you).toBe(joined.playerId);
  });

  it('the newest socket wins and the stale socket closing does not disconnect the seat', async () => {
    await boot();
    const { a, b, created } = await twoPlayerRoom();
    const a2 = await connect();
    await okAck(call(a2, 'room:rejoin', { code: created.code, token: created.token }));
    a.socket.disconnect();
    await new Promise((r) => setTimeout(r, 150));
    const seat = last(b.rooms)?.seats.find((s) => s.playerId === created.playerId);
    expect(seat?.connected).toBe(true);
    send(a2, 'room:start');
    await until(() => a2.games.length > 0, 'new socket gets game state');
    expect(a.games).toEqual([]);
  });

  it('a disconnect in the lobby keeps the seat; a disconnected host passes the host role on', async () => {
    await boot();
    const { a, b, created, joined } = await twoPlayerRoom();
    a.socket.disconnect();
    await until(() => last(b.rooms)?.hostId === joined.playerId, 'host moves to B');
    const seats = last(b.rooms)?.seats ?? [];
    expect(seats).toHaveLength(2);
    expect(seats.find((s) => s.playerId === created.playerId)?.connected).toBe(false);
  });

  it('creating while bound leaves the previous room first', async () => {
    await boot();
    const { a, b } = await twoPlayerRoom();
    const firstCode = last(b.rooms)?.code;
    const second = await okAck(call(a, 'room:create', { name: 'Ana' }));
    await until(() => last(b.rooms)?.seats.length === 1, 'B alone in the first room');
    expect(second.code).not.toBe(firstCode);
    expect(last(b.rooms)?.code).toBe(firstCode);
    await until(() => last(a.rooms)?.code === second.code, 'A sees the new room');
  });

  it('room events from an unbound socket report err.roomNotFound', async () => {
    await boot();
    const c = await connect();
    send(c, 'room:start');
    send(c, 'game:action', { type: 'roll' });
    await until(() => c.errors.length === 2, 'two errors');
    expect(c.errors.map((e) => e.code)).toEqual(['err.roomNotFound', 'err.roomNotFound']);
  });

  it('host-only controls are enforced and bots can be added and removed', async () => {
    await boot();
    const { a, b } = await twoPlayerRoom();
    send(b, 'room:addBot', { level: 'easy' });
    await until(() => b.errors.length === 1, 'notHost error');
    expect(b.errors[0]).toEqual({ code: 'err.notHost' });

    send(a, 'room:addBot', { level: 'easy' });
    await until(() => last(a.rooms)?.seats.length === 3, 'bot seat added');
    const bot = last(a.rooms)?.seats.find((s) => s.isBot);
    send(a, 'room:settings', { targetVp: 10, turnSeconds: 60 });
    await until(() => last(a.rooms)?.settings.targetVp === 10, 'settings applied');
    send(a, 'room:removeBot', { playerId: bot?.playerId });
    await until(() => last(a.rooms)?.seats.length === 2, 'bot removed');
    expect(a.errors).toEqual([]);
  });

  it('leave frees the seat in the lobby', async () => {
    await boot();
    const { a, b } = await twoPlayerRoom();
    send(b, 'room:leave');
    await until(() => last(a.rooms)?.seats.length === 1, 'seat freed');
  });
});

describe('validation and abuse', () => {
  it('malformed action is rejected', async () => {
    await boot();
    const { a } = await twoPlayerRoom();
    send(a, 'room:start');
    await until(() => a.games.length > 0, 'game started');
    send(a, 'game:action', { type: 'attack', from: 'a', to: 'b', dice: 9 });
    send(a, 'game:action', { type: 'nope' });
    send(a, 'game:action', 'roll');
    send(a, 'game:action');
    await until(() => a.errors.length === 4, 'four errors');
    expect(a.errors.every((e) => e.code === 'err.badRequest')).toBe(true);
    expect(await healthz()).toBe(200);
  });

  it('malformed room payloads give err.badRequest, with an ack where there is one', async () => {
    await boot();
    const c = await connect();
    const bad = { ok: false, error: 'err.badRequest' };
    expect(await call(c, 'room:create', { name: '' })).toEqual(bad);
    expect(await call(c, 'room:create', null)).toEqual(bad);
    expect(await call(c, 'room:join', { code: 'bad', name: 'Cy' })).toEqual(bad);
    expect(await call(c, 'room:rejoin', { code: 'ABCDE' })).toEqual(bad);
    send(c, 'room:addBot', { level: 'godlike' });
    send(c, 'room:removeBot', {});
    send(c, 'room:settings', { targetVp: 7, turnSeconds: 90 });
    await until(() => c.errors.length >= 7, 'error events');
    expect(c.errors.every((e) => e.code === 'err.badRequest')).toBe(true);
    expect(await healthz()).toBe(200);
  });

  it('a missing or non-function ack never crashes the handler', async () => {
    await boot();
    const c = await connect();
    send(c, 'room:create', { name: 'Ana' });
    raw(c).emit('room:join', { code: 'ZZZZZ', name: 'Ana' }, 'not a function');
    raw(c).emit('room:rejoin', { code: 'ZZZZZ', token: 'a'.repeat(32) }, 42);
    raw(c).emit('room:create', 'garbage');
    await until(() => c.rooms.length > 0, 'room created without ack');
    expect(await healthz()).toBe(200);
    const d = await connect();
    expect((await call(d, 'room:create', { name: 'Dee' })).ok).toBe(true);
  });

  it('flooding socket is throttled', async () => {
    await boot();
    const flood = await twoPlayerRoom();
    const other = await connect();
    await okAck(call(other, 'room:create', { name: 'Cy' }));
    send(flood.a, 'room:start');
    await until(() => flood.a.games.length > 0, 'flood room started');

    for (let i = 0; i < 100; i++) send(flood.a, 'game:action', { type: 'roll' });
    await until(
      () => flood.a.errors.some((e) => e.code === 'err.rateLimited'),
      'a rateLimited error',
    );
    await new Promise((r) => setTimeout(r, 300)); // let the whole burst be processed
    const limited = flood.a.errors.filter((e) => e.code === 'err.rateLimited').length;
    expect(limited).toBeGreaterThanOrEqual(50);

    const before = other.rooms.length;
    send(other, 'room:addBot', { level: 'normal' });
    await until(() => other.rooms.length > before, 'other room still updates');
    expect(last(other.rooms)?.seats).toHaveLength(2);
    expect(other.errors).toEqual([]);
  });

  it('a burst up to the per-second budget is not throttled', async () => {
    await boot({ msgsPerSecond: 20 });
    const c = await connect();
    await okAck(call(c, 'room:create', { name: 'Ana' }));
    for (let i = 0; i < 18; i++) send(c, 'room:settings', { targetVp: 8, turnSeconds: 90 });
    await new Promise((r) => setTimeout(r, 200));
    expect(c.errors).toEqual([]);
  });

  it('a throttled acked event still answers its ack', async () => {
    await boot({ msgsPerSecond: 3 });
    const c = await connect();
    const acks = await Promise.all(
      Array.from({ length: 12 }, () => call(c, 'room:join', { code: 'ZZZZZ', name: 'Cy' })),
    );
    expect(acks.some((a) => !a.ok && a.error === 'err.rateLimited')).toBe(true);
    expect(acks.every((a) => !a.ok)).toBe(true);
  });
});

describe('server shutdown', () => {
  it('close() tells every client the server is restarting', async () => {
    await boot();
    const { a, b } = await twoPlayerRoom();
    const closing = stop?.();
    stop = null;
    await closing;
    await until(() => a.closed.length > 0 && b.closed.length > 0, 'room:closed received');
    expect(a.closed[0]).toEqual({ reason: 'serverRestart' });
  });
});
