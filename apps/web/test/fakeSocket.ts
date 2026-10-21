import type { AppSocket } from '../src/net/socket.ts';

type Handler = (...args: unknown[]) => void;

/** Minimal stand-in for a socket.io client: records emits, lets tests fire server events. */
export class FakeSocket {
  connected = false;
  readonly emitted: { event: string; args: unknown[] }[] = [];
  private readonly handlers = new Map<string, Handler[]>();

  on(event: string, fn: Handler): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args });
    return this;
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

  /** Answers the most recent `event` emit through its ack callback. */
  ack(event: string, response: unknown): void {
    const args = this.sent(event).at(-1);
    const cb = args?.at(-1);
    if (typeof cb !== 'function') throw new Error(`no ack callback recorded for ${event}`);
    (cb as (r: unknown) => void)(response);
  }

  asSocket(): AppSocket {
    return this as unknown as AppSocket;
  }
}
