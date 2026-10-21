import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@starhold/protocol';
import type { Config } from './config.ts';
import { createHttpApp } from './http.ts';
import { log } from './log.ts';
import { RoomManager } from './roomManager.ts';
import { attachSocket, createHooks } from './socket.ts';

export interface RunningServer {
  /** Tells every client the server is restarting, stops all rooms' timers, then closes. */
  close(): Promise<void>;
  port: number;
}

export interface ServerOptions {
  /** Built web client to serve; null (the default) serves the API and sockets only. */
  staticDir?: string | null;
}

const SWEEP_INTERVAL_MS = 60_000;
/** Far above any legal message (the largest is a discard / trade bag), far below abuse. */
const MAX_MESSAGE_BYTES = 16 * 1024;

export async function startServer(
  config: Config,
  options: ServerOptions = {},
): Promise<RunningServer> {
  const httpServer = createServer(createHttpApp({ staticDir: options.staticDir ?? null }));
  // Same origin in production: the `cors` option is deliberately left unset (no CORS headers).
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    serveClient: false,
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
  });
  const manager = new RoomManager(config, createHooks(io));
  attachSocket(io, manager, config);

  const sweeper = setInterval(() => {
    for (const code of manager.sweep(Date.now())) {
      io.to(code).emit('room:closed', { reason: 'expired' });
      io.in(code).socketsLeave(code);
    }
  }, SWEEP_INTERVAL_MS);
  sweeper.unref();

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(config.port, resolve);
  });
  const port = (httpServer.address() as AddressInfo).port;
  log.info('server listening', { port });

  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      clearInterval(sweeper);
      io.emit('room:closed', { reason: 'serverRestart' });
      manager.disposeAll();
      await new Promise<void>((resolve) => {
        void io.close(() => resolve());
        httpServer.closeIdleConnections();
      });
      log.info('server closed');
    })();
    return closing;
  };
  return { close, port };
}
