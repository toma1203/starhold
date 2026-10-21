import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@starhold/protocol';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Same origin by default (Vite proxies `/socket.io` in dev, the server serves the app in production). */
export function createSocket(url?: string): AppSocket {
  const options = { reconnectionAttempts: Infinity, reconnectionDelayMax: 5000 };
  return url === undefined ? io(options) : io(url, options);
}
