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

const LOG_LIMIT = 100;

export interface LogEntry {
  id: number;
  event: GameEvent;
}

export interface Toast {
  id: number;
  key: MessageKey;
  params?: Params;
}

export interface GameStore {
  connection: 'connecting' | 'online' | 'offline';
  room: RoomInfo | null;
  game: GameStatePayload | null;
  log: LogEntry[];
  toasts: Toast[];
  locale: Locale;
  muted: boolean;
  /** Room code this socket is bound to on the server; cleared on disconnect. */
  activeCode: string | null;
  /** Bumped whenever a stored session is saved or cleared, so routes can re-evaluate it. */
  sessionTick: number;

  createRoom: (name: string) => Promise<string | null>;
  joinRoom: (code: string, name: string) => Promise<boolean>;
  rejoin: (code: string) => Promise<boolean>;
  leaveRoom: () => void;
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

function withToast(s: GameStore, key: MessageKey, params?: Params): Pick<GameStore, 'toasts'> {
  const toast: Toast = params === undefined ? { id: nextId++, key } : { id: nextId++, key, params };
  return { toasts: [...s.toasts, toast] };
}

export const useGameStore = create<GameStore>()((set, get) => {
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

  return {
    connection: 'connecting',
    room: null,
    game: null,
    log: [],
    toasts: [],
    locale: initialLocale(),
    muted: loadMuted(),
    activeCode: null,
    sessionTick: 0,

    createRoom: (name) =>
      new Promise((resolve) => {
        if (socket === null) return resolve(null);
        socket.emit('room:create', { name }, (ack) =>
          resolve(adopt(ack) && ack.ok ? ack.code : null),
        );
      }),

    joinRoom: (code, name) =>
      new Promise((resolve) => {
        if (socket === null) return resolve(false);
        socket.emit('room:join', { code, name }, (ack) => resolve(adopt(ack)));
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
            set({ activeCode: ack.code });
            resolve(true);
            return;
          }
          clearSession(code);
          set((s) => ({
            activeCode: s.activeCode === code ? null : s.activeCode,
            sessionTick: s.sessionTick + 1,
          }));
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
        log: [],
        activeCode: null,
        sessionTick: s.sessionTick + 1,
      }));
    },

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
    set({ connection: 'online' });
    const code = get().room?.code ?? codeFromPath();
    if (code !== null && loadSession(code) !== null) void get().rejoin(code);
  });

  live.on('disconnect', () => {
    rejoining.clear();
    set({ connection: 'offline', activeCode: null });
  });

  live.on('connect_error', () => set({ connection: 'offline' }));

  live.on('room:state', (info) =>
    set((s) =>
      // The game is only dropped when the client moves from one room to another: a game:state
      // that raced ahead of its room:state (rejoin on a fresh page) must survive.
      s.room !== null && s.room.code !== info.code
        ? { room: info, game: null, log: [] }
        : { room: info },
    ),
  );

  live.on('game:state', (payload) =>
    set((s) => (s.game !== null && payload.version <= s.game.version ? s : { game: payload })),
  );

  live.on('game:events', (events) =>
    set((s) => ({
      log: [...s.log, ...events.map((event) => ({ id: nextId++, event }))].slice(-LOG_LIMIT),
    })),
  );

  live.on('error', ({ code }) => set((s) => withToast(s, code)));

  live.on('room:closed', ({ reason }) => {
    const code = get().room?.code ?? codeFromPath() ?? get().activeCode;
    // `replaced` keeps the session: reloading the page takes the seat back.
    if (code !== null && reason !== 'replaced') clearSession(code);
    set((s) => ({
      room: null,
      game: null,
      log: [],
      activeCode: null,
      sessionTick: s.sessionTick + 1,
      ...withToast(s, `room.closed.${reason}`),
    }));
    navigate('/');
  });
}
