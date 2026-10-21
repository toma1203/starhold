import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSession,
  loadLocale,
  loadMuted,
  loadNickname,
  loadSession,
  saveLocale,
  saveMuted,
  saveNickname,
  saveSession,
} from '../src/net/session.ts';

const TOKEN = 'a'.repeat(32);

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('session storage', () => {
  it('round-trips a session per room code', () => {
    saveSession('ABCDE', { playerId: 'p1', token: TOKEN });
    saveSession('FGHJK', { playerId: 'p2', token: TOKEN });
    expect(loadSession('ABCDE')).toEqual({ playerId: 'p1', token: TOKEN });
    expect(loadSession('FGHJK')).toEqual({ playerId: 'p2', token: TOKEN });
    clearSession('ABCDE');
    expect(loadSession('ABCDE')).toBeNull();
    expect(loadSession('FGHJK')).not.toBeNull();
  });

  it('returns null for corrupt or wrongly shaped stored sessions', () => {
    localStorage.setItem('starhold.session.ABCDE', '{not json');
    expect(loadSession('ABCDE')).toBeNull();
    localStorage.setItem('starhold.session.ABCDE', JSON.stringify({ playerId: 5 }));
    expect(loadSession('ABCDE')).toBeNull();
  });

  it('round-trips nickname, locale and muted with defaults', () => {
    expect(loadNickname()).toBe('');
    expect(loadLocale()).toBeNull();
    expect(loadMuted()).toBe(false);
    saveNickname('Nova');
    saveLocale('hr');
    saveMuted(true);
    expect(loadNickname()).toBe('Nova');
    expect(loadLocale()).toBe('hr');
    expect(loadMuted()).toBe(true);
  });

  it('ignores an unknown stored locale', () => {
    localStorage.setItem('starhold.locale', 'de');
    expect(loadLocale()).toBeNull();
  });

  it('session functions return null and do not throw when localStorage throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveSession('ABCDE', { playerId: 'p', token: TOKEN })).not.toThrow();
    expect(loadSession('ABCDE')).toBeNull();
    expect(() => clearSession('ABCDE')).not.toThrow();
    expect(loadNickname()).toBe('');
    expect(() => saveNickname('x')).not.toThrow();
    expect(loadLocale()).toBeNull();
    expect(() => saveLocale('en')).not.toThrow();
    expect(loadMuted()).toBe(false);
    expect(() => saveMuted(true)).not.toThrow();
  });

  it('does not throw when individual storage calls throw (quota, private mode)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => saveSession('ABCDE', { playerId: 'p', token: TOKEN })).not.toThrow();
    expect(loadSession('ABCDE')).toBeNull();
    expect(() => clearSession('ABCDE')).not.toThrow();
    expect(loadMuted()).toBe(false);
  });
});
