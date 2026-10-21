import { join } from 'node:path';
import express from 'express';
import helmet from 'helmet';

export interface HttpOptions {
  /** Built web client to serve, or null for an API-only server. */
  staticDir: string | null;
}

const ONE_YEAR_SECONDS = 31_536_000;
/** A request path that names a file (has an extension) must 404 rather than get the SPA shell. */
const LOOKS_LIKE_FILE = /\.[a-z0-9]+$/i;

export function createHttpApp({ staticDir }: HttpOptions): express.Express {
  const app = express();
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          imgSrc: ["'self'", 'data:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'"],
        },
      },
    }),
  );

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  if (staticDir !== null) {
    // Hashed build output: safe to cache for a year.
    app.use(
      '/assets',
      express.static(join(staticDir, 'assets'), {
        maxAge: ONE_YEAR_SECONDS * 1000,
        immutable: true,
        index: false,
      }),
    );
    app.use(express.static(staticDir, { index: false }));
    // Client-side routes (e.g. /game/ABCDE) all get the app shell.
    app.get('*', (req, res, next) => {
      if (LOOKS_LIKE_FILE.test(req.path)) {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile('index.html', { root: staticDir });
    });
  }

  return app;
}
