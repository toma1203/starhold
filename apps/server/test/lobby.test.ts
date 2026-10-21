import { describe, expect, it } from 'vitest';
import { Room } from '../src/room.ts';
import { makeHooks, testConfig } from './helpers.ts';

function setup() {
  const hooks = makeHooks();
  const room = new Room('ABCDE', testConfig(), hooks);
  return { hooks, room };
}

function join(room: Room, name: string): { playerId: string; token: string } {
  const r = room.addHuman(name);
  if ('error' in r) throw new Error(r.error);
  return r;
}

function addBot(room: Room, by: string, level: 'easy' | 'normal'): string {
  const r = room.addBot(by, level);
  if ('error' in r) throw new Error(r.error);
  return r.botId;
}

describe('Room lobby', () => {
  it('first human is host', () => {
    const { room } = setup();
    const a = join(room, 'Ada');
    const b = join(room, 'Bo');
    const info = room.info(b.playerId);
    expect(info.hostId).toBe(a.playerId);
    expect(info.you).toBe(b.playerId);
    expect(info.phase).toBe('LOBBY');
    expect(info.code).toBe('ABCDE');
    expect(info.seats.map((s) => s.name)).toEqual(['Ada', 'Bo']);
    expect(info.seats.every((s) => s.connected && !s.afk && !s.isBot)).toBe(true);
  });

  it('fifth seat -> err.roomFull', () => {
    const { room } = setup();
    for (const n of ['A', 'B', 'C', 'D']) join(room, n);
    expect(room.addHuman('E')).toEqual({ error: 'err.roomFull' });
  });

  it('bots count towards the seat limit', () => {
    const { room } = setup();
    const host = join(room, 'A');
    for (let i = 0; i < 3; i += 1) addBot(room, host.playerId, 'easy');
    expect(room.addHuman('B')).toEqual({ error: 'err.roomFull' });
    expect(room.addBot(host.playerId, 'easy')).toEqual({ error: 'err.roomFull' });
  });

  it('rejects bad nicknames with err.badRequest and sanitizes good ones', () => {
    const { room } = setup();
    expect(room.addHuman('   ')).toEqual({ error: 'err.badRequest' });
    expect(room.addHuman('x'.repeat(21))).toEqual({ error: 'err.badRequest' });
    const ok = join(room, '  Ada\u0007  ');
    expect(room.info(ok.playerId).seats[0]?.name).toBe('Ada');
  });

  it('non-host addBot -> err.notHost', () => {
    const { room } = setup();
    join(room, 'Host');
    const guest = join(room, 'Guest');
    expect(room.addBot(guest.playerId, 'easy')).toEqual({ error: 'err.notHost' });
    expect(room.info(guest.playerId).seats).toHaveLength(2);
  });

  it('bots get distinct names, first unused, with their level', () => {
    const { room } = setup();
    const host = join(room, 'Host');
    addBot(room, host.playerId, 'easy');
    const second = addBot(room, host.playerId, 'normal');
    addBot(room, host.playerId, 'easy');
    const seats = room.info(host.playerId).seats;
    expect(seats.slice(1).map((s) => s.name)).toEqual(['Bot Vega', 'Bot Orion', 'Bot Lyra']);
    expect(seats[2]).toMatchObject({ isBot: true, botLevel: 'normal', connected: true });
    // Removing a middle bot frees its name for the next one.
    expect(room.removeBot(host.playerId, second)).toEqual({ ok: true });
    addBot(room, host.playerId, 'easy');
    expect(room.info(host.playerId).seats.map((s) => s.name)).toContain('Bot Orion');
  });

  it('removeBot: only the host, only bots', () => {
    const { room } = setup();
    const host = join(room, 'Host');
    const guest = join(room, 'Guest');
    const bot = addBot(room, host.playerId, 'easy');
    expect(room.removeBot(guest.playerId, bot)).toEqual({ error: 'err.notHost' });
    expect(room.removeBot(host.playerId, guest.playerId)).toEqual({ error: 'err.badRequest' });
    expect(room.removeBot(host.playerId, 'nobody')).toEqual({ error: 'err.badRequest' });
    expect(room.removeBot(host.playerId, bot)).toEqual({ ok: true });
    expect(room.info(host.playerId).seats).toHaveLength(2);
  });

  it('settings: host only, validated, lobby only', () => {
    const { room } = setup();
    const host = join(room, 'Host');
    const guest = join(room, 'Guest');
    expect(room.updateSettings(guest.playerId, { targetVp: 10, turnSeconds: 60 })).toEqual({
      error: 'err.notHost',
    });
    expect(room.updateSettings(host.playerId, { targetVp: 7, turnSeconds: 60 })).toEqual({
      error: 'err.badRequest',
    });
    expect(room.updateSettings(host.playerId, { targetVp: 10, turnSeconds: 60, x: 1 })).toEqual({
      error: 'err.badRequest',
    });
    expect(room.updateSettings(host.playerId, { targetVp: 10, turnSeconds: 60 })).toEqual({
      ok: true,
    });
    expect(room.info(host.playerId).settings).toEqual({ targetVp: 10, turnSeconds: 60 });
    room.start(host.playerId);
    expect(room.updateSettings(host.playerId, { targetVp: 6, turnSeconds: 90 })).toEqual({
      error: 'err.gameStarted',
    });
  });

  it('start with one seat -> err.notEnoughPlayers', () => {
    const { room } = setup();
    const host = join(room, 'Host');
    expect(room.start(host.playerId)).toEqual({ error: 'err.notEnoughPlayers' });
    expect(room.phase).toBe('LOBBY');
    expect(room.game).toBeNull();
  });

  it('non-host start -> err.notHost', () => {
    const { room } = setup();
    join(room, 'Host');
    const guest = join(room, 'Guest');
    expect(room.start(guest.playerId)).toEqual({ error: 'err.notHost' });
  });

  it('start creates a game with seats as configured and phase IN_GAME', () => {
    const { room } = setup();
    const host = join(room, 'Host');
    addBot(room, host.playerId, 'normal');
    room.updateSettings(host.playerId, { targetVp: 6, turnSeconds: 120 });
    expect(room.start(host.playerId)).toEqual({ ok: true });
    expect(room.phase).toBe('IN_GAME');
    const game = room.game;
    expect(game).not.toBeNull();
    expect(game?.settings.targetVp).toBe(6);
    const configured = room.info(host.playerId).seats;
    expect(game?.players).toHaveLength(2);
    for (const seat of configured) {
      expect(game?.players.find((p) => p.id === seat.playerId)).toMatchObject({
        name: seat.name,
        isBot: seat.isBot,
        botLevel: seat.botLevel,
      });
    }
    expect(room.start(host.playerId)).toEqual({ error: 'err.gameStarted' });
  });

  it('join after start -> err.gameStarted', () => {
    const { room } = setup();
    const host = join(room, 'Host');
    addBot(room, host.playerId, 'easy');
    room.start(host.playerId);
    expect(room.addHuman('Late')).toEqual({ error: 'err.gameStarted' });
    expect(room.addBot(host.playerId, 'easy')).toEqual({ error: 'err.gameStarted' });
  });

  it('rejoin with valid token returns same playerId; invalid -> null', () => {
    const { room } = setup();
    const a = join(room, 'Ada');
    join(room, 'Bo');
    room.markDisconnected(a.playerId);
    expect(room.info(a.playerId).seats[0]?.connected).toBe(false);
    expect(room.rejoin(a.token)).toBe(a.playerId);
    expect(room.info(a.playerId).seats[0]?.connected).toBe(true);
    expect(room.rejoin('0'.repeat(32))).toBeNull();
    expect(room.rejoin('not-a-token')).toBeNull();
    expect(room.rejoin('')).toBeNull();
  });

  it('rejoin clears AFK in game', () => {
    const { room } = setup();
    const host = join(room, 'Host');
    addBot(room, host.playerId, 'easy');
    room.start(host.playerId);
    room.markDisconnected(host.playerId);
    expect(room.info(host.playerId).seats[0]).toMatchObject({ connected: false, afk: true });
    room.rejoin(host.token);
    expect(room.info(host.playerId).seats[0]).toMatchObject({ connected: true, afk: false });
  });

  it('host leaving lobby transfers host to next human and removes the seat', () => {
    const { room } = setup();
    const a = join(room, 'Ada');
    const b = join(room, 'Bo');
    const c = join(room, 'Cy');
    room.leave(a.playerId);
    const info = room.info(b.playerId);
    expect(info.hostId).toBe(b.playerId);
    expect(info.seats.map((s) => s.playerId)).toEqual([b.playerId, c.playerId]);
    expect(room.rejoin(a.token)).toBeNull();
  });

  it('host transfer skips bots and disconnected humans', () => {
    const { room } = setup();
    const a = join(room, 'Ada');
    addBot(room, a.playerId, 'easy');
    const b = join(room, 'Bo');
    const c = join(room, 'Cy');
    room.markDisconnected(b.playerId);
    room.leave(a.playerId);
    expect(room.info(c.playerId).hostId).toBe(c.playerId);
  });

  it('last human leaving the lobby drops bots; the next joiner becomes host', () => {
    const { room } = setup();
    const a = join(room, 'Ada');
    addBot(room, a.playerId, 'easy');
    room.leave(a.playerId);
    expect(room.isEmptyOfHumans()).toBe(true);
    const b = join(room, 'Bo');
    const info = room.info(b.playerId);
    expect(info.hostId).toBe(b.playerId);
    expect(info.seats).toHaveLength(1);
  });

  it('leaving mid-game keeps the seat as disconnected + AFK and transfers host', () => {
    const { room } = setup();
    const a = join(room, 'Ada');
    const b = join(room, 'Bo');
    room.start(a.playerId);
    room.leave(a.playerId);
    const info = room.info(b.playerId);
    expect(info.hostId).toBe(b.playerId);
    expect(info.seats[0]).toMatchObject({ playerId: a.playerId, connected: false, afk: true });
    expect(room.rejoin(a.token)).toBe(a.playerId);
  });

  it('isEmptyOfHumans: bots do not count, disconnected humans do not count', () => {
    const { room } = setup();
    expect(room.isEmptyOfHumans()).toBe(true);
    const a = join(room, 'Ada');
    addBot(room, a.playerId, 'easy');
    expect(room.isEmptyOfHumans()).toBe(false);
    room.markDisconnected(a.playerId);
    expect(room.isEmptyOfHumans()).toBe(true);
  });

  it('tracks emptySince and lastActivity from the injected clock', () => {
    const { room, hooks } = setup();
    expect(room.emptySince).toBe(hooks.time);
    hooks.time += 10;
    const a = join(room, 'Ada');
    expect(room.emptySince).toBeNull();
    expect(room.lastActivity).toBe(hooks.time);
    hooks.time += 10;
    room.markDisconnected(a.playerId);
    expect(room.emptySince).toBe(hooks.time);
    hooks.time += 10;
    room.rejoin(a.token);
    expect(room.emptySince).toBeNull();
    hooks.time += 10;
    room.leave(a.playerId);
    expect(room.emptySince).toBe(hooks.time);
  });

  it('failed calls do not touch lastActivity or broadcast', () => {
    const { room, hooks } = setup();
    const a = join(room, 'Ada');
    const before = room.lastActivity;
    const casts = hooks.broadcasts;
    hooks.time += 50;
    room.start(a.playerId);
    room.rejoin('bad');
    expect(room.lastActivity).toBe(before);
    expect(hooks.broadcasts).toBe(casts);
  });

  it('broadcasts after successful mutations', () => {
    const { room, hooks } = setup();
    const a = join(room, 'Ada');
    expect(hooks.broadcasts).toBe(1);
    addBot(room, a.playerId, 'easy');
    expect(hooks.broadcasts).toBe(2);
    room.start(a.playerId);
    expect(hooks.broadcasts).toBe(3);
  });
});
