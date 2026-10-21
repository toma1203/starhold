import {
  clone,
  type Action,
  type BotLevel,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@starhold/engine';
import type { GameStatePayload } from '@starhold/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config.ts';
import { Room } from '../src/room.ts';
import { RoomManager } from '../src/roomManager.ts';
import { makeHooks, testConfig, type TestHooks } from './helpers.ts';

/** Lets a test replace what the bot AI decides; `real` runs the genuine `decide`. */
const botMock = vi.hoisted(() => ({
  override: null as null | ((real: () => Action | null) => Action | null),
}));
vi.mock('@starhold/bots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@starhold/bots')>();
  return {
    ...actual,
    decide: (...args: Parameters<typeof actual.decide>) =>
      botMock.override ? botMock.override(() => actual.decide(...args)) : actual.decide(...args),
  };
});

interface Rig {
  room: Room;
  hooks: TestHooks;
  humans: PlayerId[];
  bots: PlayerId[];
  tokens: Record<PlayerId, string>;
}

function rig(opts: {
  humans: number;
  bots?: BotLevel[];
  config?: Partial<Config>;
  start?: boolean;
}): Rig {
  const hooks = makeHooks();
  hooks.now = () => Date.now();
  const config = testConfig({ botDelayMs: [10, 10], discardSeconds: 1, ...opts.config });
  const room = new Room('ABCDE', config, hooks);
  const humans: PlayerId[] = [];
  const tokens: Record<PlayerId, string> = {};
  for (let i = 0; i < opts.humans; i++) {
    const r = room.addHuman(`Human${i}`);
    if ('error' in r) throw new Error(r.error);
    humans.push(r.playerId);
    tokens[r.playerId] = r.token;
  }
  const host = humans[0] as string;
  const bots: PlayerId[] = [];
  for (const level of opts.bots ?? []) {
    const r = room.addBot(host, level);
    if ('error' in r) throw new Error(r.error);
    bots.push(r.botId);
  }
  if (opts.start !== false) {
    const started = room.start(host);
    if ('error' in started) throw new Error(started.error);
  }
  return { room, hooks, humans, bots, tokens };
}

function game(room: Room): GameState {
  if (!room.game) throw new Error('no game');
  return room.game;
}

function currentId(room: Room): PlayerId {
  const g = game(room);
  return (g.players[g.current] as { id: PlayerId }).id;
}

/** Edits a copy of the game state, installs it and re-arms the loop. */
function patch(room: Room, edit: (g: GameState) => void): void {
  const g = clone(game(room));
  edit(g);
  room.game = g;
  room.schedule();
}

function makeCurrent(room: Room, id: PlayerId, phase: GameState['phase'] = 'MAIN'): void {
  patch(room, (g) => {
    g.current = g.players.findIndex((p) => p.id === id);
    g.phase = phase;
    g.offer = null;
  });
}

/** Everyone in `pending` holds 10 cards and owes the given number. */
function startDiscard(room: Room, pending: Record<PlayerId, number>): void {
  patch(room, (g) => {
    g.phase = 'DISCARD';
    g.pendingDiscards = { ...pending };
    for (const id of Object.keys(pending)) {
      const p = g.players.find((q) => q.id === id);
      if (p) p.resources = { metal: 4, energy: 3, crystal: 3, biomass: 0 };
    }
  });
}

function advanceUntil(cond: () => boolean, stepMs = 10, maxSteps = 5000): void {
  for (let i = 0; i < maxSteps && !cond(); i++) vi.advanceTimersByTime(stepMs);
  if (!cond()) throw new Error('condition never became true');
}

function payloads(hooks: TestHooks, playerId: PlayerId, event: string): unknown[] {
  return hooks.emitted
    .filter((e) => e.playerId === playerId && e.event === event)
    .map((e) => e.payload);
}

function seatOf(room: Room, id: PlayerId) {
  const seat = room.seats.find((s) => s.playerId === id);
  if (!seat) throw new Error('no seat');
  return seat;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  botMock.override = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Room game loop: actions and versions', () => {
  it('starts at version 1 and sends every human their own game:state', () => {
    const { room, hooks, humans } = rig({ humans: 2 });
    expect(room.version).toBe(1);
    for (const id of humans) {
      const states = payloads(hooks, id, 'game:state') as GameStatePayload[];
      expect(states).toHaveLength(1);
      expect(states[0]?.version).toBe(1);
      expect(states[0]?.view.me).toBe(id);
    }
  });

  it('rejects out-of-turn action without bumping version', () => {
    const { room, hooks, humans } = rig({ humans: 2 });
    const other = humans.find((id) => id !== currentId(room)) as string;
    const emittedBefore = hooks.emitted.length;
    expect(room.handleAction(other, { type: 'chooseHomeBonus', resource: 'metal' })).toEqual({
      ok: false,
      error: 'err.notYourTurn',
    });
    expect(room.version).toBe(1);
    expect(hooks.emitted).toHaveLength(emittedBefore);
  });

  it('rejects actions before a game exists', () => {
    const { room, humans } = rig({ humans: 2, start: false });
    expect(room.handleAction(humans[0] as string, { type: 'roll' })).toEqual({
      ok: false,
      error: 'err.wrongPhase',
    });
  });

  it('successful action increments version and broadcasts filtered state to each player', () => {
    const { room, hooks, humans } = rig({ humans: 2 });
    const actor = currentId(room);
    const other = humans.find((id) => id !== actor) as string;
    const deadlineBefore = room.stateFor(actor).turnDeadline;
    expect(deadlineBefore).not.toBeNull();

    expect(room.handleAction(actor, { type: 'chooseHomeBonus', resource: 'metal' })).toEqual({
      ok: true,
    });
    expect(room.version).toBe(2);

    const forOther = payloads(hooks, other, 'game:state').at(-1) as GameStatePayload;
    expect(forOther.version).toBe(2);
    expect(forOther.view.players.find((p) => p.id === actor)?.resources).toBeNull();
    expect(forOther.view.players.find((p) => p.id === other)?.resources).not.toBeNull();
    const forActor = payloads(hooks, actor, 'game:state').at(-1) as GameStatePayload;
    expect(forActor.view.players.find((p) => p.id === actor)?.resources).not.toBeNull();
    // the human's own action never extends the turn deadline
    expect(forActor.turnDeadline).toBe(deadlineBefore);
    expect(forActor.discardDeadline).toBeNull();

    const events = payloads(hooks, other, 'game:events').at(-1) as GameEvent[];
    expect(events.some((e) => e.type === 'homeBonus')).toBe(true);
  });

  it('does not emit to bots or to disconnected humans', () => {
    const { room, hooks, humans, bots } = rig({ humans: 2, bots: ['normal'] });
    const [a, b] = humans as [string, string];
    room.markDisconnected(b);
    makeCurrent(room, a, 'HOME_BONUS');
    const before = hooks.emitted.length;
    room.handleAction(a, { type: 'chooseHomeBonus', resource: 'metal' });
    const fresh = hooks.emitted.slice(before);
    expect(fresh.map((e) => e.playerId)).not.toContain(b);
    expect(fresh.map((e) => e.playerId)).not.toContain(bots[0]);
    expect(fresh.map((e) => e.playerId)).toContain(a);
  });
});

describe('Room game loop: bots', () => {
  it('bot seat acts automatically after bot delay', () => {
    const { room, bots } = rig({ humans: 1, bots: ['normal'] });
    makeCurrent(room, bots[0] as string, 'HOME_BONUS');
    const before = room.version;
    vi.advanceTimersByTime(9);
    expect(room.version).toBe(before);
    vi.advanceTimersByTime(1);
    expect(room.version).toBe(before + 1);
    expect(game(room).phase).toBe('ROLL');
  });

  it('one bot action per timer firing', () => {
    const { room, bots } = rig({ humans: 1, bots: ['normal'] });
    makeCurrent(room, bots[0] as string, 'HOME_BONUS');
    const before = room.version;
    vi.advanceTimersByTime(10);
    expect(room.version).toBe(before + 1);
    vi.advanceTimersByTime(5);
    expect(room.version).toBe(before + 1);
    vi.advanceTimersByTime(5);
    expect(room.version).toBe(before + 2);
  });

  it('bot responder answers an open trade offer', () => {
    const { room, humans, bots } = rig({ humans: 1, bots: ['normal'] });
    const human = humans[0] as string;
    makeCurrent(room, human, 'MAIN');
    const offer: Action = {
      type: 'offerTrade',
      give: { metal: 1, energy: 0, crystal: 0, biomass: 0 },
      want: { metal: 0, energy: 0, crystal: 1, biomass: 0 },
    };
    expect(room.handleAction(human, offer)).toEqual({ ok: true });
    expect(game(room).offer?.accepted).toEqual([]);
    vi.advanceTimersByTime(10);
    const o = game(room).offer;
    expect([...(o?.accepted ?? []), ...(o?.declined ?? [])]).toContain(bots[0]);
  });

  it('bot throwing falls back to endTurn and loop continues', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { room, humans, bots } = rig({ humans: 1, bots: ['normal'] });
    const bot = bots[0] as string;
    makeCurrent(room, bot, 'MAIN');
    let calls = 0;
    botMock.override = (real) => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return real();
    };
    const before = room.version;
    vi.advanceTimersByTime(10);
    expect(room.version).toBe(before + 1);
    expect(currentId(room)).toBe(humans[0]); // endTurn
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).not.toContain('\n');
    expect(line).not.toContain('Human0');

    makeCurrent(room, bot, 'HOME_BONUS');
    const mid = room.version;
    vi.advanceTimersByTime(10);
    expect(room.version).toBe(mid + 1);
    expect(game(room).phase).toBe('ROLL');
  });

  it('a rejected bot action falls back to endTurn too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { room, humans, bots } = rig({ humans: 1, bots: ['normal'] });
    makeCurrent(room, bots[0] as string, 'MAIN');
    botMock.override = () => ({ type: 'roll' }); // wrong phase in MAIN
    vi.advanceTimersByTime(10);
    expect(currentId(room)).toBe(humans[0]);
    expect(warn).toHaveBeenCalled();
  });

  it('a throwing bot in DISCARD falls back to a random discard', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { room, humans, bots } = rig({ humans: 1, bots: ['normal'] });
    makeCurrent(room, humans[0] as string, 'MAIN');
    startDiscard(room, { [bots[0] as string]: 5 });
    botMock.override = () => {
      throw new Error('boom');
    };
    vi.advanceTimersByTime(10);
    expect(game(room).phase).toBe('PIRATE');
  });
});

describe('Room game loop: turn timer and AFK', () => {
  const config = { turnSecondsOverride: 5 };

  it('human turn timeout makes bot finish the turn and second timeout marks AFK', () => {
    const { room, hooks, humans } = rig({ humans: 1, bots: ['normal'], config });
    const human = humans[0] as string;
    makeCurrent(room, human, 'MAIN');
    expect(room.stateFor(human).turnDeadline).toBe(Date.now() + 5000);

    vi.advanceTimersByTime(4999);
    expect(currentId(room)).toBe(human);
    vi.advanceTimersByTime(1);
    expect(room.stateFor(human).turnDeadline).toBeNull(); // the bot has taken the turn
    advanceUntil(() => currentId(room) !== human);
    expect(seatOf(room, human).afk).toBe(false); // first expiry only

    advanceUntil(() => currentId(room) === human);
    const deadline = room.stateFor(human).turnDeadline as number;
    expect(deadline).toBeGreaterThan(Date.now());
    const broadcastsBefore = hooks.broadcasts;
    vi.advanceTimersByTime(deadline - Date.now());
    expect(seatOf(room, human).afk).toBe(true);
    expect(hooks.broadcasts).toBeGreaterThan(broadcastsBefore); // clients see the AFK marker
    advanceUntil(() => currentId(room) !== human);
  });

  it('a successful action resets the consecutive-timeout counter', () => {
    const { room, humans } = rig({ humans: 1, bots: ['normal'], config });
    const human = humans[0] as string;
    makeCurrent(room, human, 'MAIN');
    vi.advanceTimersByTime(5000);
    advanceUntil(() => currentId(room) !== human);
    advanceUntil(() => currentId(room) === human);
    expect(game(room).phase).toBe('HOME_BONUS');
    expect(room.handleAction(human, { type: 'chooseHomeBonus', resource: 'metal' })).toEqual({
      ok: true,
    });
    vi.advanceTimersByTime(5000); // second expiry, but the counter was reset
    expect(seatOf(room, human).afk).toBe(false);
  });

  it('AFK player is un-AFKed by any action', () => {
    const { room, hooks } = rig({ humans: 2 });
    const actor = currentId(room);
    seatOf(room, actor).afk = true;
    const broadcasts = hooks.broadcasts;
    expect(room.handleAction(actor, { type: 'chooseHomeBonus', resource: 'energy' })).toEqual({
      ok: true,
    });
    expect(seatOf(room, actor).afk).toBe(false);
    expect(hooks.broadcasts).toBeGreaterThan(broadcasts);
  });

  it('an AFK human is played by a bot and stays AFK', () => {
    const { room, humans } = rig({ humans: 1, bots: ['easy'] });
    const human = humans[0] as string;
    seatOf(room, human).afk = true;
    makeCurrent(room, human, 'HOME_BONUS');
    const before = room.version;
    vi.advanceTimersByTime(10);
    expect(room.version).toBe(before + 1);
    expect(seatOf(room, human).afk).toBe(true);
  });

  it('a disconnected human cannot stall the game and has no turn deadline', () => {
    const { room, humans } = rig({ humans: 2 });
    const [a, b] = humans as [string, string];
    makeCurrent(room, a, 'HOME_BONUS');
    room.markDisconnected(a);
    const before = room.version;
    expect(room.stateFor(b).turnDeadline).toBeNull();
    vi.advanceTimersByTime(10);
    expect(room.version).toBe(before + 1);
  });

  it('a reconnecting human gets a fresh deadline on their turn', () => {
    const { room, humans, tokens } = rig({ humans: 2 });
    const [a, b] = humans as [string, string];
    room.markDisconnected(a);
    makeCurrent(room, a, 'MAIN');
    expect(room.stateFor(b).turnDeadline).toBeNull();
    expect(room.rejoin(tokens[a] as string)).toBe(a);
    expect(room.stateFor(b).turnDeadline).toBe(Date.now() + 90_000);
  });

  it('markDisconnected is a no-op when the seat is already disconnected', () => {
    const { room, hooks, humans } = rig({ humans: 2 });
    const a = humans[0] as string;
    room.markDisconnected(a);
    const broadcasts = hooks.broadcasts;
    room.markDisconnected(a);
    expect(hooks.broadcasts).toBe(broadcasts);
  });

  it('humans not connected when the game starts become AFK', () => {
    const { room, humans } = rig({ humans: 2, start: false });
    room.markDisconnected(humans[1] as string);
    expect(room.start(humans[0] as string)).toEqual({ ok: true });
    expect(seatOf(room, humans[1] as string).afk).toBe(true);
    expect(seatOf(room, humans[0] as string).afk).toBe(false);
  });
});

describe('Room game loop: after a turn timeout', () => {
  const config = { turnSecondsOverride: 5 };

  it('the human cannot act on the turn the bot took over, and the streak is kept', () => {
    const { room, humans } = rig({ humans: 1, bots: ['normal'], config });
    const human = humans[0] as string;
    makeCurrent(room, human, 'MAIN');
    vi.advanceTimersByTime(5000);
    const version = room.version;
    expect(room.handleAction(human, { type: 'endTurn' })).toEqual({
      ok: false,
      error: 'err.notYourTurn',
    });
    expect(room.version).toBe(version);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(3);
    vi.advanceTimersByTime(10); // the bot acts one bot delay later, unhindered
    expect(room.version).toBe(version + 1);
    advanceUntil(() => currentId(room) !== human);

    // the human controls their next turn normally ...
    advanceUntil(() => currentId(room) === human);
    expect(room.handleAction(human, { type: 'chooseHomeBonus', resource: 'metal' }).ok).toBe(true);
    // a successful action on that turn resets the streak, so the next expiry is only the first
    vi.advanceTimersByTime(5000);
    expect(seatOf(room, human).afk).toBe(false);
  });

  it('a rejected takeover-turn action does not reset the timeout streak', () => {
    const { room, humans } = rig({ humans: 1, bots: ['normal'], config });
    const human = humans[0] as string;
    makeCurrent(room, human, 'MAIN');
    vi.advanceTimersByTime(5000);
    room.handleAction(human, { type: 'endTurn' }); // rejected
    advanceUntil(() => currentId(room) !== human);
    advanceUntil(() => currentId(room) === human);
    const deadline = room.stateFor(human).turnDeadline as number;
    vi.advanceTimersByTime(deadline - Date.now());
    expect(seatOf(room, human).afk).toBe(true); // second consecutive expiry
  });

  it('discards stay allowed for the human during the takeover', () => {
    const { room, humans } = rig({ humans: 1, bots: ['normal'], config });
    const human = humans[0] as string;
    makeCurrent(room, human, 'MAIN');
    vi.advanceTimersByTime(5000);
    startDiscard(room, { [human]: 5 });
    const pick: Action = {
      type: 'discard',
      resources: { metal: 4, energy: 1, crystal: 0, biomass: 0 },
    };
    expect(room.handleAction(human, pick)).toEqual({ ok: true });
  });
});

describe('Room game loop: deadline changes outside an action are pushed', () => {
  const config = { turnSecondsOverride: 5 };
  const lastState = (hooks: TestHooks, id: PlayerId) =>
    payloads(hooks, id, 'game:state').at(-1) as GameStatePayload;

  it('other players receive the new deadline after a human turn expiry', () => {
    const { room, hooks, humans } = rig({ humans: 2, config });
    const [a, b] = humans as [string, string];
    makeCurrent(room, a, 'MAIN');
    const t0 = Date.now();
    expect(lastState(hooks, b).turnDeadline).toBe(t0 + 5000);
    const version = lastState(hooks, b).version;
    vi.advanceTimersByTime(5000);
    const pushed = lastState(hooks, b);
    expect(pushed.turnDeadline).toBeNull();
    expect(pushed.version).toBeGreaterThan(version);
    expect(lastState(hooks, a).version).toBe(pushed.version);
  });

  it('a disconnect and a reconnect both reach the other players', () => {
    const { room, hooks, humans, tokens } = rig({ humans: 2, config });
    const [a, b] = humans as [string, string];
    makeCurrent(room, a, 'MAIN');
    room.markDisconnected(a);
    expect(lastState(hooks, b).turnDeadline).toBeNull();
    vi.advanceTimersByTime(5); // less than a bot delay: the bot has not moved yet
    expect(room.rejoin(tokens[a] as string)).toBe(a);
    expect(lastState(hooks, b).turnDeadline).toBe(Date.now() + 5000);
    expect(lastState(hooks, a).turnDeadline).toBe(Date.now() + 5000);
    expect(lastState(hooks, a).version).toBe(room.version);
  });

  it('a rejoining player always receives the current state, even if no deadline changed', () => {
    const { room, hooks, humans, tokens } = rig({ humans: 2, config });
    const [a, b] = humans as [string, string];
    makeCurrent(room, a, 'MAIN');
    room.markDisconnected(b);
    const before = payloads(hooks, b, 'game:state').length;
    expect(room.rejoin(tokens[b] as string)).toBe(b);
    const states = payloads(hooks, b, 'game:state') as GameStatePayload[];
    expect(states).toHaveLength(before + 1);
    expect(states.at(-1)?.version).toBe(room.version);
    expect(states.at(-1)?.view.me).toBe(b);
  });
});

describe('Room game loop: discard phase', () => {
  const config = { turnSecondsOverride: 5 };

  it('discard timeout auto-discards for disconnected player', () => {
    const { room, humans } = rig({ humans: 2 });
    const [a, b] = humans as [string, string];
    makeCurrent(room, a, 'MAIN');
    room.markDisconnected(b);
    startDiscard(room, { [b]: 5 });
    vi.advanceTimersByTime(1000); // discardSeconds
    expect(game(room).phase).toBe('PIRATE');
    expect(game(room).pendingDiscards[b]).toBeUndefined();
    const bag = game(room).players.find((p) => p.id === b)?.resources;
    expect(Object.values(bag ?? {}).reduce((x, y) => x + y, 0)).toBe(5);
  });

  it('a connected human is auto-discarded exactly when discardSeconds expire', () => {
    const { room, hooks, humans } = rig({ humans: 2 });
    const [a, b] = humans as [string, string];
    makeCurrent(room, a, 'MAIN');
    startDiscard(room, { [b]: 5 });
    expect(room.stateFor(a).discardDeadline).toBe(Date.now() + 1000);
    vi.advanceTimersByTime(999);
    expect(game(room).phase).toBe('DISCARD');
    vi.advanceTimersByTime(1);
    expect(game(room).phase).toBe('PIRATE');
    expect(room.stateFor(a).discardDeadline).toBeNull();
    const last = payloads(hooks, a, 'game:state').at(-1) as GameStatePayload;
    expect(last.discardDeadline).toBeNull(); // never the expired deadline
  });

  it('the human choosing before the timer is not overridden', () => {
    const { room, humans } = rig({ humans: 2 });
    const [a, b] = humans as [string, string];
    makeCurrent(room, a, 'MAIN');
    startDiscard(room, { [b]: 5 });
    const pick: Action = {
      type: 'discard',
      resources: { metal: 4, energy: 1, crystal: 0, biomass: 0 },
    };
    expect(room.handleAction(b, pick)).toEqual({ ok: true });
    expect(game(room).phase).toBe('PIRATE');
    expect(game(room).players.find((p) => p.id === b)?.resources.metal).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(game(room).players.find((p) => p.id === b)?.resources.metal).toBe(0);
  });

  it('turn deadline pauses during DISCARD and resumes with the remaining time', () => {
    const { room, humans } = rig({ humans: 2, config });
    const [a, b] = humans as [string, string];
    makeCurrent(room, a, 'MAIN');
    const t0 = Date.now();
    expect(room.stateFor(a).turnDeadline).toBe(t0 + 5000);
    vi.advanceTimersByTime(200);
    startDiscard(room, { [b]: 5 });
    expect(room.stateFor(a).turnDeadline).toBeNull();
    // the paused turn does not expire while discards are pending
    vi.advanceTimersByTime(999);
    expect(game(room).phase).toBe('DISCARD');
    vi.advanceTimersByTime(1);
    expect(game(room).phase).toBe('PIRATE');
    expect(room.stateFor(a).turnDeadline).toBe(t0 + 6000); // 4800 ms were left at t0 + 1200
    expect(seatOf(room, a).afk).toBe(false);
    vi.advanceTimersByTime(4799);
    expect(currentId(room)).toBe(a);
  });

  it('several bots owing a discard each discard in turn', () => {
    const { room, humans, bots } = rig({ humans: 1, bots: ['normal', 'easy'] });
    makeCurrent(room, humans[0] as string, 'MAIN');
    startDiscard(room, { [bots[0] as string]: 5, [bots[1] as string]: 5 });
    vi.advanceTimersByTime(10);
    expect(game(room).phase).toBe('DISCARD');
    vi.advanceTimersByTime(10);
    expect(game(room).phase).toBe('PIRATE');
  });
});

describe('Room game loop: whole games', () => {
  it('all-human-AFK game advances on timers only and room expires', () => {
    const hooks = makeHooks();
    hooks.now = () => Date.now();
    const config = testConfig({ botDelayMs: [10, 10], discardSeconds: 1 });
    const manager = new RoomManager(config, hooks);
    const room = manager.create();
    if ('error' in room) throw new Error(room.error);
    const human = room.addHuman('Solo');
    if ('error' in human) throw new Error(human.error);
    room.addBot(human.playerId, 'normal');
    room.addBot(human.playerId, 'easy');
    expect(room.start(human.playerId)).toEqual({ ok: true });
    room.markDisconnected(human.playerId);

    let maxTimers = 0;
    for (let i = 0; i < 20_000 && room.phase !== 'FINISHED'; i++) {
      vi.advanceTimersByTime(1000);
      maxTimers = Math.max(maxTimers, vi.getTimerCount());
    }
    expect(room.phase).toBe('FINISHED');
    expect(maxTimers).toBeLessThanOrEqual(3);
    expect(vi.getTimerCount()).toBe(0);

    expect(manager.sweep(Date.now())).toEqual([]);
    vi.advanceTimersByTime(15 * 60_000);
    expect(manager.sweep(Date.now())).toEqual([room.code]);
    expect(manager.get(room.code)).toBeUndefined();
  });

  it('bots-only after humans leave: game reaches FINISHED within 20 000 actions', () => {
    const { room, humans } = rig({ humans: 1, bots: ['normal', 'easy', 'normal'] });
    room.leave(humans[0] as string);
    for (let i = 0; i < 20_000 && room.phase !== 'FINISHED'; i++) {
      vi.advanceTimersByTime(10_000);
      if (room.version - 1 > 20_000) break;
    }
    expect(room.phase).toBe('FINISHED');
    expect(room.version - 1).toBeLessThanOrEqual(20_000);
    expect(game(room).winner).not.toBeNull();
  });

  it('on FINISHED the room is marked finished, timers are cleared and activity is bumped', () => {
    const { room, hooks, humans } = rig({ humans: 2 });
    const [a, b] = humans as [string, string];
    makeCurrent(room, a, 'MAIN');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    vi.advanceTimersByTime(1234);
    const broadcasts = hooks.broadcasts;
    patch(room, (g) => {
      g.phase = 'FINISHED';
      g.winner = a;
      g.endReason = 'target';
    });
    expect(room.phase).toBe('FINISHED');
    expect(vi.getTimerCount()).toBe(0);
    expect(room.lastActivity).toBe(Date.now());
    expect(hooks.broadcasts).toBe(broadcasts + 1);
    expect(room.handleAction(b, { type: 'roll' })).toEqual({ ok: false, error: 'err.gameOver' });
    room.schedule(); // idempotent
    expect(hooks.broadcasts).toBe(broadcasts + 1);
    expect(room.stateFor(a).turnDeadline).toBeNull();
  });

  it('deleting a room from the manager stops its timers', () => {
    const hooks = makeHooks();
    hooks.now = () => Date.now();
    const manager = new RoomManager(testConfig({ botDelayMs: [10, 10] }), hooks);
    const room = manager.create();
    if ('error' in room) throw new Error(room.error);
    const host = room.addHuman('Ada');
    if ('error' in host) throw new Error(host.error);
    room.addBot(host.playerId, 'normal');
    room.start(host.playerId);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    manager.delete(room.code);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('disposeAll stops the timers of every room and empties the registry', () => {
    const hooks = makeHooks();
    hooks.now = () => Date.now();
    const manager = new RoomManager(testConfig({ botDelayMs: [10, 10] }), hooks);
    for (let i = 0; i < 3; i += 1) {
      const room = manager.create();
      if ('error' in room) throw new Error(room.error);
      const host = room.addHuman('Ada');
      if ('error' in host) throw new Error(host.error);
      room.addBot(host.playerId, 'normal');
      room.start(host.playerId);
    }
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    manager.disposeAll();
    expect(vi.getTimerCount()).toBe(0);
    expect(manager.size).toBe(0);
  });
});

describe('Room rematch', () => {
  function finished() {
    const r = rig({ humans: 3, bots: ['normal'] });
    patch(r.room, (g) => {
      g.phase = 'FINISHED';
      g.winner = r.humans[0] as string;
      g.endReason = 'target';
    });
    return r;
  }

  it('rematch returns to LOBBY with same connected seats', () => {
    const { room, humans, bots } = finished();
    const [a, b, c] = humans as [string, string, string];
    const lastVersion = room.version;
    room.markDisconnected(c);
    expect(room.rematch(a)).toEqual({ ok: true });
    expect(room.phase).toBe('LOBBY');
    expect(room.game).toBeNull();
    expect(room.seats.map((s) => s.playerId)).toEqual([a, b, bots[0]]);
    expect(room.seats.every((s) => s.connected && !s.afk)).toBe(true);
    expect(room.hostId).toBe(a);
    expect(room.start(a)).toEqual({ ok: true }); // can play again
    expect(room.version).toBeGreaterThan(lastVersion);
  });

  it('versions keep increasing across a rematch (R14)', () => {
    const { room, hooks, humans } = finished();
    const a = humans[0] as string;
    const lastOf = () => (payloads(hooks, a, 'game:state').at(-1) as GameStatePayload).version;
    const lastVersion = lastOf();
    expect(room.rematch(a)).toEqual({ ok: true });
    expect(room.start(a)).toEqual({ ok: true });
    expect(lastOf()).toBeGreaterThan(lastVersion);
  });

  it('only the host can rematch, and only a finished game', () => {
    const { room, humans } = finished();
    expect(room.rematch(humans[1] as string)).toEqual({ error: 'err.notHost' });
    const live = rig({ humans: 2 });
    expect(live.room.rematch(live.humans[0] as string)).toEqual({ error: 'err.badRequest' });
  });

  it('a rematch drops the old game timers', () => {
    const { room, humans } = finished();
    room.rematch(humans[0] as string);
    expect(vi.getTimerCount()).toBe(0);
  });
});
