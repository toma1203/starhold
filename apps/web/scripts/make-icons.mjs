// Renders the app icons and the social preview image from public/favicon.svg with sharp.
// Run once (`node apps/web/scripts/make-icons.mjs`) and commit the PNGs: the build never needs sharp.
import { mkdir, readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { URL, fileURLToPath } from 'node:url';
import process from 'node:process';
import sharp from 'sharp';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const BACKGROUND = '#05070f';
const SVG_VIEWBOX = 64;

const source = await readFile(`${publicDir}favicon.svg`);

/** The favicon rasterised at `size` px, with the density raised so edges stay sharp. */
function renderIcon(size) {
  return sharp(source, { density: (72 * size) / SVG_VIEWBOX })
    .resize(size, size)
    .png()
    .toBuffer();
}

async function write(name, buffer) {
  await sharp(buffer).png({ compressionLevel: 9 }).toFile(`${publicDir}${name}`);
  process.stdout.write(`wrote ${name}\n`);
}

await mkdir(`${publicDir}icons`, { recursive: true });

await write('icons/icon-192.png', await renderIcon(192));
await write('icons/icon-512.png', await renderIcon(512));

// Maskable: a full-bleed square with the artwork inside the central 80% safe zone.
const MASKABLE = 512;
const inner = await renderIcon(Math.round(MASKABLE * 0.7));
await write(
  'icons/icon-maskable-512.png',
  await sharp({
    create: { width: MASKABLE, height: MASKABLE, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: inner, gravity: 'centre' }])
    .png()
    .toBuffer(),
);

// Social preview, 1200x630: the icon next to the name and tagline.
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="75%">
      <stop offset="0" stop-color="#131a30"/>
      <stop offset="1" stop-color="${BACKGROUND}"/>
    </radialGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#g)"/>
  <g fill="#e8ecf8" opacity="0.6">
    <circle cx="90" cy="80" r="2"/><circle cx="260" cy="540" r="2.5"/><circle cx="1100" cy="110" r="2"/>
    <circle cx="980" cy="520" r="3"/><circle cx="640" cy="60" r="1.5"/><circle cx="1150" cy="330" r="2"/>
    <circle cx="170" cy="300" r="1.5"/><circle cx="800" cy="580" r="2"/>
  </g>
  <text x="560" y="320" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="120" font-weight="700" fill="#e8ecf8">Starhold</text>
  <text x="566" y="400" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="34" fill="#9aa5c4">Build, trade and conquer the galaxy.</text>
</svg>`;
const icon = await renderIcon(360);
await write(
  'og.png',
  await sharp(Buffer.from(ogSvg))
    .composite([{ input: icon, left: 120, top: 135 }])
    .png()
    .toBuffer(),
);
