import type { Server, Socket } from 'socket.io';
import {
  ActionSchema,
  AddBotPayloadSchema,
  CreateRoomPayloadSchema,
  JoinRoomPayloadSchema,
  RejoinPayloadSchema,
  RemoveBotPayloadSchema,
  SettingsSchema,
  type ClientToServerEvents,
  type JoinAck,
  type RoomErrorCode,
  type ServerError,
  type ServerToClientEvents,
} from '@starhold/protocol';
import type { Config } from './config.ts';
import { log } from './log.ts';
import type { Room, RoomHooks } from './room.ts';
import type { RoomManager } from './roomManager.ts';

export type TransportServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TransportSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type Reply = (ack: JoinAck) => void;
type Handler = (payload: unknown, reply: Reply) => void;

/** What a socket is bound to; stored in `socket.data`. A socket has at most one binding. */
interface Binding {
  code: string;
  playerId: string;
  /** Kept so joining the room you are already in can answer with your own binding. */
  token: string;
}

// --- presence: which socket currently speaks for a player -----------------------

/** playerId -> socket id. The latest socket to claim a player wins. */
class Presence {
  private readonly socketIds = new Map<string, string>();
  get(playerId: string): string | undefined {
    return this.socketIds.get(playerId);
  }
  set(playerId: string, socketId: string): void {
    this.socketIds.set(playerId, socketId);
  }
  release(playerId: string, socketId: string): void {
    if (this.socketIds.get(playerId) === socketId) this.socketIds.delete(playerId);
  }
}

const presences = new WeakMap<TransportServer, Presence>();

function presenceOf(io: TransportServer): Presence {
  let presence = presences.get(io);
  if (!presence) {
    presence = new Presence();
    presences.set(io, presence);
  }
  return presence;
}

type UntypedEmitter = { emit(event: string, payload: unknown): void };

/**
 * The hooks rooms use to reach players. Per-player `room:state` (each player's own `you`),
 * and `emitTo` targets the player's current socket (the latest one wins on reconnect).
 */
export function createHooks(io: TransportServer): RoomHooks {
  const presence = presenceOf(io);
  const socketOf = (playerId: string) => {
    const id = presence.get(playerId);
    return id === undefined ? undefined : io.sockets.sockets.get(id);
  };
  return {
    broadcast(room) {
      for (const seat of room.seats) {
        if (!seat.isBot) socketOf(seat.playerId)?.emit('room:state', room.info(seat.playerId));
      }
    },
    emitTo(playerId, event, payload) {
      (socketOf(playerId) as UntypedEmitter | undefined)?.emit(event, payload);
    },
    now: () => Date.now(),
  };
}

// --- rate limiting ----------------------------------------------------------------

/** Capacity = burst = `perSecond`; refills continuously at `perSecond` tokens per second. */
class TokenBucket {
  private tokens: number;
  private lastRefill = performance.now();
  constructor(private readonly perSecond: number) {
    this.tokens = perSecond;
  }
  take(): boolean {
    const now = performance.now();
    this.tokens = Math.min(
      this.perSecond,
      this.tokens + ((now - this.lastRefill) / 1000) * this.perSecond,
    );
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

// --- the transport ------------------------------------------------------------------

export function attachSocket(io: TransportServer, manager: RoomManager, config: Config): void {
  const presence = presenceOf(io);

  io.on('connection', (socket) => {
    const bucket = new TokenBucket(config.msgsPerSecond);
    let lastRateNotice = Number.NEGATIVE_INFINITY;
    const emitError = (code: ServerError['code']): void => {
      socket.emit('error', { code });
    };

    // Every incoming message costs one token; over the limit it is dropped (acks still answer).
    socket.use((packet, next) => {
      if (bucket.take()) {
        next();
        return;
      }
      // One notice per second is enough; answering every dropped message would amplify a flood.
      const now = performance.now();
      if (now - lastRateNotice >= 1000) {
        lastRateNotice = now;
        emitError('err.rateLimited');
      }
      const ack = packet[packet.length - 1];
      if (typeof ack === 'function') ack({ ok: false, error: 'err.rateLimited' } satisfies JoinAck);
    });

    // --- binding ----------------------------------------------------------------

    const bindingOf = (s: TransportSocket): Binding | null => {
      const { code, playerId, token } = s.data as Partial<Binding>;
      return typeof code === 'string' && typeof playerId === 'string' && typeof token === 'string'
        ? { code, playerId, token }
        : null;
    };

    /** Binds before any room call that emits to the player (rejoin pushes game:state). */
    const bind = (room: Room, playerId: string, token: string): void => {
      const previous = presence.get(playerId);
      if (previous !== undefined && previous !== socket.id) {
        // The newest socket wins; the older one is told why it stopped receiving updates.
        const stale = io.sockets.sockets.get(previous);
        if (stale) {
          stale.data = {};
          void stale.leave(room.code);
          stale.emit('room:closed', { reason: 'replaced' });
        }
      }
      presence.set(playerId, socket.id);
      socket.data = { code: room.code, playerId, token } satisfies Binding;
      void socket.join(room.code);
    };

    /** Drops this socket's binding; with `leave`, the player also gives up the seat. */
    const unbind = (leave: boolean): void => {
      const binding = bindingOf(socket);
      if (!binding) return;
      presence.release(binding.playerId, socket.id);
      socket.data = {};
      void socket.leave(binding.code);
      const room = manager.get(binding.code);
      if (!room) return;
      if (leave) room.leave(binding.playerId);
      else room.markDisconnected(binding.playerId);
    };

    const current = (): { room: Room; playerId: string } | null => {
      const binding = bindingOf(socket);
      const room = binding ? manager.get(binding.code) : undefined;
      return binding && room ? { room, playerId: binding.playerId } : null;
    };

    // --- replies -----------------------------------------------------------------

    const badRequest = (reply: Reply): void => {
      emitError('err.badRequest');
      reply({ ok: false, error: 'err.badRequest' });
    };

    const refuse = (reply: Reply, error: RoomErrorCode): void => {
      reply({ ok: false, error });
    };

    /** Runs `fn` with the socket's room, or answers `err.roomNotFound`. */
    const inRoom = (fn: (room: Room, playerId: string) => void): void => {
      const ctx = current();
      if (!ctx) emitError('err.roomNotFound');
      else fn(ctx.room, ctx.playerId);
    };

    /** Runs a socket entry point so that no exception can escape into Socket.IO (and the process). */
    const guard = (event: string, fn: () => void, onError?: () => void): void => {
      try {
        fn();
      } catch (error) {
        log.error('socket handler failed', {
          event,
          error: error instanceof Error ? error.stack : String(error),
        });
        onError?.();
      }
    };

    /** Registers a handler that tolerates a missing ack and never lets an exception escape. */
    const listen = (event: keyof ClientToServerEvents, handler: Handler): void => {
      (socket as unknown as Socket).on(event, (payload: unknown, ack?: unknown) => {
        const reply: Reply = typeof ack === 'function' ? (a) => ack(a) : () => undefined;
        guard(
          event,
          () => handler(payload, reply),
          () => badRequest(reply),
        );
      });
    };

    /** For host controls: the room call's failure becomes an `error` event. */
    const report = (result: { error: RoomErrorCode } | { ok: true }): void => {
      if ('error' in result) emitError(result.error);
    };

    // --- room lifecycle ---------------------------------------------------------------

    /** The new seat is secured: only now is the previous binding given up. */
    const enter = (reply: Reply, room: Room, joined: { playerId: string; token: string }): void => {
      unbind(true);
      bind(room, joined.playerId, joined.token);
      reply({ ok: true, code: room.code, playerId: joined.playerId, token: joined.token });
      // The seat's broadcast ran before the socket was bound, so this player gets theirs here.
      socket.emit('room:state', room.info(joined.playerId));
    };

    listen('room:create', (payload, reply) => {
      const parsed = CreateRoomPayloadSchema.safeParse(payload);
      if (!parsed.success) return badRequest(reply);
      const room = manager.create();
      if ('error' in room) return refuse(reply, room.error);
      const joined = room.addHuman(parsed.data.name);
      if ('error' in joined) {
        manager.delete(room.code);
        return refuse(reply, joined.error);
      }
      enter(reply, room, joined);
    });

    listen('room:join', (payload, reply) => {
      const parsed = JoinRoomPayloadSchema.safeParse(payload);
      if (!parsed.success) return badRequest(reply);
      const room = manager.get(parsed.data.code);
      if (!room) return refuse(reply, 'err.roomNotFound');
      const held = bindingOf(socket);
      if (held?.code === room.code) {
        // Already seated here: answer with the existing binding instead of taking a second seat.
        reply({ ok: true, code: room.code, playerId: held.playerId, token: held.token });
        socket.emit('room:state', room.info(held.playerId));
        return;
      }
      const joined = room.addHuman(parsed.data.name);
      if ('error' in joined) return refuse(reply, joined.error);
      enter(reply, room, joined);
    });

    listen('room:rejoin', (payload, reply) => {
      const parsed = RejoinPayloadSchema.safeParse(payload);
      if (!parsed.success) return badRequest(reply);
      const room = manager.get(parsed.data.code);
      const playerId = room?.playerIdForToken(parsed.data.token) ?? null;
      if (!room || playerId === null) return refuse(reply, 'err.roomNotFound');
      const held = bindingOf(socket);
      if (held && (held.code !== room.code || held.playerId !== playerId)) unbind(true);
      // Bind first: Room.rejoin pushes room:state and game:state through the hooks.
      bind(room, playerId, parsed.data.token);
      if (room.rejoin(parsed.data.token) === null) {
        unbind(false);
        return refuse(reply, 'err.roomNotFound');
      }
      reply({ ok: true, code: room.code, playerId, token: parsed.data.token });
    });

    listen('room:leave', () => {
      unbind(true);
    });

    listen('room:settings', (payload, reply) => {
      const parsed = SettingsSchema.safeParse(payload);
      if (!parsed.success) return badRequest(reply);
      inRoom((room, playerId) => report(room.updateSettings(playerId, parsed.data)));
    });

    listen('room:addBot', (payload, reply) => {
      const parsed = AddBotPayloadSchema.safeParse(payload);
      if (!parsed.success) return badRequest(reply);
      inRoom((room, playerId) => report(room.addBot(playerId, parsed.data.level)));
    });

    listen('room:removeBot', (payload, reply) => {
      const parsed = RemoveBotPayloadSchema.safeParse(payload);
      if (!parsed.success) return badRequest(reply);
      inRoom((room, playerId) => report(room.removeBot(playerId, parsed.data.playerId)));
    });

    listen('room:start', () => {
      inRoom((room, playerId) => report(room.start(playerId)));
    });

    listen('room:rematch', () => {
      inRoom((room, playerId) => report(room.rematch(playerId)));
    });

    listen('game:action', (payload, reply) => {
      const parsed = ActionSchema.safeParse(payload);
      if (!parsed.success) return badRequest(reply);
      inRoom((room, playerId) => {
        const result = room.handleAction(playerId, parsed.data);
        if (!result.ok) emitError(result.error);
      });
    });

    // A dropped connection keeps the seat (reload / rejoin); only an explicit leave frees it.
    socket.on('disconnect', () => {
      guard('disconnect', () => unbind(false));
    });
  });
}
