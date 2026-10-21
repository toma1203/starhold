import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '@starhold/engine';
import { readWebFile } from './paths.ts';
import { FakeSocket } from './fakeSocket.ts';

type Sfx = typeof import('../src/audio/sfx.ts');

/** Records what the synthesiser asks the Web Audio API for. */
class FakeParam {
  value = 0;
  readonly calls: string[] = [];
  setValueAtTime = (v: number) => (this.calls.push(`set:${v}`), this);
  linearRampToValueAtTime = (v: number) => (this.calls.push(`lin:${v}`), this);
  exponentialRampToValueAtTime = (v: number) => (this.calls.push(`exp:${v}`), this);
}

class FakeNode {
  readonly connections: unknown[] = [];
  readonly gain = new FakeParam();
  readonly frequency = new FakeParam();
  type = '';
  buffer: unknown = null;
  started = false;
  stopped = false;
  connect = (to: unknown) => (this.connections.push(to), to);
  start = () => void (this.started = true);
  stop = () => void (this.stopped = true);
}

let created: { contexts: FakeContext[]; sources: FakeNode[] };

class FakeContext {
  currentTime = 0;
  sampleRate = 8000;
  state = 'suspended';
  destination = {};
  /** Like iOS Safari for a gesture that does not activate audio: resume() leaves it suspended. */
  static blockResume = false;
  resume = vi.fn(() => {
    if (!FakeContext.blockResume) this.state = 'running';
    return Promise.resolve();
  });
  constructor() {
    created.contexts.push(this);
  }
  createGain = () => new FakeNode();
  createBiquadFilter = () => new FakeNode();
  createOscillator = () => {
    const node = new FakeNode();
    created.sources.push(node);
    return node;
  };
  createBuffer = (_channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
  });
  createBufferSource = () => {
    const node = new FakeNode();
    created.sources.push(node);
    return node;
  };
}

const uninstall: (() => void)[] = [];

/** A fresh copy of the module; `install` also wires the gesture listeners and remembers to undo them. */
async function loadSfx(install = false): Promise<Sfx> {
  vi.resetModules();
  const sfx = await import('../src/audio/sfx.ts');
  if (install) uninstall.push(sfx.installAudioUnlock());
  return sfx;
}

const gesture = () => window.dispatchEvent(new Event('pointerdown'));

beforeEach(() => {
  FakeContext.blockResume = false;
  created = { contexts: [], sources: [] };
});

afterEach(() => {
  for (const off of uninstall.splice(0)) off();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'AudioContext');
});

describe('playSfx', () => {
  it('playSfx is a no-op when AudioContext is undefined', async () => {
    const sfx = await loadSfx(true);
    expect(typeof window.AudioContext).toBe('undefined');
    gesture();
    expect(() => {
      for (const name of ['dice', 'build', 'battle', 'conquer', 'turn', 'victory'] as const) {
        sfx.playSfx(name);
      }
    }).not.toThrow();
  });

  it('creates the AudioContext lazily, on the first user gesture only', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    const sfx = await loadSfx(true);
    sfx.playSfx('dice');
    expect(created.contexts).toHaveLength(0);
    expect(created.sources).toHaveLength(0);

    gesture();
    expect(created.contexts).toHaveLength(1);
    expect(created.contexts[0]?.resume).toHaveBeenCalled();
    gesture();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(created.contexts).toHaveLength(1);
  });

  it('keeps listening until the context is running, on several kinds of gesture', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    FakeContext.blockResume = true;
    const sfx = await loadSfx(true);
    gesture();
    await Promise.resolve();
    const ctx = created.contexts[0]!;
    expect(ctx.state).toBe('suspended');
    expect(ctx.resume).toHaveBeenCalledTimes(1);

    // pointerdown did not activate audio: pointerup, click and touchend must all try again.
    window.dispatchEvent(new Event('pointerup'));
    window.dispatchEvent(new Event('click'));
    window.dispatchEvent(new Event('touchend'));
    expect(ctx.resume).toHaveBeenCalledTimes(4);
    sfx.playSfx('turn');
    expect(created.sources).toHaveLength(2); // a suspended context still gets its nodes scheduled

    FakeContext.blockResume = false;
    window.dispatchEvent(new Event('keydown'));
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.state).toBe('running');
    const calls = ctx.resume.mock.calls.length;
    // Running: the listeners are gone, so later gestures do nothing.
    for (const type of ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown']) {
      window.dispatchEvent(new Event(type));
    }
    expect(ctx.resume).toHaveBeenCalledTimes(calls);
    expect(created.contexts).toHaveLength(1);
  });

  it('can be installed again after it was uninstalled', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    const sfx = await loadSfx();
    const off = sfx.installAudioUnlock();
    off();
    uninstall.push(sfx.installAudioUnlock());
    gesture();
    expect(created.contexts).toHaveLength(1);
  });

  it.each(['dice', 'build', 'battle', 'conquer', 'turn', 'victory'] as const)(
    '%s synthesises sound from oscillators or noise and stops every source',
    async (name) => {
      vi.stubGlobal('AudioContext', FakeContext);
      const sfx = await loadSfx(true);
      gesture();
      sfx.playSfx(name);
      expect(created.sources.length).toBeGreaterThan(0);
      for (const source of created.sources) {
        expect(source.started).toBe(true);
        expect(source.stopped).toBe(true);
      }
    },
  );

  it('plays nothing while muted and again after unmuting', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    const sfx = await loadSfx(true);
    gesture();
    sfx.setSfxMuted(true);
    sfx.playSfx('victory');
    expect(created.sources).toHaveLength(0);
    sfx.setSfxMuted(false);
    sfx.playSfx('victory');
    expect(created.sources.length).toBeGreaterThan(0);
  });

  it('survives an AudioContext that throws', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('blocked');
        }
      },
    );
    const sfx = await loadSfx(true);
    expect(gesture).not.toThrow();
    expect(() => sfx.playSfx('build')).not.toThrow();
  });
});

describe('sfxForEvent', () => {
  const ev = (e: Partial<GameEvent> & { type: GameEvent['type'] }) => e as GameEvent;

  it('maps events to sounds', async () => {
    const { sfxForEvent } = await loadSfx();
    expect(sfxForEvent(ev({ type: 'diceRolled' }), 'p1')).toBe('dice');
    expect(sfxForEvent(ev({ type: 'built' }), 'p1')).toBe('build');
    expect(sfxForEvent(ev({ type: 'battle', conquered: false }), 'p1')).toBe('battle');
    expect(sfxForEvent(ev({ type: 'battle', conquered: true }), 'p1')).toBe('conquer');
    expect(sfxForEvent(ev({ type: 'tradeCancelled' }), 'p1')).toBeNull();
  });

  it('chimes only for my own turn and my own victory', async () => {
    const { sfxForEvent } = await loadSfx();
    expect(sfxForEvent(ev({ type: 'turnStarted', player: 'p1' }), 'p1')).toBe('turn');
    expect(sfxForEvent(ev({ type: 'turnStarted', player: 'p2' }), 'p1')).toBeNull();
    expect(sfxForEvent(ev({ type: 'gameOver', winner: 'p1' }), 'p1')).toBe('victory');
    expect(sfxForEvent(ev({ type: 'gameOver', winner: 'p2' }), 'p1')).toBeNull();
  });
});

describe('store triggers sounds from incoming events', () => {
  it('plays a sound per distinct kind of event and mutes through setMuted', async () => {
    vi.resetModules();
    const played: string[] = [];
    const muted: boolean[] = [];
    vi.doMock('../src/audio/sfx.ts', async (importOriginal) => {
      const real = await importOriginal<Sfx>();
      return {
        ...real,
        playSfx: (n: string) => void played.push(n),
        setSfxMuted: (b: boolean) => void muted.push(b),
      };
    });
    const store = await import('../src/store/gameStore.ts');
    const socket = new FakeSocket();
    store.bindSocket(socket.asSocket());
    store.useGameStore.setState({
      room: {
        code: 'ABCDE',
        phase: 'IN_GAME',
        hostId: 'p1',
        seats: [],
        settings: { targetVp: 8, turnSeconds: 90 },
        you: 'p1',
      },
    });
    socket.trigger('game:events', [
      { type: 'diceRolled', player: 'p2', dice: [3, 4] },
      { type: 'diceRolled', player: 'p2', dice: [1, 1] },
      { type: 'turnStarted', player: 'p1', round: 2 },
      { type: 'tradeCancelled' },
    ]);
    expect(played).toEqual(['dice', 'turn']);

    store.useGameStore.getState().setMuted(true);
    expect(muted.at(-1)).toBe(true);
    vi.doUnmock('../src/audio/sfx.ts');
  });
});

describe('sfx source', () => {
  it('uses no audio files, data URLs or blobs', async () => {
    const source = readWebFile('src', 'audio', 'sfx.ts');
    expect(source).not.toMatch(/data:|blob:|new Audio\(|\.mp3|\.ogg|\.wav|fetch\(/);
  });
});
