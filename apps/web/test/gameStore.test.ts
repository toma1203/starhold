import { beforeEach, describe, expect, it } from 'vitest';
import type { GameEvent, PlayerView } from '@starhold/engine';
import type { GameStatePayload, RoomInfo } from '@starhold/protocol';
import { bindSocket, useGameStore } from '../src/store/gameStore.ts';
import { loadLocale, loadMuted, loadSession, saveSession } from '../src/net/session.ts';
import { FakeSocket } from './fakeSocket.ts';

const TOKEN = 'b'.repeat(32);

function roomInfo(code = 'ABCDE', over: Partial<RoomInfo> = {}): RoomInfo {
  return {
    code,
    phase: 'LOBBY',
    hostId: 'p1',
    seats: [
      { playerId: 'p1', name: 'Nova', isBot: false, botLevel: null, connected: true, afk: false },
    ],
    settings: { targetVp: 8, turnSeconds: 90 },
    you: 'p1',
    ...over,
  };
}

function payload(version: number): GameStatePayload {
  return {
    version,
    view: { marker: version } as unknown as PlayerView,
    turnDeadline: null,
    discardDeadline: null,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let socket: FakeSocket;

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  useGameStore.setState(useGameStore.getInitialState(), true);
  socket = new FakeSocket();
  bindSocket(socket.asSocket());
});

describe('connection', () => {
  it('tracks connect and disconnect', () => {
    expect(useGameStore.getState().connection).toBe('connecting');
    socket.trigger('connect');
    expect(useGameStore.getState().connection).toBe('online');
    socket.trigger('disconnect');
    expect(useGameStore.getState().connection).toBe('offline');
  });
});

describe('game:state', () => {
  it('ignores stale game:state versions', () => {
    socket.trigger('game:state', payload(2));
    socket.trigger('game:state', payload(1));
    socket.trigger('game:state', payload(2));
    expect(useGameStore.getState().game?.version).toBe(2);
    expect(useGameStore.getState().game?.view).toEqual({ marker: 2 });
    socket.trigger('game:state', payload(3));
    expect(useGameStore.getState().game?.version).toBe(3);
  });

  it('forgets the game when the client moves to another room', () => {
    socket.trigger('room:state', roomInfo('ABCDE'));
    socket.trigger('game:state', payload(9));
    socket.trigger('room:state', roomInfo('FGHJK'));
    expect(useGameStore.getState().game).toBeNull();
    socket.trigger('game:state', payload(1));
    expect(useGameStore.getState().game?.version).toBe(1);
  });

  it('keeps the game across room:state updates for the same room', () => {
    socket.trigger('room:state', roomInfo('ABCDE'));
    socket.trigger('game:state', payload(4));
    socket.trigger('room:state', roomInfo('ABCDE', { phase: 'IN_GAME' }));
    expect(useGameStore.getState().game?.version).toBe(4);
    expect(useGameStore.getState().room?.phase).toBe('IN_GAME');
  });
});

describe('game:events log', () => {
  it('log keeps last 100 events', () => {
    const events = Array.from(
      { length: 150 },
      (_, i) => ({ type: 'n', i }) as unknown as GameEvent,
    );
    socket.trigger('game:events', events.slice(0, 80));
    socket.trigger('game:events', events.slice(80));
    const { log } = useGameStore.getState();
    expect(log).toHaveLength(100);
    expect((log[0]?.event as unknown as { i: number }).i).toBe(50);
    expect((log.at(-1)?.event as unknown as { i: number }).i).toBe(149);
    const ids = log.map((l) => l.id);
    expect(new Set(ids).size).toBe(100);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });
});

describe('errors and toasts', () => {
  it('records the latest error with an id that grows with every error and log entry', () => {
    expect(useGameStore.getState().lastActionError).toBeNull();
    socket.trigger('error', { code: 'err.invalidDice' });
    const first = useGameStore.getState().lastActionError;
    expect(first?.code).toBe('err.invalidDice');
    socket.trigger('game:events', [{ type: 'tradeCancelled' }]);
    const logId = useGameStore.getState().log.at(-1)!.id;
    expect(logId).toBeGreaterThan(first!.id);
    socket.trigger('error', { code: 'err.notYourTurn' });
    const second = useGameStore.getState().lastActionError;
    expect(second?.code).toBe('err.notYourTurn');
    expect(second!.id).toBeGreaterThan(logId);
  });

  it('error event pushes toast with code key', () => {
    socket.trigger('error', { code: 'err.notHost' });
    const { toasts } = useGameStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.key).toBe('err.notHost');
  });

  it('dismissToast removes only that toast', () => {
    socket.trigger('error', { code: 'err.notHost' });
    socket.trigger('error', { code: 'err.badRequest' });
    const [first, second] = useGameStore.getState().toasts;
    useGameStore.getState().dismissToast(first!.id);
    expect(useGameStore.getState().toasts.map((t) => t.id)).toEqual([second!.id]);
  });
});

describe('rejoin on connect', () => {
  it('boots into rejoin when session exists', () => {
    saveSession('ABCDE', { playerId: 'p1', token: TOKEN });
    window.history.pushState(null, '', '/room/ABCDE');
    socket.trigger('connect');
    expect(socket.sent('room:rejoin').map((a) => a[0])).toEqual([{ code: 'ABCDE', token: TOKEN }]);
  });

  it('does not rejoin without a session or a room route', () => {
    window.history.pushState(null, '', '/room/ABCDE');
    socket.trigger('connect');
    window.history.pushState(null, '', '/');
    saveSession('ABCDE', { playerId: 'p1', token: TOKEN });
    socket.trigger('connect');
    expect(socket.sent('room:rejoin')).toHaveLength(0);
  });

  it('rejoins the room it already shows after a reconnect', () => {
    saveSession('ABCDE', { playerId: 'p1', token: TOKEN });
    socket.trigger('connect');
    socket.trigger('room:state', roomInfo('ABCDE'));
    socket.trigger('disconnect');
    socket.trigger('connect');
    expect(socket.sent('room:rejoin')).toHaveLength(1);
  });

  it('a successful rejoin keeps the session and marks the room as active', async () => {
    saveSession('ABCDE', { playerId: 'p1', token: TOKEN });
    window.history.pushState(null, '', '/room/ABCDE');
    socket.trigger('connect');
    socket.ack('room:rejoin', { ok: true, code: 'ABCDE', playerId: 'p1', token: TOKEN });
    await flush();
    expect(loadSession('ABCDE')).not.toBeNull();
    expect(useGameStore.getState().activeCode).toBe('ABCDE');
  });

  it('a failed rejoin clears that session', async () => {
    saveSession('ABCDE', { playerId: 'p1', token: TOKEN });
    window.history.pushState(null, '', '/room/ABCDE');
    const before = useGameStore.getState().sessionTick;
    socket.trigger('connect');
    socket.ack('room:rejoin', { ok: false, error: 'err.roomNotFound' });
    await flush();
    expect(loadSession('ABCDE')).toBeNull();
    expect(useGameStore.getState().sessionTick).toBeGreaterThan(before);
    expect(useGameStore.getState().activeCode).toBeNull();
  });

  it('does not send a second rejoin while one is in flight', () => {
    saveSession('ABCDE', { playerId: 'p1', token: TOKEN });
    window.history.pushState(null, '', '/room/ABCDE');
    socket.trigger('connect');
    void useGameStore.getState().rejoin('ABCDE');
    expect(socket.sent('room:rejoin')).toHaveLength(1);
  });

  it('rejoin resolves false without a session', async () => {
    await expect(useGameStore.getState().rejoin('ABCDE')).resolves.toBe(false);
    expect(socket.sent('room:rejoin')).toHaveLength(0);
  });
});

describe('create and join', () => {
  it('createRoom saves the session and resolves the code', async () => {
    const p = useGameStore.getState().createRoom('Nova');
    expect(socket.sent('room:create')[0]?.[0]).toEqual({ name: 'Nova' });
    socket.ack('room:create', { ok: true, code: 'ABCDE', playerId: 'p1', token: TOKEN });
    await expect(p).resolves.toBe('ABCDE');
    expect(loadSession('ABCDE')).toEqual({ playerId: 'p1', token: TOKEN });
    expect(useGameStore.getState().activeCode).toBe('ABCDE');
  });

  it('createRoom resolves null and toasts the error key on failure', async () => {
    const p = useGameStore.getState().createRoom('Nova');
    socket.ack('room:create', { ok: false, error: 'err.serverFull' });
    await expect(p).resolves.toBeNull();
    expect(useGameStore.getState().toasts[0]?.key).toBe('err.serverFull');
  });

  it('joinRoom saves the session on success and toasts on failure', async () => {
    const ok = useGameStore.getState().joinRoom('ABCDE', 'Nova');
    expect(socket.sent('room:join')[0]?.[0]).toEqual({ code: 'ABCDE', name: 'Nova' });
    socket.ack('room:join', { ok: true, code: 'ABCDE', playerId: 'p2', token: TOKEN });
    await expect(ok).resolves.toBe(true);
    expect(loadSession('ABCDE')?.playerId).toBe('p2');

    const bad = useGameStore.getState().joinRoom('FGHJK', 'Nova');
    socket.ack('room:join', { ok: false, error: 'err.roomFull' });
    await expect(bad).resolves.toBe(false);
    expect(loadSession('FGHJK')).toBeNull();
    expect(useGameStore.getState().toasts.at(-1)?.key).toBe('err.roomFull');
  });
});

describe('commands', () => {
  it('emits the room and game commands', () => {
    const s = useGameStore.getState();
    s.addBot('easy');
    s.removeBot('bot1');
    s.updateSettings({ targetVp: 10, turnSeconds: 60 });
    s.startGame();
    s.rematch();
    s.sendAction({ type: 'endTurn' });
    expect(socket.emitted.map((e) => [e.event, ...e.args])).toEqual([
      ['room:addBot', { level: 'easy' }],
      ['room:removeBot', { playerId: 'bot1' }],
      ['room:settings', { targetVp: 10, turnSeconds: 60 }],
      ['room:start'],
      ['room:rematch'],
      ['game:action', { type: 'endTurn' }],
    ]);
  });

  it('leaveRoom tells the server, drops the session and resets room state', () => {
    saveSession('ABCDE', { playerId: 'p1', token: TOKEN });
    socket.trigger('room:state', roomInfo('ABCDE'));
    socket.trigger('game:state', payload(3));
    useGameStore.getState().leaveRoom();
    expect(socket.sent('room:leave')).toHaveLength(1);
    expect(loadSession('ABCDE')).toBeNull();
    const s = useGameStore.getState();
    expect(s.room).toBeNull();
    expect(s.game).toBeNull();
    expect(s.log).toEqual([]);
    expect(s.activeCode).toBeNull();
  });
});

describe('room:closed', () => {
  function seat() {
    saveSession('ABCDE', { playerId: 'p1', token: TOKEN });
    window.history.pushState(null, '', '/room/ABCDE');
    socket.trigger('room:state', roomInfo('ABCDE'));
    socket.trigger('game:state', payload(5));
  }

  it.each(['expired', 'serverRestart'] as const)(
    '%s clears state and session, toasts and goes home',
    (reason) => {
      seat();
      socket.trigger('room:closed', { reason });
      const s = useGameStore.getState();
      expect(s.room).toBeNull();
      expect(s.game).toBeNull();
      expect(loadSession('ABCDE')).toBeNull();
      expect(s.toasts.at(-1)?.key).toBe(`room.closed.${reason}`);
      expect(window.location.pathname).toBe('/');
    },
  );

  it('replaced keeps the session so a reload can take the seat back', () => {
    seat();
    socket.trigger('room:closed', { reason: 'replaced' });
    const s = useGameStore.getState();
    expect(s.room).toBeNull();
    expect(s.game).toBeNull();
    expect(loadSession('ABCDE')).not.toBeNull();
    expect(s.toasts.at(-1)?.key).toBe('room.closed.replaced');
    expect(window.location.pathname).toBe('/');
  });
});

describe('preferences', () => {
  it('setLocale and setMuted persist', () => {
    useGameStore.getState().setLocale('hr');
    useGameStore.getState().setMuted(true);
    expect(useGameStore.getState().locale).toBe('hr');
    expect(useGameStore.getState().muted).toBe(true);
    expect(loadLocale()).toBe('hr');
    expect(loadMuted()).toBe(true);
    expect(document.documentElement.lang).toBe('hr');
  });
});
