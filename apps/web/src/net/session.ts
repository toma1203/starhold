import type { Locale } from '@starhold/i18n';

export interface Session {
  playerId: string;
  token: string;
}

const PREFIX = 'starhold.';
const sessionKey = (code: string) => `${PREFIX}session.${code}`;

/** localStorage can be missing, blocked or full; every access goes through these two helpers. */
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the app keeps working, it just forgets.
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // See write().
  }
}

export function saveSession(code: string, session: Session): void {
  write(sessionKey(code), JSON.stringify(session));
}

export function loadSession(code: string): Session | null {
  const raw = read(sessionKey(code));
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { playerId, token } = value as Record<string, unknown>;
    return typeof playerId === 'string' && typeof token === 'string' ? { playerId, token } : null;
  } catch {
    return null;
  }
}

export function clearSession(code: string): void {
  remove(sessionKey(code));
}

export function loadNickname(): string {
  return read(`${PREFIX}nickname`) ?? '';
}

export function saveNickname(name: string): void {
  write(`${PREFIX}nickname`, name);
}

export function loadLocale(): Locale | null {
  const value = read(`${PREFIX}locale`);
  return value === 'en' || value === 'hr' ? value : null;
}

export function saveLocale(locale: Locale): void {
  write(`${PREFIX}locale`, locale);
}

export function loadMuted(): boolean {
  return read(`${PREFIX}muted`) === '1';
}

export function saveMuted(muted: boolean): void {
  write(`${PREFIX}muted`, muted ? '1' : '0');
}
