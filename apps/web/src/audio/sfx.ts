import type { GameEvent } from '@starhold/engine';

export type SfxName = 'dice' | 'build' | 'battle' | 'conquer' | 'turn' | 'victory';

/*
 * Every sound is synthesised at play time from oscillators and filtered noise: there are no audio
 * files, data URLs or blobs, which keeps the strict Content-Security-Policy intact and the bundle
 * free of binary assets. Browsers only let an AudioContext start after a user gesture, so it is
 * created lazily on the first user gesture and sounds before that are silently dropped.
 */

type ContextConstructor = new () => AudioContext;

let context: AudioContext | null = null;
let muted = false;
let unlockInstalled = false;

const MASTER_GAIN = 0.18;
const GESTURES = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'] as const;

function contextConstructor(): ContextConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as typeof globalThis & { webkitAudioContext?: ContextConstructor };
  return w.AudioContext ?? w.webkitAudioContext;
}

export function setSfxMuted(value: boolean): void {
  muted = value;
}

const isRunning = (ctx: AudioContext): boolean => ctx.state === 'running';

/** Creates the context if needed and asks it to start. Resolves once resume() has settled. */
async function unlock(): Promise<void> {
  if (context === null) {
    const Ctor = contextConstructor();
    if (Ctor === undefined) return;
    try {
      context = new Ctor();
    } catch {
      return; // Audio blocked or unsupported: the game stays silent.
    }
  }
  if (!isRunning(context)) await context.resume().catch(() => undefined);
}

/**
 * Starts listening for user gestures, which is when the AudioContext may be created and resumed.
 * Not every gesture activates audio (iOS Safari ignores pointerdown, for one), so the listeners
 * stay until the context is actually running. Returns a function that removes them again.
 */
export function installAudioUnlock(): () => void {
  if (unlockInstalled || typeof window === 'undefined') return () => undefined;
  unlockInstalled = true;
  const remove = () => {
    for (const g of GESTURES) window.removeEventListener(g, handler, true);
  };
  const handler = () => {
    void unlock().then(() => {
      if (context !== null && isRunning(context)) remove();
    });
  };
  for (const g of GESTURES) window.addEventListener(g, handler, true);
  return () => {
    remove();
    unlockInstalled = false;
  };
}

interface Tone {
  at: number;
  freq: number;
  /** Frequency at the end of the tone, for glides. */
  to?: number;
  duration: number;
  type: OscillatorType;
  volume: number;
}

function tone(ctx: AudioContext, out: AudioNode, { at, freq, to, duration, type, volume }: Tone) {
  const start = ctx.currentTime + at;
  const end = start + duration;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(to, end);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.linearRampToValueAtTime(volume, start + Math.min(0.015, duration / 3));
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(env);
  env.connect(out);
  osc.start(start);
  osc.stop(end + 0.02);
}

/** A burst of white noise through a band-pass or low-pass filter. */
function noise(
  ctx: AudioContext,
  out: AudioNode,
  at: number,
  duration: number,
  volume: number,
  filter: { type: BiquadFilterType; freq: number },
) {
  const start = ctx.currentTime + at;
  const end = start + duration;
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  const biquad = ctx.createBiquadFilter();
  const env = ctx.createGain();
  source.buffer = buffer;
  biquad.type = filter.type;
  biquad.frequency.setValueAtTime(filter.freq, start);
  env.gain.setValueAtTime(volume, start);
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  source.connect(biquad);
  biquad.connect(env);
  env.connect(out);
  source.start(start);
  source.stop(end + 0.02);
}

const RECIPES: Record<SfxName, (ctx: AudioContext, out: AudioNode) => void> = {
  // Dice clattering on a table: three short filtered clicks.
  dice: (ctx, out) => {
    for (const at of [0, 0.07, 0.15]) {
      noise(ctx, out, at, 0.05, 0.9, { type: 'bandpass', freq: 1800 + at * 4000 });
    }
  },
  // A rising two-note "clunk" of something being assembled.
  build: (ctx, out) => {
    tone(ctx, out, { at: 0, freq: 330, to: 392, duration: 0.12, type: 'square', volume: 0.35 });
    tone(ctx, out, { at: 0.1, freq: 494, to: 587, duration: 0.16, type: 'square', volume: 0.35 });
  },
  // A low rumble with a burst of noise on top.
  battle: (ctx, out) => {
    noise(ctx, out, 0, 0.28, 0.8, { type: 'lowpass', freq: 900 });
    tone(ctx, out, { at: 0, freq: 120, to: 50, duration: 0.3, type: 'sawtooth', volume: 0.5 });
  },
  // A rising major arpeggio.
  conquer: (ctx, out) => {
    [262, 330, 392].forEach((freq, i) => {
      tone(ctx, out, { at: i * 0.09, freq, duration: 0.25, type: 'triangle', volume: 0.5 });
    });
  },
  // A short two-note ping.
  turn: (ctx, out) => {
    tone(ctx, out, { at: 0, freq: 660, duration: 0.14, type: 'sine', volume: 0.5 });
    tone(ctx, out, { at: 0.12, freq: 880, duration: 0.22, type: 'sine', volume: 0.5 });
  },
  // A longer fanfare.
  victory: (ctx, out) => {
    [523, 659, 784, 1047].forEach((freq, i) => {
      tone(ctx, out, {
        at: i * 0.14,
        freq,
        duration: i === 3 ? 0.7 : 0.22,
        type: 'triangle',
        volume: 0.55,
      });
    });
  },
};

/** Plays a sound effect. A no-op while muted, before the first gesture, or without Web Audio. */
export function playSfx(name: SfxName): void {
  if (muted || context === null) return;
  try {
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    const master = context.createGain();
    master.gain.setValueAtTime(MASTER_GAIN, context.currentTime);
    master.connect(context.destination);
    RECIPES[name](context, master);
  } catch {
    // A failing sound must never break the game.
  }
}

/** Which sound, if any, a game event deserves for the player `me`. */
export function sfxForEvent(event: GameEvent, me: string): SfxName | null {
  switch (event.type) {
    case 'diceRolled':
      return 'dice';
    case 'built':
      return 'build';
    case 'battle':
      return event.conquered ? 'conquer' : 'battle';
    case 'turnStarted':
      return event.player === me ? 'turn' : null;
    case 'gameOver':
      return event.winner === me ? 'victory' : null;
    default:
      return null;
  }
}
