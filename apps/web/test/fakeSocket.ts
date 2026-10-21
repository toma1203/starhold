import type { AppSocket } from '../src/net/socket.ts';

type Handler = (...args: unknown[]) => void;

interface Emitted {
  event: string;
  args: unknown[];
  /** Set when the emit went through `socket.timeout(ms)`: the ack is then `(err, response)`. */
  timeoutMs?: number;
}

/** Minimal stand-in for a socket.io client: records emits, lets tests fire server events. */
export class FakeSocket {
  connected = false;
  readonly emitted: Emitted[] = [];
  private readonly handlers = new Map<string, Handler[]>();

  on(event: string, fn: Handler): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args });
    return this;
  }

  /** Like socket.io's `socket.timeout(ms)`: the next emit's ack callback gets `(err, response)`. */
  timeout(timeoutMs: number): { emit: (event: string, ...args: unknown[]) => boolean } {
    return {
      emit: (event, ...args) => {
        this.emitted.push({ event, args, timeoutMs });
        return true;
      },
    };
  }

  /** Simulates the server (or the transport) sending `event`. */
  trigger(event: string, ...args: unknown[]): void {
    if (event === 'connect') this.connected = true;
    if (event === 'disconnect') this.connected = false;
    for (const fn of this.handlers.get(event) ?? []) fn(...args);
  }

  /** Arguments of every emit of `event`, oldest first. */
  sent(event: string): unknown[][] {
    return this.emitted.filter((e) => e.event === event).map((e) => e.args);
  }

  /** Timeout (ms) passed to the most recent emit of `event`, or undefined for a plain emit. */
  timeoutOf(event: string): number | undefined {
    return this.emitted.filter((e) => e.event === event).at(-1)?.timeoutMs;
  }

  private lastEmit(event: string): { cb: (...a: unknown[]) => void; timed: boolean } {
    const entry = this.emitted.filter((e) => e.event === event).at(-1);
    const cb = entry?.args.at(-1);
    if (entry === undefined || typeof cb !== 'function') {
      throw new Error(`no ack callback recorded for ${event}`);
    }
    return { cb: cb as (...a: unknown[]) => void, timed: entry.timeoutMs !== undefined };
  }

  /** Answers the most recent `event` emit through its ack callback. */
  ack(event: string, response: unknown): void {
    const { cb, timed } = this.lastEmit(event);
    if (timed) cb(null, response);
    else cb(response);
  }

  /** Makes the most recent timed `event` emit fail the way socket.io does when no ack arrives. */
  ackTimeout(event: string): void {
    const { cb, timed } = this.lastEmit(event);
    if (!timed) throw new Error(`${event} was not sent through socket.timeout()`);
    cb(new Error('operation has timed out'));
  }

  asSocket(): AppSocket {
    return this as unknown as AppSocket;
  }
}
