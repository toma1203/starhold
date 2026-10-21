import { describe, expect, it } from 'vitest';
import { RoomCodeSchema } from '@starhold/protocol';
import type { Room } from '../src/room.ts';
import { RoomManager } from '../src/roomManager.ts';
import { makeHooks, testConfig } from './helpers.ts';

const MIN = 60_000;

function created(m: RoomManager): Room {
  const r = m.create();
  if ('error' in r) throw new Error(r.error);
  return r;
}

function joined(room: Room, name: string): { playerId: string; token: string } {
  const r = room.addHuman(name);
  if ('error' in r) throw new Error(r.error);
  return r;
}

describe('RoomManager', () => {
  it('codes are unique and match RoomCodeSchema', () => {
    const m = new RoomManager(testConfig(), makeHooks());
    const codes = new Set<string>();
    for (let i = 0; i < 300; i += 1) {
      const code = created(m).code;
      expect(RoomCodeSchema.safeParse(code).success).toBe(true);
      codes.add(code);
    }
    expect(codes.size).toBe(300);
    expect(m.size).toBe(300);
  });

  it('create beyond maxRooms -> err.serverFull', () => {
    const m = new RoomManager(testConfig({ maxRooms: 2 }), makeHooks());
    created(m);
    created(m);
    expect(m.create()).toEqual({ error: 'err.serverFull' });
    expect(m.size).toBe(2);
  });

  it('get is case-insensitive; delete removes', () => {
    const m = new RoomManager(testConfig(), makeHooks());
    const room = created(m);
    expect(m.get(room.code)).toBe(room);
    expect(m.get(room.code.toLowerCase())).toBe(room);
    expect(m.get('ZZZZZ')).toBeUndefined();
    expect(m.delete(room.code)).toBe(true);
    expect(m.delete(room.code)).toBe(false);
    expect(m.get(room.code)).toBeUndefined();
  });

  it('findByToken resolves a player and rejects wrong codes or tokens', () => {
    const m = new RoomManager(testConfig(), makeHooks());
    const room = created(m);
    const a = joined(room, 'Ada');
    expect(m.findByToken(room.code, a.token)).toEqual({ room, playerId: a.playerId });
    expect(m.findByToken(room.code, '0'.repeat(32))).toBeNull();
    expect(m.findByToken('ZZZZZ', a.token)).toBeNull();
  });

  it('sweep deletes empty room after 30 min but not after 29', () => {
    const hooks = makeHooks(0);
    const m = new RoomManager(testConfig(), hooks);
    const room = created(m);
    const a = joined(room, 'Ada');
    hooks.time = 10 * MIN;
    room.markDisconnected(a.playerId);
    expect(m.sweep(10 * MIN + 29 * MIN)).toEqual([]);
    expect(m.get(room.code)).toBe(room);
    expect(m.sweep(10 * MIN + 30 * MIN)).toEqual([room.code]);
    expect(m.get(room.code)).toBeUndefined();
  });

  it('sweep keeps rooms with a connected human, and reconnecting resets the clock', () => {
    const hooks = makeHooks(0);
    const m = new RoomManager(testConfig(), hooks);
    const room = created(m);
    const a = joined(room, 'Ada');
    expect(m.sweep(120 * MIN)).toEqual([]);
    room.markDisconnected(a.playerId);
    room.rejoin(a.token);
    expect(m.sweep(500 * MIN)).toEqual([]);
  });

  it('sweep deletes a never-joined room after the empty TTL', () => {
    const m = new RoomManager(testConfig(), makeHooks(0));
    const room = created(m);
    expect(m.sweep(30 * MIN)).toEqual([room.code]);
  });

  it('sweep deletes finished room after 15 min idle, not after 14', () => {
    const hooks = makeHooks(0);
    const m = new RoomManager(testConfig(), hooks);
    const room = created(m);
    joined(room, 'Ada');
    room.phase = 'FINISHED';
    room.lastActivity = 5 * MIN;
    expect(m.sweep(5 * MIN + 14 * MIN)).toEqual([]);
    expect(m.sweep(5 * MIN + 15 * MIN)).toEqual([room.code]);
  });

  it('sweep leaves an idle in-game room with connected humans alone', () => {
    const hooks = makeHooks(0);
    const m = new RoomManager(testConfig(), hooks);
    const room = created(m);
    const a = joined(room, 'Ada');
    room.addBot(a.playerId, 'easy');
    room.start(a.playerId);
    expect(m.sweep(24 * 60 * MIN)).toEqual([]);
  });
});
