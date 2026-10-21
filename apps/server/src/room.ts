import { randomInt } from 'node:crypto';
import { createGame, type BotLevel, type GameState, type SeatConfig } from '@starhold/engine';
import {
  DEFAULT_ROOM_SETTINGS,
  NicknameSchema,
  SettingsSchema,
  TokenSchema,
  type RoomErrorCode,
  type RoomInfo,
  type RoomPhase,
  type RoomSettings,
  type SeatInfo,
  type ServerToClientEvents,
} from '@starhold/protocol';
import { generatePlayerId, generateToken } from './codes.ts';
import type { Config } from './config.ts';

export interface RoomHooks {
  /** Push the room's current state to everyone in it. */
  broadcast(room: Room): void;
  emitTo(playerId: string, event: keyof ServerToClientEvents, payload: unknown): void;
  /** Every timestamp comes from here so tests control time. */
  now(): number;
}

export type RoomFailure = { error: RoomErrorCode };
export type RoomOk = { ok: true };

export const MAX_SEATS = 4;
const MIN_SEATS_TO_START = 2;
const BOT_NAMES = ['Bot Vega', 'Bot Orion', 'Bot Lyra'] as const;

/**
 * One game room. Lobby state and methods come first; the game half (turn loop,
 * timers, bots acting) attaches to the `game` field below.
 */
export class Room {
  // --- lobby state -------------------------------------------------------
  phase: RoomPhase = 'LOBBY';
  settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };
  hostId = '';
  readonly seats: SeatInfo[] = [];
  private readonly tokens = new Map<string, string>();

  // --- lifecycle bookkeeping ----------------------------------------------
  lastActivity: number;
  /** When the last connected human went away; null while a human is connected. */
  emptySince: number | null;

  // --- game state (driven by the game loop) -------------------------------
  game: GameState | null = null;

  constructor(
    readonly code: string,
    readonly config: Config,
    private readonly hooks: RoomHooks,
  ) {
    const now = hooks.now();
    this.lastActivity = now;
    this.emptySince = now;
  }

  // --- lobby: joining and leaving -----------------------------------------

  addHuman(name: string): { playerId: string; token: string } | RoomFailure {
    if (this.phase !== 'LOBBY') return { error: 'err.gameStarted' };
    if (this.seats.length >= MAX_SEATS) return { error: 'err.roomFull' };
    const nick = NicknameSchema.safeParse(name);
    if (!nick.success) return { error: 'err.badRequest' };
    const playerId = this.freshPlayerId();
    const token = generateToken();
    this.seats.push({
      playerId,
      name: nick.data,
      isBot: false,
      botLevel: null,
      connected: true,
      afk: false,
    });
    this.tokens.set(token, playerId);
    if (this.hostId === '') this.hostId = playerId;
    this.touch();
    return { playerId, token };
  }

  /** Validates the token and marks the player connected again; null if unknown. */
  rejoin(token: string): string | null {
    const playerId = this.playerIdForToken(token);
    const seat = playerId === null ? undefined : this.seat(playerId);
    if (!seat) return null;
    seat.connected = true;
    seat.afk = false;
    this.touch();
    return seat.playerId;
  }

  /** Pure lookup: the player a token belongs to, or null (also for malformed tokens). */
  playerIdForToken(token: string): string | null {
    if (!TokenSchema.safeParse(token).success) return null;
    const playerId = this.tokens.get(token);
    return playerId !== undefined && this.seat(playerId) ? playerId : null;
  }

  markDisconnected(playerId: string): void {
    const seat = this.seat(playerId);
    if (!seat || seat.isBot) return;
    seat.connected = false;
    if (this.phase === 'IN_GAME') seat.afk = true;
    this.touch();
  }

  /** In the lobby the seat is freed; in a game it stays, disconnected and AFK. */
  leave(playerId: string): void {
    const index = this.seats.findIndex((s) => s.playerId === playerId);
    const seat = this.seats[index];
    if (!seat || seat.isBot) return;
    if (this.phase === 'LOBBY') {
      this.seats.splice(index, 1);
      this.dropToken(playerId);
    } else {
      seat.connected = false;
      seat.afk = true;
    }
    if (this.hostId === playerId) this.transferHost(index);
    if (this.phase === 'LOBBY' && !this.seats.some((s) => !s.isBot)) {
      this.seats.length = 0; // bots alone make no room
      this.hostId = '';
    }
    this.touch();
  }

  isEmptyOfHumans(): boolean {
    return !this.seats.some((s) => !s.isBot && s.connected);
  }

  // --- lobby: host controls -----------------------------------------------

  addBot(byPlayerId: string, level: BotLevel): { ok: true; botId: string } | RoomFailure {
    const failure = this.hostLobbyCheck(byPlayerId);
    if (failure) return failure;
    if (this.seats.length >= MAX_SEATS) return { error: 'err.roomFull' };
    const used = new Set(this.seats.map((s) => s.name));
    const name = BOT_NAMES.find((n) => !used.has(n));
    if (!name) return { error: 'err.roomFull' };
    const botId = this.freshPlayerId();
    this.seats.push({
      playerId: botId,
      name,
      isBot: true,
      botLevel: level,
      connected: true,
      afk: false,
    });
    this.touch();
    return { ok: true, botId };
  }

  removeBot(byPlayerId: string, botId: string): RoomOk | RoomFailure {
    const failure = this.hostLobbyCheck(byPlayerId);
    if (failure) return failure;
    const index = this.seats.findIndex((s) => s.playerId === botId && s.isBot);
    if (index < 0) return { error: 'err.badRequest' };
    this.seats.splice(index, 1);
    this.touch();
    return { ok: true };
  }

  /** `settings` is untrusted wire data and is validated here. */
  updateSettings(byPlayerId: string, settings: unknown): RoomOk | RoomFailure {
    const failure = this.hostLobbyCheck(byPlayerId);
    if (failure) return failure;
    const parsed = SettingsSchema.safeParse(settings);
    if (!parsed.success) return { error: 'err.badRequest' };
    this.settings = parsed.data;
    this.touch();
    return { ok: true };
  }

  start(byPlayerId: string): RoomOk | RoomFailure {
    const failure = this.hostLobbyCheck(byPlayerId);
    if (failure) return failure;
    if (this.seats.length < MIN_SEATS_TO_START) return { error: 'err.notEnoughPlayers' };
    const seats: SeatConfig[] = this.seats.map((s) => ({
      id: s.playerId,
      name: s.name,
      isBot: s.isBot,
      botLevel: s.botLevel,
    }));
    this.game = createGame({ seats, targetVp: this.settings.targetVp }, randomInt(0, 2 ** 31));
    this.phase = 'IN_GAME';
    this.touch();
    return { ok: true };
  }

  // --- views --------------------------------------------------------------

  info(forPlayerId: string): RoomInfo {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      seats: this.seats.map((s) => ({ ...s })),
      settings: { ...this.settings },
      you: forPlayerId,
    };
  }

  // --- internals ----------------------------------------------------------

  /** Records a successful mutation: bumps activity, refreshes emptiness, broadcasts. */
  private touch(): void {
    const now = this.hooks.now();
    this.lastActivity = now;
    if (this.isEmptyOfHumans()) this.emptySince ??= now;
    else this.emptySince = null;
    this.hooks.broadcast(this);
  }

  private seat(playerId: string): SeatInfo | undefined {
    return this.seats.find((s) => s.playerId === playerId);
  }

  /** Host-only, lobby-only guard shared by every host control. */
  private hostLobbyCheck(byPlayerId: string): RoomFailure | null {
    if (byPlayerId === '' || byPlayerId !== this.hostId) return { error: 'err.notHost' };
    if (this.phase !== 'LOBBY') return { error: 'err.gameStarted' };
    return null;
  }

  private freshPlayerId(): string {
    let id = generatePlayerId();
    while (this.seat(id)) id = generatePlayerId();
    return id;
  }

  private dropToken(playerId: string): void {
    for (const [token, id] of this.tokens) {
      if (id === playerId) this.tokens.delete(token);
    }
  }

  /**
   * Hands the host role to the next connected human in seat order, starting after
   * `fromIndex` and wrapping. Keeps the current host if nobody else is connected
   * in a running game; in the lobby falls back to any remaining human.
   */
  private transferHost(fromIndex: number): void {
    const n = this.seats.length;
    const inLobby = this.phase === 'LOBBY';
    // In the lobby the leaver's seat is already gone, so the next seat sits at `fromIndex`.
    const start = inLobby ? fromIndex : fromIndex + 1;
    const order = Array.from({ length: n }, (_, k) => this.seats[(start + k) % n]);
    const humans = order.filter((s): s is SeatInfo => !!s && !s.isBot);
    const next = humans.find((s) => s.connected) ?? (inLobby ? humans[0] : undefined);
    if (next) this.hostId = next.playerId;
    else if (inLobby) this.hostId = '';
  }
}
