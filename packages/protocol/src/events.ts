import type { Action, BotLevel, ErrorCode, GameEvent, PlayerView } from '@starhold/engine';
import type { RoomSettings } from './schemas.ts';

export const ROOM_ERROR_CODES = [
  'err.roomNotFound',
  'err.roomFull',
  'err.gameStarted',
  'err.notHost',
  'err.badRequest',
  'err.rateLimited',
  'err.serverFull',
  'err.notEnoughPlayers',
] as const;

export type RoomErrorCode = (typeof ROOM_ERROR_CODES)[number];

/** Why a `room:closed` was sent: swept, server stopping, or this seat was taken by a newer socket. */
export const ROOM_CLOSED_REASONS = ['expired', 'serverRestart', 'replaced'] as const;
export type RoomClosedReason = (typeof ROOM_CLOSED_REASONS)[number];

export type RoomPhase = 'LOBBY' | 'IN_GAME' | 'FINISHED';

export interface SeatInfo {
  playerId: string;
  name: string;
  isBot: boolean;
  botLevel: BotLevel | null;
  connected: boolean;
  afk: boolean;
}

export interface RoomInfo {
  code: string;
  phase: RoomPhase;
  hostId: string;
  seats: SeatInfo[];
  settings: RoomSettings;
  /** The receiving player's own id. */
  you: string;
}

export interface GameStatePayload {
  version: number;
  view: PlayerView;
  turnDeadline: number | null;
  discardDeadline: number | null;
}

export type ServerError = { code: ErrorCode | RoomErrorCode };

export type JoinAck =
  { ok: true; code: string; playerId: string; token: string } | { ok: false; error: RoomErrorCode };

export interface ClientToServerEvents {
  'room:create': (p: { name: string }, ack: (r: JoinAck) => void) => void;
  'room:join': (p: { code: string; name: string }, ack: (r: JoinAck) => void) => void;
  'room:rejoin': (p: { code: string; token: string }, ack: (r: JoinAck) => void) => void;
  'room:leave': () => void;
  'room:settings': (p: RoomSettings) => void;
  'room:addBot': (p: { level: BotLevel }) => void;
  'room:removeBot': (p: { playerId: string }) => void;
  'room:start': () => void;
  'room:rematch': () => void;
  'game:action': (p: Action) => void;
}

export interface ServerToClientEvents {
  'room:state': (r: RoomInfo) => void;
  'game:state': (g: GameStatePayload) => void;
  'game:events': (e: GameEvent[]) => void;
  error: (e: ServerError) => void;
  'room:closed': (p: { reason: RoomClosedReason }) => void;
}
