import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readWebFile, webPath } from './paths.ts';

const read = (path: string) => readWebFile(path);

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
interface Manifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  lang: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

const manifest = JSON.parse(read('public/manifest.webmanifest')) as Manifest;
const html = read('index.html');

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): [number, number] {
  const bytes = readFileSync(webPath(path));
  expect(bytes.subarray(1, 4).toString('latin1'), path).toBe('PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

const meta = (attr: 'name' | 'property', key: string): string | null =>
  new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]*)"`).exec(html)?.[1] ?? null;

describe('web app manifest', () => {
  it('has the installability basics', () => {
    expect(manifest.name).toBe('Starhold');
    expect(manifest.short_name).toBe('Starhold');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.description.length).toBeGreaterThan(20);
  });

  it('shares its theme colour with the page', () => {
    expect(meta('name', 'theme-color')).toBe(manifest.theme_color);
  });

  it('lists 192, 512 and a maskable 512 icon, all real PNG files of that size', () => {
    const find = (size: string, purpose: string) =>
      manifest.icons.find((i) => i.sizes === size && (i.purpose ?? 'any') === purpose);
    for (const icon of [
      find('192x192', 'any'),
      find('512x512', 'any'),
      find('512x512', 'maskable'),
    ]) {
      expect(icon).toBeDefined();
      expect(icon?.type).toBe('image/png');
      expect(icon?.src.startsWith('/icons/')).toBe(true);
      const [w, h] = icon!.sizes.split('x').map(Number);
      expect(existsSync(webPath(`public${icon!.src}`)), icon!.src).toBe(true);
      expect(pngSize(`public${icon!.src}`)).toEqual([w, h]);
    }
  });
});

describe('index.html', () => {
  it('declares language, description, theme colour and the manifest', () => {
    expect(html).toMatch(/<html lang="[a-z]{2}"/);
    expect(meta('name', 'description')?.length).toBeGreaterThan(50);
    expect(meta('name', 'description')?.length).toBeLessThanOrEqual(160);
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/);
    expect(html).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"/);
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/icons\/icon-192\.png"/);
    expect(html).toMatch(/<meta name="viewport"/);
  });

  it('has Open Graph and Twitter tags that point at the committed og.png', () => {
    expect(meta('property', 'og:title')).toBe('Starhold');
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('property', 'og:description')).toBeTruthy();
    expect(meta('property', 'og:image')).toMatch(/\/og\.png$/);
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('name', 'twitter:image')).toMatch(/\/og\.png$/);
    expect(pngSize('public/og.png')).toEqual([1200, 630]);
  });

  it('loads nothing from other origins and has no inline script (CSP)', () => {
    expect(html).not.toMatch(/https?:\/\/(?!github\.com)/);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });
});

describe('icon generation', () => {
  it('has a favicon.svg source and a script that renders it with sharp', () => {
    expect(existsSync(webPath('public/favicon.svg'))).toBe(true);
    const script = read('scripts/make-icons.mjs');
    expect(script).toContain("from 'sharp'");
    expect(script).toContain('favicon.svg');
    for (const file of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'og.png']) {
      expect(script, file).toContain(file);
    }
  });
});
