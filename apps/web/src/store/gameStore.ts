import { create } from 'zustand';
import { navigate } from 'wouter/use-browser-location';
import type { Action, BotLevel, GameEvent } from '@starhold/engine';
import { detectLocale } from '@starhold/i18n';
import type { Locale, MessageKey, Params } from '@starhold/i18n';
import type { GameStatePayload, JoinAck, RoomInfo, RoomSettings } from '@starhold/protocol';
import type { AppSocket } from '../net/socket.ts';
import {
  clearSession,
  loadLocale,
  loadMuted,
  loadSession,
  saveLocale,
  saveMuted,
  saveSession,
} from '../net/session.ts';
import { playSfx, setSfxMuted, sfxForEvent } from '../audio/sfx.ts';

const LOG_LIMIT = 100;
/** How long create/join wait for the server's ack before telling the user they are offline. */
const ACK_TIMEOUT_MS = 8000;

export interface LogEntry {
  id: number;
  event: GameEvent;
}

export interface Toast {
  id: number;
  key: MessageKey;
  params?: Params;
}

/** The newest server error; its id comes from the counter shared with log entries and toasts. */
export interface ActionError {
  id: number;
  code: MessageKey;
}

export interface GameStore {
  connection: 'connecting' | 'online' | 'offline';
  /** True once the socket has connected at least once (the first connect is not a "reconnect"). */
  hasConnected: boolean;
  /** Connect errors since the last successful connect; the banner offers a manual retry at 3. */
  reconnectFailures: number;
  room: RoomInfo | null;
  game: GameStatePayload | null;
  log: LogEntry[];
  toasts: Toast[];
  lastActionError: ActionError | null;
  locale: Locale;
  muted: boolean;
  /** Room code this socket is bound to on the server; cleared on disconnect. */
  activeCode: string | null;
  /** Room the current `game` belongs to, so the version guard restarts when the room changes. */
  gameCode: string | null;
  /** Room the current `log` belongs to. */
  logCode: string | null;
  /** Bumped whenever a stored session is saved or cleared, so routes can re-evaluate it. */
  sessionTick: number;

  createRoom: (name: string) => Promise<string | null>;
  joinRoom: (code: string, name: string) => Promise<boolean>;
  rejoin: (code: string) => Promise<boolean>;
  leaveRoom: () => void;
  /** Asks the transport to connect right now (the "Try again" button on the banner). */
  retryConnect: () => void;
  sendAction: (a: Action) => void;
  addBot: (level: BotLevel) => void;
  removeBot: (playerId: string) => void;
  updateSettings: (s: RoomSettings) => void;
  startGame: () => void;
  rematch: () => void;
  pushToast: (key: MessageKey, params?: Params) => void;
  dismissToast: (id: number) => void;
  setLocale: (l: Locale) => void;
  setMuted: (b: boolean) => void;
}

let socket: AppSocket | null = null;
let nextId = 1;
/** Rejoins awaiting their ack, so the connect handler and the route never double-send. */
const rejoining = new Map<string, Promise<boolean>>();

function initialLocale(): Locale {
  const saved = loadLocale();
  if (saved !== null) return saved;
  if (typeof navigator === 'undefined') return 'en';
  return detectLocale(navigator.languages.length > 0 ? navigator.languages : [navigator.language]);
}

/** The room code in the address bar, when the current route is /room/:code. */
function codeFromPath(): string | null {
  const match = /^\/room\/([A-Za-z0-9]+)\/?$/.exec(window.location.pathname);
  return match?.[1] === undefined ? null : match[1].toUpperCase();
}

/**
 * The room the server is pushing state for: the one this socket is bound to, else the one on
 * screen. The address bar only decides before the first bind (a fresh page), because on history
 * navigation it can already name room B while the socket is still bound to room A.
 */
function currentCode(s: GameStore): string | null {
  return s.activeCode ?? s.room?.code ?? codeFromPath();
}

function withToast(s: GameStore, key: MessageKey, params?: Params): Pick<GameStore, 'toasts'> {
  const toast: Toast = params === undefined ? { id: nextId++, key } : { id: nextId++, key, params };
  return { toasts: [...s.toasts, toast] };
}

export const useGameStore = create<GameStore>()((set, get) => {
  const initialMuted = loadMuted();
  setSfxMuted(initialMuted);

  /** Shared by create and join: saves the seat's session and marks the room active. */
  const adopt = (ack: JoinAck): boolean => {
    if (!ack.ok) {
      set((s) => withToast(s, ack.error));
      return false;
    }
    saveSession(ack.code, { playerId: ack.playerId, token: ack.token });
    set((s) => ({ activeCode: ack.code, sessionTick: s.sessionTick + 1 }));
    return true;
  };

  /** No usable connection (or the ack never came): tell the user and resolve the failure value. */
  const offline = <T>(resolve: (value: T) => void, failure: T): void => {
    set((s) => withToast(s, 'err.offline'));
    resolve(failure);
  };

  return {
    connection: 'connecting',
    hasConnected: false,
    reconnectFailures: 0,
    room: null,
    game: null,
    log: [],
    toasts: [],
    lastActionError: null,
    locale: initialLocale(),
    muted: initialMuted,
    activeCode: null,
    gameCode: null,
    logCode: null,
    sessionTick: 0,

    createRoom: (name) =>
      new Promise((resolve) => {
        const live = socket;
        if (live === null || !live.connected) return offline(resolve, null);
        // A timed-out ack is reported once as an error; socket.io never calls this back again,
        // so a late server reply cannot resolve the promise twice or save a session after the toast.
        live.timeout(ACK_TIMEOUT_MS).emit('room:create', { name }, (err, ack) => {
          if (err) return offline(resolve, null);
          resolve(adopt(ack) && ack.ok ? ack.code : null);
        });
      }),

    joinRoom: (code, name) =>
      new Promise((resolve) => {
        const live = socket;
        if (live === null || !live.connected) return offline(resolve, false);
        // Same late-ack behaviour as createRoom: after a timeout the ack is dropped for good.
        live.timeout(ACK_TIMEOUT_MS).emit('room:join', { code, name }, (err, ack) => {
          if (err) return offline(resolve, false);
          resolve(adopt(ack));
        });
      }),

    rejoin: (code) => {
      const pending = rejoining.get(code);
      if (pending !== undefined) return pending;
      const session = loadSession(code);
      if (socket === null || session === null) return Promise.resolve(false);
      const live = socket;
      const attempt = new Promise<boolean>((resolve) => {
        live.emit('room:rejoin', { code, token: session.token }, (ack) => {
          rejoining.delete(code);
          if (ack.ok) {
            // Re-saving renews the session's 24 h lifetime while the player keeps coming back.
            saveSession(ack.code, { playerId: ack.playerId, token: ack.token });
            set({ activeCode: ack.code });
            resolve(true);
            return;
          }
          clearSession(code);
          const onScreen = get().room?.code === code || codeFromPath() === code;
          set((s) => ({
            ...(onScreen ? withToast(s, 'room.closed.gone') : {}),
            activeCode: s.activeCode === code ? null : s.activeCode,
            sessionTick: s.sessionTick + 1,
            // Whatever the client still shows for that room is stale now.
            ...(s.room?.code === code ? { room: null } : {}),
            ...(s.gameCode === code ? { game: null, gameCode: null } : {}),
            ...(s.logCode === code ? { log: [], logCode: null } : {}),
          }));
          // Spec §5: an unknown or expired room means a message and back to the start.
          if (onScreen) navigate('/');
          resolve(false);
        });
      });
      rejoining.set(code, attempt);
      return attempt;
    },

    leaveRoom: () => {
      const code = get().room?.code ?? codeFromPath() ?? get().activeCode;
      socket?.emit('room:leave');
      if (code !== null) clearSession(code);
      set((s) => ({
        room: null,
        game: null,
        gameCode: null,
        log: [],
        logCode: null,
        activeCode: null,
        sessionTick: s.sessionTick + 1,
      }));
    },

    retryConnect: () => void socket?.connect(),

    sendAction: (a) => void socket?.emit('game:action', a),
    addBot: (level) => void socket?.emit('room:addBot', { level }),
    removeBot: (playerId) => void socket?.emit('room:removeBot', { playerId }),
    updateSettings: (s) => void socket?.emit('room:settings', s),
    startGame: () => void socket?.emit('room:start'),
    rematch: () => void socket?.emit('room:rematch'),

    pushToast: (key, params) => set((s) => withToast(s, key, params)),
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    setLocale: (locale) => {
      saveLocale(locale);
      document.documentElement.lang = locale;
      set({ locale });
    },

    setMuted: (muted) => {
      saveMuted(muted);
      setSfxMuted(muted);
      set({ muted });
    },
  };
});

/** Wires server events into the store. Call once with the live socket (tests pass a fake). */
export function bindSocket(live: AppSocket): void {
  socket = live;
  rejoining.clear();
  const { setState: set, getState: get } = useGameStore;

  live.on('connect', () => {
    set({ connection: 'online', hasConnected: true, reconnectFailures: 0 });
    const code = get().room?.code ?? codeFromPath();
    if (code !== null && loadSession(code) !== null) void get().rejoin(code);
  });

  live.on('disconnect', () => {
    rejoining.clear();
    set({ connection: 'offline', activeCode: null });
  });

  live.on('connect_error', () =>
    set((s) => ({ connection: 'offline', reconnectFailures: s.reconnectFailures + 1 })),
  );

  live.on('room:state', (info) =>
    set((s) => ({
      room: info,
      // The game and log are only dropped when they belong to another room: a game:state that
      // raced ahead of its room:state (rejoin on a fresh page) belongs to this room and survives.
      ...(s.gameCode !== null && s.gameCode !== info.code ? { game: null, gameCode: null } : {}),
      ...(s.logCode !== null && s.logCode !== info.code ? { log: [], logCode: null } : {}),
    })),
  );

  live.on('game:state', (payload) =>
    set((s) => {
      const code = currentCode(s);
      // The stale-version guard only compares versions inside one room.
      if (s.game !== null && s.gameCode === code && payload.version <= s.game.version) return s;
      return { game: payload, gameCode: code };
    }),
  );

  live.on('game:events', (events) => {
    set((s) => {
      const code = currentCode(s);
      const kept = s.logCode === code ? s.log : [];
      return {
        log: [...kept, ...events.map((event) => ({ id: nextId++, event }))].slice(-LOG_LIMIT),
        logCode: code,
      };
    });
    const me = get().room?.you;
    if (me === undefined) return;
    const sounds = new Set(events.map((event) => sfxForEvent(event, me)));
    for (const sound of sounds) if (sound !== null) playSfx(sound);
  });

  live.on('error', ({ code }) =>
    set((s) => ({ ...withToast(s, code), lastActionError: { id: nextId++, code } })),
  );

  live.on('room:closed', ({ reason }) => {
    const code = get().room?.code ?? codeFromPath() ?? get().activeCode;
    // `replaced` keeps the session: reloading the page takes the seat back.
    if (code !== null && reason !== 'replaced') clearSession(code);
    set((s) => ({
      room: null,
      game: null,
      gameCode: null,
      log: [],
      logCode: null,
      activeCode: null,
      sessionTick: s.sessionTick + 1,
      ...withToast(s, `room.closed.${reason}`),
    }));
    navigate('/');
  });
}
