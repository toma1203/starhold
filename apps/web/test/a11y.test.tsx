import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createT, en, hr } from '@starhold/i18n';
import { readWebFile } from './paths.ts';
import { App } from '../src/App.tsx';
import { LobbyScreen } from '../src/screens/LobbyScreen.tsx';
import { Toasts } from '../src/ui/Toasts.tsx';
import { MuteToggle } from '../src/ui/MuteToggle.tsx';
import { bindSocket, useGameStore } from '../src/store/gameStore.ts';
import { FakeSocket } from './fakeSocket.ts';
import { loadMuted } from '../src/net/session.ts';
import type { RoomInfo } from '@starhold/protocol';

const t = createT('en');
const css = (name: string) => readWebFile('src', 'styles', name);

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const tokens = Object.fromEntries(
  [...css('tokens.css').matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [
    m[1],
    m[2],
  ]),
) as Record<string, string>;

function room(over: Partial<RoomInfo> = {}): RoomInfo {
  return {
    code: 'ABCDE',
    phase: 'LOBBY',
    hostId: 'p1',
    seats: [
      { playerId: 'p1', name: 'Nova', isBot: false, botLevel: null, connected: true, afk: false },
    ],
    settings: { targetVp: 8, turnSeconds: 90 },
    you: 'p1',
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  useGameStore.setState({ ...useGameStore.getInitialState(), locale: 'en' }, true);
});

describe('colour contrast (tokens)', () => {
  const surfaces = ['bg', 'bg-raised', 'surface', 'surface-hover'];
  const texts = ['text', 'text-muted', 'accent', 'danger', 'success', 'warning'];

  it.each(texts.flatMap((fg) => surfaces.map((bg) => [fg, bg] as const)))(
    '%s on %s is at least 4.5:1',
    (fg, bg) => {
      expect(tokens[fg], fg).toBeDefined();
      expect(tokens[bg], bg).toBeDefined();
      expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(['accent', 'accent-strong'])('on-accent text on %s is at least 4.5:1', (bg) => {
    expect(contrast(tokens['on-accent']!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('focus ring', () => {
  it('keeps a transparent outline so forced-colors mode still shows a ring', () => {
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(css('app.css'))?.[1] ?? '';
    expect(rule).toMatch(/outline:\s*2px solid transparent/);
    expect(rule).toMatch(/box-shadow:\s*var\(--focus-ring\)/);
  });
});

describe('language and mute', () => {
  it('setLocale updates the html lang attribute', () => {
    useGameStore.getState().setLocale('hr');
    expect(document.documentElement.lang).toBe('hr');
    useGameStore.getState().setLocale('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('MuteToggle is a labelled button that flips and stores the preference', () => {
    render(<MuteToggle />);
    const button = screen.getByRole('button', { name: t('common.mute') });
    act(() => button.click());
    expect(useGameStore.getState().muted).toBe(true);
    expect(loadMuted()).toBe(true);
    expect(screen.getByRole('button', { name: t('common.unmute') })).toBeTruthy();
  });
});

describe('lobby accessibility (R18c)', () => {
  it('gives the invite input its own label, distinct from the copy button', () => {
    useGameStore.setState({ room: room() });
    render(<LobbyScreen />);
    const input = screen.getByLabelText(t('lobby.inviteLink'));
    expect((input as HTMLInputElement).value).toContain('/room/ABCDE');
    expect(t('lobby.inviteLink')).not.toBe(t('lobby.copyLink'));
    expect(screen.queryByLabelText(t('lobby.copyLink'))).toBeNull();
  });

  it('a disabled Start button points at the hint that explains why', () => {
    useGameStore.setState({ room: room() });
    render(<LobbyScreen />);
    const start = screen.getByRole('button', { name: t('lobby.start') });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    const hint = document.getElementById(start.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toBe(t('lobby.needPlayers'));
  });

  it('an enabled Start button has no stale description', () => {
    useGameStore.setState({
      room: room({
        seats: [
          {
            playerId: 'p1',
            name: 'Nova',
            isBot: false,
            botLevel: null,
            connected: true,
            afk: false,
          },
          {
            playerId: 'b1',
            name: 'Bot',
            isBot: true,
            botLevel: 'easy',
            connected: true,
            afk: false,
          },
        ],
      }),
    });
    render(<LobbyScreen />);
    expect(
      screen.getByRole('button', { name: t('lobby.start') }).hasAttribute('aria-describedby'),
    ).toBe(false);
  });
});

describe('connection banner (R18e)', () => {
  const reconnecting = () => screen.queryAllByText(t('game.reconnecting'));

  it('shows nothing before the very first connect', () => {
    render(<App />);
    expect(reconnecting()).toHaveLength(0);
  });

  it('shows nothing when the very first connection attempt fails', () => {
    useGameStore.setState({ connection: 'offline' });
    render(<App />);
    expect(reconnecting()).toHaveLength(0);
  });

  it('shows the banner after a connection was lost, exactly once', () => {
    useGameStore.setState({
      connection: 'offline',
      hasConnected: true,
      room: room({ phase: 'IN_GAME' }),
    });
    window.history.replaceState(null, '', '/room/ABCDE');
    localStorage.setItem(
      'starhold.session.ABCDE',
      JSON.stringify({ playerId: 'p1', token: 'x'.repeat(32) }),
    );
    render(<App />);
    expect(reconnecting()).toHaveLength(1);
  });

  it('offers "Try again" only after 3 failed attempts, and the button reconnects', async () => {
    const socket = new FakeSocket();
    bindSocket(socket.asSocket());
    socket.trigger('connect');
    socket.trigger('disconnect');
    render(<App />);
    const retry = () => screen.queryByRole('button', { name: t('common.retry') });
    for (let attempt = 1; attempt <= 2; attempt++) {
      act(() => socket.trigger('connect_error', new Error('down')));
      expect(retry(), `after ${attempt} failures`).toBeNull();
    }
    act(() => socket.trigger('connect_error', new Error('down')));
    expect(reconnecting()).toHaveLength(1);
    await userEvent.setup().click(screen.getByRole('button', { name: t('common.retry') }));
    expect(socket.connectCalls).toBe(1);
    act(() => socket.trigger('connect'));
    expect(retry()).toBeNull();
  });

  it('hides it once back online', () => {
    useGameStore.setState({ connection: 'online', hasConnected: true });
    render(<App />);
    expect(reconnecting()).toHaveLength(0);
  });
});

describe('toasts', () => {
  it('announce through a status region that is not a list (aria-allowed-role)', () => {
    useGameStore.getState().pushToast('lobby.linkCopied');
    const { container } = render(<Toasts />);
    const region = container.querySelector('[role="status"]');
    expect(region?.tagName).toBe('DIV');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.textContent).toContain(t('lobby.linkCopied'));
  });
});

describe('dictionaries', () => {
  it('no longer carries the unused game.timer key', () => {
    expect(Object.keys(en)).not.toContain('game.timer');
    expect(Object.keys(hr)).not.toContain('game.timer');
    expect(Object.keys(en)).toContain('game.timerValue');
  });

  it('has the new keys in both locales', () => {
    for (const key of [
      'err.offline',
      'lobby.inviteLink',
      'game.loading',
      'end.rank',
      'end.player',
      'end.sectors',
      'end.conquests',
    ] as const) {
      expect(en[key], key).toBeTruthy();
      expect(hr[key], key).toBeTruthy();
    }
    expect(en['err.offline']).toBe("You're offline — check your connection.");
    expect(hr['err.offline']).toBe('Nisi povezan — provjeri vezu.');
  });
});
