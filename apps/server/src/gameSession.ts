import { decide } from '@starhold/bots';
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
import type { Config } from './config.ts';

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
  version = 1;

  private finished = false;
  /** `round:current` of the turn the timers belong to. */
  private turnKey: string | null = null;
  /** The turn timer expired: bots play out the rest of this turn for the human. */
  private takeover = false;
  private turnDeadline: number | null = null;
  /** Turn time left while DISCARD has the turn timer paused. */
  private pausedRemaining: number | null = null;
  private discardDeadline: number | null = null;
  private turnTimer: Timer | undefined;
  private discardTimer: Timer | undefined;
  private botTimer: Timer | undefined;
  private readonly timeouts = new Map<PlayerId, number>();

  constructor(
    private readonly host: SessionHost,
    private readonly config: Config,
    private readonly hooks: SessionHooks,
    /** Room-level change (AFK flag, finish): bumps activity and broadcasts room state. */
    private readonly onRoomChange: () => void,
  ) {}

  /** Sends the opening state to every connected human and starts the timers. */
  begin(): void {
    this.schedule();
    this.emitStates([]);
  }

  /** A human's action. On success: version++, views go out, their timeout streak and AFK clear. */
  handleAction(playerId: PlayerId, action: Action): ActionOutcome {
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
      turnDeadline: this.turnDeadline,
      discardDeadline: this.discardDeadline,
    };
  }

  dispose(): void {
    this.clearTimer('turnTimer');
    this.clearTimer('discardTimer');
    this.clearTimer('botTimer');
  }

  /** Re-arms every timer for the current state. Safe to call at any time. */
  schedule(): void {
    this.clearTimer('botTimer');
    const state = this.host.game;
    if (!state || this.finished) return;
    if (state.phase === 'FINISHED') {
      this.finish();
      return;
    }
    this.updateTurnTimer(state);
    this.updateDiscardTimer(state);
    this.armBot(state);
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
    this.schedule();
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
    this.turnDeadline = null;
    this.discardDeadline = null;
    this.host.phase = 'FINISHED';
    this.onRoomChange();
  }

  // --- timers -----------------------------------------------------------------

  private clearTimer(name: 'turnTimer' | 'discardTimer' | 'botTimer'): void {
    clearTimeout(this[name]);
    this[name] = undefined;
  }

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
        console.warn(`[room ${this.host.code}] ${label} failed: ${errorText(error)}`);
        try {
          this.schedule();
        } catch {
          // nothing more can be done; the next action or reconnect re-arms the loop
        }
      }
    };
  }

  private setTurnDeadline(deadline: number | null): void {
    this.clearTimer('turnTimer');
    this.turnDeadline = deadline;
    if (deadline === null) return;
    const delay = Math.max(0, deadline - this.hooks.now());
    this.turnTimer = setTimeout(
      this.guarded('turn timer', () => this.onTurnExpired()),
      delay,
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
      if (this.turnDeadline !== null) {
        this.pausedRemaining = Math.max(0, this.turnDeadline - now);
        this.setTurnDeadline(null);
      }
    } else if (this.pausedRemaining !== null) {
      const remaining = this.pausedRemaining;
      this.pausedRemaining = null;
      this.setTurnDeadline(now + remaining);
    } else if (this.turnDeadline === null) {
      this.setTurnDeadline(now + this.turnMs());
    }
  }

  private onTurnExpired(): void {
    this.turnTimer = undefined;
    this.turnDeadline = null;
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
    this.clearTimer('discardTimer');
    this.discardDeadline = deadline;
    if (deadline === null) return;
    const delay = Math.max(0, deadline - this.hooks.now());
    this.discardTimer = setTimeout(
      this.guarded('discard timer', () => this.onDiscardExpired()),
      delay,
    );
  }

  private updateDiscardTimer(state: GameState): void {
    if (this.pendingHumanDiscarders(state).length === 0) {
      this.setDiscardDeadline(null);
    } else if (this.discardDeadline === null) {
      this.setDiscardDeadline(this.hooks.now() + this.config.discardSeconds * 1000);
    }
  }

  /** Connected humans who did not choose in time get a random discard. */
  private onDiscardExpired(): void {
    this.discardTimer = undefined;
    for (const id of this.pendingHumanDiscarders(this.requireState())) {
      const state = this.requireState();
      if ((state.pendingDiscards[id] ?? 0) <= 0) continue;
      const applied = this.apply(id, randomDiscard(state, id));
      if (applied.ok) this.publish(applied.events);
      else console.warn(`[room ${this.host.code}] random discard rejected: ${applied.error}`);
    }
    this.discardDeadline = null;
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
    console.warn(`[room ${this.host.code}] no bot move could be applied`);
  }

  private tryBotMoves(state: GameState, id: PlayerId): boolean {
    for (const action of this.botCandidates(state, id)) {
      const applied = this.apply(id, action);
      if (applied.ok) {
        this.publish(applied.events);
        return true;
      }
      console.warn(`[room ${this.host.code}] bot action ${action.type} rejected: ${applied.error}`);
    }
    return false;
  }

  /** The AI's choice first, then safe fallbacks (lazily, so a good choice costs nothing extra). */
  private *botCandidates(state: GameState, id: PlayerId): Generator<Action> {
    try {
      const chosen = decide(viewFor(state, id), id, this.levelOf(id), Math.random);
      if (chosen) yield chosen;
    } catch (error) {
      console.warn(`[room ${this.host.code}] bot decision failed: ${errorText(error)}`);
    }
    if (state.phase === 'DISCARD') {
      yield randomDiscard(state, id);
      return;
    }
    const isCurrent = state.players[state.current]?.id === id;
    if (state.offer && !isCurrent) {
      yield { type: 'respondTrade', accept: false };
      return;
    }
    const legal = legalActions(state, id);
    if (legal.some((a) => a.type === 'endTurn')) yield { type: 'endTurn' };
    yield* legal;
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ');
}
