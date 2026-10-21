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

/** Seats are kept for a day; the server forgets a room long before that. */
const SESSION_MAX_AGE_MS = 24 * 3_600_000;

export function saveSession(code: string, session: Session): void {
  write(sessionKey(code), JSON.stringify({ ...session, savedAt: Date.now() }));
}

/**
 * Removes stored seats older than 24 hours, and ones without a save time (written before
 * stamps existed). Run once at boot so `starhold.session.*` entries do not pile up.
 */
export function pruneStaleSessions(now: number = Date.now()): void {
  try {
    const stale: string[] = [];
    const prefix = sessionKey('');
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key === null || !key.startsWith(prefix)) continue;
      let savedAt: unknown;
      try {
        savedAt = (JSON.parse(window.localStorage.getItem(key) ?? 'null') as { savedAt?: unknown })
          ?.savedAt;
      } catch {
        savedAt = undefined;
      }
      if (typeof savedAt !== 'number' || now - savedAt > SESSION_MAX_AGE_MS) stale.push(key);
    }
    for (const key of stale) remove(key);
  } catch {
    // Storage unavailable: nothing to prune.
  }
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
