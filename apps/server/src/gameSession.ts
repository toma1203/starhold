import {
  applyAction,
  filterEventsFor,
  legalActions,
  randomDiscard,
  viewFor,
  type Action,
  type ErrorCode,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@starhold/engine';
import type {
  GameStatePayload,
  RoomPhase,
  RoomSettings,
  SeatInfo,
  ServerToClientEvents,
} from '@starhold/protocol';
import { botCandidates, errorText } from './botMoves.ts';
import type { Config } from './config.ts';
import { log } from './log.ts';
import { DeadlineTimer } from './turnClock.ts';

/** The part of a Room the game loop reads and writes. */
export interface SessionHost {
  readonly code: string;
  game: GameState | null;
  phase: RoomPhase;
  readonly seats: readonly SeatInfo[];
  readonly settings: RoomSettings;
}

export interface SessionHooks {
  emitTo(playerId: string, event: keyof ServerToClientEvents, payload: unknown): void;
  now(): number;
}

export type ActionOutcome = { ok: true } | { ok: false; error: ErrorCode };
type Applied = { ok: true; events: GameEvent[] } | { ok: false; error: ErrorCode };
type Timer = ReturnType<typeof setTimeout>;

/** Consecutive turn timeouts after which a human is marked AFK. */
const AFK_AFTER_TIMEOUTS = 2;

/**
 * The authoritative game loop of one room: applies actions, versions the state, pushes
 * per-player views, and drives bots, AFK humans and the turn / discard timers.
 *
 * At most three timers exist at any time (turn, discard, bot). `schedule()` is the single
 * place that re-arms them after every state change.
 */
export class GameSession {
  /** Bumped by every successful action and by every pushed deadline change. */
  version: number;

  private finished = false;
  /** `round:current` of the turn the timers belong to. */
  private turnKey: string | null = null;
  /** The turn timer expired: bots play out the rest of this turn for the human. */
  private takeover = false;
  private readonly turn: DeadlineTimer;
  /** Turn time left while DISCARD has the turn timer paused. */
  private pausedRemaining: number | null = null;
  private readonly discard: DeadlineTimer;
  private botTimer: Timer | undefined;
  private readonly timeouts = new Map<PlayerId, number>();

  constructor(
    private readonly host: SessionHost,
    private readonly config: Config,
    private readonly hooks: SessionHooks,
    /** Room-level change (AFK flag, finish): bumps activity and broadcasts room state. */
    private readonly onRoomChange: () => void,
    /** The first version of this game; the room keeps versions increasing across rematches. */
    startVersion: number,
  ) {
    this.version = startVersion;
    this.turn = new DeadlineTimer(() => hooks.now());
    this.discard = new DeadlineTimer(() => hooks.now());
  }

  /** Sends the opening state to every connected human and starts the timers. */
  begin(): void {
    this.schedule(false);
    this.emitStates([]);
  }

  /** After a (re)connect: re-arm the timers and make sure `playerId` holds the current state. */
  resync(playerId: PlayerId): void {
    if (!this.schedule() && this.host.game) {
      this.hooks.emitTo(playerId, 'game:state', this.stateFor(playerId));
    }
  }

  /** A human's action. On success: version++, views go out, their timeout streak and AFK clear. */
  handleAction(playerId: PlayerId, action: Action): ActionOutcome {
    const state = this.host.game;
    // After a turn timeout the bot owns the rest of the turn: the human cannot interleave.
    if (
      state &&
      this.takeover &&
      state.phase !== 'DISCARD' &&
      state.players[state.current]?.id === playerId
    ) {
      return { ok: false, error: 'err.notYourTurn' };
    }
    const applied = this.apply(playerId, action);
    if (!applied.ok) return applied;
    this.timeouts.delete(playerId);
    const seat = this.seat(playerId);
    if (seat?.afk) {
      this.setAfk(seat, false);
    }
    this.publish(applied.events);
    return { ok: true };
  }

  stateFor(playerId: PlayerId): GameStatePayload {
    const state = this.requireState();
    return {
      version: this.version,
      view: viewFor(state, playerId),
      turnDeadline: this.turn.deadline,
      discardDeadline: this.discard.deadline,
    };
  }

  dispose(): void {
    this.turn.clear();
    this.discard.clear();
    clearTimeout(this.botTimer);
    this.botTimer = undefined;
  }

  /**
   * Re-arms every timer for the current state. Safe to call at any time. If a deadline
   * changed (and `push` is true, i.e. no state is about to be published anyway), every
   * connected human gets a fresh `game:state` with a bumped version. Returns whether it did.
   */
  schedule(push = true): boolean {
    clearTimeout(this.botTimer);
    this.botTimer = undefined;
    const state = this.host.game;
    if (!state || this.finished) return false;
    if (state.phase === 'FINISHED') {
      this.finish();
      return false;
    }
    const before = `${this.turn.deadline}|${this.discard.deadline}`;
    this.updateTurnTimer(state);
    this.updateDiscardTimer(state);
    this.armBot(state);
    if (!push || before === `${this.turn.deadline}|${this.discard.deadline}`) return false;
    this.version += 1;
    this.emitStates([]);
    return true;
  }

  // --- who controls a seat -------------------------------------------------

  private seat(playerId: PlayerId): SeatInfo | undefined {
    return this.host.seats.find((s) => s.playerId === playerId);
  }

  private botControlled(playerId: PlayerId): boolean {
    const seat = this.seat(playerId);
    return !seat || seat.isBot || seat.afk || !seat.connected;
  }

  private levelOf(playerId: PlayerId) {
    return this.seat(playerId)?.botLevel ?? 'normal';
  }

  private setAfk(seat: SeatInfo, afk: boolean): void {
    seat.afk = afk;
    this.onRoomChange();
  }

  // --- applying actions -----------------------------------------------------

  private requireState(): GameState {
    if (!this.host.game) throw new Error('no game in progress');
    return this.host.game;
  }

  private apply(playerId: PlayerId, action: Action): Applied {
    const state = this.host.game;
    if (!state || this.finished) return { ok: false, error: 'err.gameOver' };
    const result = applyAction(state, playerId, action);
    if (!result.ok) return result;
    this.host.game = result.state;
    this.version += 1;
    return { ok: true, events: result.events };
  }

  /** After a successful apply: re-arm the timers first so the payloads carry fresh deadlines. */
  private publish(events: GameEvent[]): void {
    this.schedule(false);
    this.emitStates(events);
  }

  private emitStates(events: GameEvent[]): void {
    if (!this.host.game) return;
    for (const seat of this.host.seats) {
      if (seat.isBot || !seat.connected) continue;
      this.hooks.emitTo(seat.playerId, 'game:state', this.stateFor(seat.playerId));
      if (events.length > 0) {
        this.hooks.emitTo(seat.playerId, 'game:events', filterEventsFor(events, seat.playerId));
      }
    }
  }

  private finish(): void {
    this.finished = true;
    this.dispose();
    this.host.phase = 'FINISHED';
    this.onRoomChange();
  }

  // --- timers -----------------------------------------------------------------

  private turnMs(): number {
    const override = this.config.turnSecondsOverride;
    const seconds = override !== null && override > 0 ? override : this.host.settings.turnSeconds;
    return seconds * 1000;
  }

  private botDelay(): number {
    const [min, max] = this.config.botDelayMs;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  /** Timer callbacks must never throw: a failure is logged and the loop is re-armed. */
  private guarded(label: string, fn: () => void): () => void {
    return () => {
      try {
        fn();
      } catch (error) {
        log.warn(`${label} failed`, { room: this.host.code, error: errorText(error) });
        try {
          this.schedule();
        } catch {
          // nothing more can be done; the next action or reconnect re-arms the loop
        }
      }
    };
  }

  private setTurnDeadline(deadline: number | null): void {
    this.turn.set(
      deadline,
      this.guarded('turn timer', () => this.onTurnExpired()),
    );
  }

  /**
   * The turn deadline is fixed per turn: set once when the turn starts for a human who can
   * act, paused while DISCARD is open, and never moved by the human's own actions.
   */
  private updateTurnTimer(state: GameState): void {
    const key = `${state.round}:${state.current}`;
    if (key !== this.turnKey) {
      this.turnKey = key;
      this.takeover = false;
      this.pausedRemaining = null;
      this.setTurnDeadline(null);
    }
    const current = state.players[state.current];
    const humanTurn = !!current && !this.takeover && !this.botControlled(current.id);
    if (!humanTurn) {
      this.pausedRemaining = null;
      this.setTurnDeadline(null);
      return;
    }
    const now = this.hooks.now();
    if (state.phase === 'DISCARD') {
      if (this.turn.deadline !== null) {
        this.pausedRemaining = Math.max(0, this.turn.deadline - now);
        this.setTurnDeadline(null);
      }
    } else if (this.pausedRemaining !== null) {
      const remaining = this.pausedRemaining;
      this.pausedRemaining = null;
      this.setTurnDeadline(now + remaining);
    } else if (this.turn.deadline === null) {
      this.setTurnDeadline(now + this.turnMs());
    }
  }

  private onTurnExpired(): void {
    this.turn.fired();
    const state = this.host.game;
    const current = state?.players[state.current];
    if (!current || this.finished) return;
    const seat = this.seat(current.id);
    if (seat && !this.botControlled(current.id)) {
      const streak = (this.timeouts.get(current.id) ?? 0) + 1;
      this.timeouts.set(current.id, streak);
      this.takeover = true;
      if (streak >= AFK_AFTER_TIMEOUTS) this.setAfk(seat, true);
    }
    this.schedule();
  }

  private pendingHumanDiscarders(state: GameState): PlayerId[] {
    if (state.phase !== 'DISCARD') return [];
    return Object.keys(state.pendingDiscards).filter(
      (id) => (state.pendingDiscards[id] ?? 0) > 0 && !this.botControlled(id),
    );
  }

  private setDiscardDeadline(deadline: number | null): void {
    this.discard.set(
      deadline,
      this.guarded('discard timer', () => this.onDiscardExpired()),
    );
  }

  private updateDiscardTimer(state: GameState): void {
    if (this.pendingHumanDiscarders(state).length === 0) {
      this.setDiscardDeadline(null);
    } else if (this.discard.deadline === null) {
      this.setDiscardDeadline(this.hooks.now() + this.config.discardSeconds * 1000);
    }
  }

  /** Connected humans who did not choose in time get a random discard. */
  private onDiscardExpired(): void {
    this.discard.fired();
    this.setDiscardDeadline(null); // payloads published below never carry the expired deadline
    for (const id of this.pendingHumanDiscarders(this.requireState())) {
      const state = this.requireState();
      if ((state.pendingDiscards[id] ?? 0) <= 0) continue;
      const applied = this.apply(id, randomDiscard(state, id));
      if (applied.ok) this.publish(applied.events);
      else log.warn('random discard rejected', { room: this.host.code, error: applied.error });
    }
    this.schedule();
  }

  // --- bots ---------------------------------------------------------------------

  /** Seats a bot must act for right now, in priority order. */
  private botActors(state: GameState): PlayerId[] {
    if (state.phase === 'DISCARD') {
      return Object.keys(state.pendingDiscards).filter(
        (id) => (state.pendingDiscards[id] ?? 0) > 0 && this.botControlled(id),
      );
    }
    const current = state.players[state.current];
    const actors: PlayerId[] = [];
    if (state.offer) {
      for (const p of state.players) {
        if (p.id === current?.id || !this.botControlled(p.id)) continue;
        if (legalActions(state, p.id).some((a) => a.type === 'respondTrade')) actors.push(p.id);
      }
    }
    if (current && (this.takeover || this.botControlled(current.id))) actors.push(current.id);
    return actors;
  }

  private armBot(state: GameState): void {
    if (this.botActors(state).length === 0) return;
    this.botTimer = setTimeout(
      this.guarded('bot move', () => this.botStep()),
      this.botDelay(),
    );
  }

  /** One bot action per timer firing; `publish` then re-arms for the next one. */
  private botStep(): void {
    this.botTimer = undefined;
    const state = this.host.game;
    if (!state || this.finished) return;
    for (const id of this.botActors(state)) {
      if (this.tryBotMoves(state, id)) return;
    }
    log.warn('no bot move could be applied', { room: this.host.code });
    this.schedule(); // try again rather than leave the loop silent
  }

  private tryBotMoves(state: GameState, id: PlayerId): boolean {
    const room = this.host.code;
    const warn = (message: string) => log.warn(message, { room });
    for (const action of botCandidates(state, id, this.levelOf(id), warn)) {
      let applied: Applied;
      try {
        applied = this.apply(id, action);
      } catch (error) {
        log.warn('bot action threw', { room, action: action.type, error: errorText(error) });
        continue;
      }
      if (applied.ok) {
        this.publish(applied.events);
        return true;
      }
      log.warn('bot action rejected', { room, action: action.type, error: applied.error });
    }
    return false;
  }
}
