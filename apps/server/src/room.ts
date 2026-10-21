import { randomInt } from 'node:crypto';
import {
  createGame,
  type Action,
  type BotLevel,
  type ErrorCode,
  type GameState,
  type SeatConfig,
} from '@starhold/engine';
import {
  DEFAULT_ROOM_SETTINGS,
  NicknameSchema,
  SettingsSchema,
  TokenSchema,
  type GameStatePayload,
  type RoomErrorCode,
  type RoomInfo,
  type RoomPhase,
  type RoomSettings,
  type SeatInfo,
  type ServerToClientEvents,
} from '@starhold/protocol';
import { generatePlayerId, generateToken } from './codes.ts';
import type { Config } from './config.ts';
import { GameSession } from './gameSession.ts';

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
 * One game room. Lobby state and methods come first; the game half (turn loop, timers,
 * bots acting) lives in `GameSession`, which this room creates when the game starts.
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
  private session: GameSession | null = null;
  /** Last version used by a finished game session; versions never go back (R14). */
  private versionBase = 0;

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
    // Re-arms timers and pushes the current game:state to the rejoining player (and, if the
    // deadlines changed, to everyone). Callers need not send game state themselves.
    this.session?.resync(seat.playerId);
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
    if (!seat || seat.isBot || !seat.connected) return;
    seat.connected = false;
    if (this.phase === 'IN_GAME') seat.afk = true;
    // A host who drops hands the role on at once, in any phase, so a rematch is never blocked.
    // The seat stays, so the search starts after it; the old host does not get the role back.
    if (this.hostId === playerId && !this.isEmptyOfHumans()) {
      this.transferHost(this.seats.indexOf(seat) + 1);
    }
    this.session?.schedule();
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
    if (this.hostId === playerId) this.transferHost(this.phase === 'LOBBY' ? index : index + 1);
    if (this.phase === 'LOBBY' && !this.seats.some((s) => !s.isBot)) {
      this.seats.length = 0; // bots alone make no room
      this.hostId = '';
    }
    this.session?.schedule();
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
    for (const s of this.seats) if (!s.isBot && !s.connected) s.afk = true;
    this.game = createGame({ seats, targetVp: this.settings.targetVp }, randomInt(0, 2 ** 31));
    this.phase = 'IN_GAME';
    this.session = new GameSession(
      this,
      this.config,
      this.hooks,
      () => this.touch(),
      this.versionBase + 1,
    );
    this.touch();
    this.session.begin();
    return { ok: true };
  }

  // --- game: delegated to the session --------------------------------------

  /**
   * 1 at the first game's start, +1 per successful action or pushed deadline change. It keeps
   * counting across rematches (clients ignore versions <= the one they hold); 0 before any game.
   */
  get version(): number {
    return this.session?.version ?? this.versionBase;
  }

  handleAction(playerId: string, action: Action): RoomOk | { ok: false; error: ErrorCode } {
    if (!this.session) return { ok: false, error: 'err.wrongPhase' };
    return this.session.handleAction(playerId, action);
  }

  /** Re-arms the turn, discard and bot timers for the current state. */
  schedule(): void {
    this.session?.schedule();
  }

  stateFor(playerId: string): GameStatePayload {
    if (!this.session) throw new Error('no game in progress');
    return this.session.stateFor(playerId);
  }

  /** Host only: a finished game goes back to the lobby with the connected seats. */
  rematch(byPlayerId: string): RoomOk | RoomFailure {
    if (byPlayerId === '' || byPlayerId !== this.hostId) return { error: 'err.notHost' };
    if (this.phase !== 'FINISHED') return { error: 'err.badRequest' };
    this.dispose();
    this.game = null;
    this.phase = 'LOBBY';
    for (const seat of [...this.seats]) {
      if (seat.isBot) continue;
      if (seat.connected) seat.afk = false;
      else this.removeSeat(seat.playerId);
    }
    if (!this.seats.some((s) => !s.isBot)) {
      this.seats.length = 0;
      this.hostId = '';
    }
    this.touch();
    return { ok: true };
  }

  /** Stops every timer; the room must not be used for a game afterwards. */
  dispose(): void {
    if (this.session) this.versionBase = this.session.version;
    this.session?.dispose();
    this.session = null;
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

  private removeSeat(playerId: string): void {
    const index = this.seats.findIndex((s) => s.playerId === playerId);
    if (index < 0) return;
    this.seats.splice(index, 1);
    this.dropToken(playerId);
    if (this.hostId === playerId) this.transferHost(index);
  }

  private dropToken(playerId: string): void {
    for (const [token, id] of this.tokens) {
      if (id === playerId) this.tokens.delete(token);
    }
  }

  /**
   * Hands the host role to the next connected human in seat order, starting at seat index
   * `start` and wrapping (callers pass the first seat after the old host: its own index once
   * the seat is gone, index + 1 while it stays). Keeps the current host if nobody else is
   * connected; in the lobby falls back to any remaining human.
   */
  private transferHost(start: number): void {
    const n = this.seats.length;
    const inLobby = this.phase === 'LOBBY';
    const order = Array.from({ length: n }, (_, k) => this.seats[(start + k) % n]);
    const humans = order.filter((s): s is SeatInfo => !!s && !s.isBot);
    const next = humans.find((s) => s.connected) ?? (inLobby ? humans[0] : undefined);
    if (next) this.hostId = next.playerId;
    else if (inLobby) this.hostId = '';
  }
}
