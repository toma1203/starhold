import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Absolute path inside apps/web (jsdom's import.meta.url is not a file URL, so use dirname). */
export const webPath = (...parts: string[]): string => resolve(import.meta.dirname, '..', ...parts);

export const readWebFile = (...parts: string[]): string => readFileSync(webPath(...parts), 'utf8');
