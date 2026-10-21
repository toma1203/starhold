import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpApp } from '../src/http.ts';

let server: Server | null = null;
let dir: string | null = null;

async function serve(staticDir: string | null): Promise<string> {
  const listening = createServer(createHttpApp({ staticDir }));
  server = listening;
  await new Promise<void>((resolve) => listening.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(listening.address() as AddressInfo).port}`;
}

function staticFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'starhold-static-'));
  dir = root;
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Starhold</title>');
  writeFileSync(join(root, 'robots.txt'), 'User-agent: *');
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'app-abc123.js'), 'console.log(1)');
  return root;
}

afterEach(async () => {
  const closing = server;
  await new Promise<void>((resolve) => (closing ? closing.close(() => resolve()) : resolve()));
  server = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('http app', () => {
  it('/healthz 200 JSON', async () => {
    const base = await serve(null);
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('security headers present (content-security-policy, x-content-type-options)', async () => {
    const base = await serve(null);
    const res = await fetch(`${base}/healthz`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const csp = res.headers.get('content-security-policy') ?? '';
    for (const directive of [
      "default-src 'self'",
      "connect-src 'self' ws: wss:",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
    ]) {
      expect(csp, directive).toContain(directive);
    }
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('unknown route serves index.html when staticDir set', async () => {
    const base = await serve(staticFixture());
    const res = await fetch(`${base}/game/ABCDE`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<title>Starhold</title>');
  });

  it('serves real files, and a missing file is a 404 rather than index.html', async () => {
    const base = await serve(staticFixture());
    expect(await (await fetch(`${base}/robots.txt`)).text()).toBe('User-agent: *');
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
    expect((await fetch(`${base}/nope.png`)).status).toBe(404);
  });

  it('/assets/* is cached immutably for a year, index.html is not cached', async () => {
    const base = await serve(staticFixture());
    const asset = await fetch(`${base}/assets/app-abc123.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const index = await fetch(`${base}/`);
    expect(index.headers.get('cache-control')).toBe('no-cache');
  });

  it('without staticDir an unknown route is 404', async () => {
    const base = await serve(null);
    expect((await fetch(`${base}/anything`)).status).toBe(404);
  });

  it('only GET falls back to index.html', async () => {
    const base = await serve(staticFixture());
    expect((await fetch(`${base}/game/ABCDE`, { method: 'POST' })).status).toBe(404);
  });
});
