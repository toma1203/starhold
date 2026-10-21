import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.ts';
import { log } from './log.ts';
import { startServer } from './server.ts';

/** `STARHOLD_STATIC_DIR`, else `apps/web/dist` next to this file's package (src/ or dist/). */
function resolveStaticDir(): string | null {
  const dir =
    process.env['STARHOLD_STATIC_DIR'] ??
    resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  return existsSync(dir) ? dir : null;
}

const staticDir = resolveStaticDir();
if (staticDir === null) log.warn('no web build found; serving the API and sockets only');
const server = await startServer(loadConfig(), { staticDir });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    log.info('shutting down', { signal });
    void server.close().then(() => process.exit(0));
  });
}
