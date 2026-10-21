import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createT } from '@starhold/i18n';
import type { RoomInfo } from '@starhold/protocol';
import { AppRoutes } from '../src/routes.tsx';
import { Toasts } from '../src/ui/Toasts.tsx';
import { bindSocket, useGameStore } from '../src/store/gameStore.ts';
import { loadSession, saveSession } from '../src/net/session.ts';
import { FakeSocket } from './fakeSocket.ts';
import { makeState, seedGame } from './fixtures.ts';

const t = createT('en');
const TOKEN = 'c'.repeat(32);

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

let socket: FakeSocket;

function visit(path: string) {
  window.history.replaceState(null, '', path);
}

beforeEach(() => {
  localStorage.clear();
  visit('/');
  useGameStore.setState({ ...useGameStore.getInitialState(), locale: 'en' }, true);
  socket = new FakeSocket();
  bindSocket(socket.asSocket());
});

describe('routes', () => {
  it('renders home at /', () => {
    render(<AppRoutes />);
    expect(screen.getByRole('button', { name: t('home.create') })).toBeTruthy();
  });

  it.each([
    ['/rules', 'pages.rules.title'],
    ['/privacy', 'pages.privacy.title'],
    ['/credits', 'pages.credits.title'],
  ] as const)('%s renders its page', (path, key) => {
    visit(path);
    render(<AppRoutes />);
    expect(screen.getByRole('heading', { name: t(key) })).toBeTruthy();
  });

  it('unknown paths render the not-found page', () => {
    visit('/nope/at/all');
    render(<AppRoutes />);
    expect(screen.getByRole('heading', { name: t('pages.notFound.title') })).toBeTruthy();
    expect(screen.getByRole('link', { name: t('pages.notFound.back') }).getAttribute('href')).toBe(
      '/',
    );
  });
});

describe('room route', () => {
  it('without a session shows the nickname form and joins on submit', async () => {
    visit('/room/ABCDE');
    const joinRoom = vi.fn().mockResolvedValue(true);
    useGameStore.setState({ joinRoom });
    localStorage.setItem('starhold.nickname', 'Vega');
    render(<AppRoutes />);
    const input = screen.getByLabelText(t('home.nickname'));
    expect(input).toHaveProperty('value', 'Vega');
    await userEvent.setup().click(screen.getByRole('button', { name: t('home.join') }));
    expect(joinRoom).toHaveBeenCalledWith('ABCDE', 'Vega');
  });

  it('the join form needs a nickname', () => {
    visit('/room/ABCDE');
    render(<AppRoutes />);
    expect(screen.getByRole('button', { name: t('home.join') })).toHaveProperty('disabled', true);
  });

  it('with a session waits for the rejoin, then shows the lobby', () => {
    visit('/room/ABCDE');
    saveSession('ABCDE', { playerId: 'p1', token: TOKEN });
    render(<AppRoutes />);
    expect(screen.queryByLabelText(t('home.nickname'))).toBeNull();
    expect(screen.getByText(t('game.loading'))).toBeTruthy();
    act(() => socket.trigger('connect'));
    expect(socket.sent('room:rejoin')).toHaveLength(1);
    act(() => socket.trigger('room:state', room()));
    expect(screen.getByText(t('lobby.room', { code: 'ABCDE' }))).toBeTruthy();
  });

  it('a failed rejoin explains it and sends the player home', async () => {
    visit('/room/ABCDE');
    saveSession('ABCDE', { playerId: 'p1', token: TOKEN });
    render(
      <>
        <AppRoutes />
        <Toasts />
      </>,
    );
    act(() => socket.trigger('connect'));
    await act(async () => socket.ack('room:rejoin', { ok: false, error: 'err.roomNotFound' }));
    expect(loadSession('ABCDE')).toBeNull();
    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('button', { name: t('home.create') })).toBeTruthy();
    expect(screen.getByText(t('room.closed.gone'))).toBeTruthy();
  });

  it('rejoins when the page is opened while the socket is already online', () => {
    saveSession('ABCDE', { playerId: 'p1', token: TOKEN });
    socket.trigger('connect');
    expect(socket.sent('room:rejoin')).toHaveLength(0);
    visit('/room/ABCDE');
    render(<AppRoutes />);
    expect(socket.sent('room:rejoin')).toHaveLength(1);
  });

  it('shows the game screen for a running game and the end screen once it is finished', () => {
    visit('/room/ABCDE');
    saveSession('ABCDE', { playerId: 'p1', token: TOKEN });
    useGameStore.setState({ room: room({ phase: 'IN_GAME' }), activeCode: 'ABCDE' });
    const { unmount } = render(<AppRoutes />);
    // the room is known, the first game state is not: GameScreen waits for it
    expect(screen.getByText(t('game.loading'))).toBeTruthy();
    seedGame(makeState(3, 1), 'p1');
    unmount();
    render(<AppRoutes />);
    expect(screen.getByRole('group', { name: t('map.title') })).toBeTruthy();
    cleanup();
    seedGame({ ...makeState(3, 1), phase: 'FINISHED', winner: 'p2', endReason: 'target' }, 'p1');
    useGameStore.setState({ room: room({ phase: 'FINISHED' }), activeCode: 'ABCDE' });
    render(<AppRoutes />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      t('end.winner', { player: 'Pilot 2' }),
    );
  });

  it('room:closed shows a toast and returns home', () => {
    visit('/room/ABCDE');
    saveSession('ABCDE', { playerId: 'p1', token: TOKEN });
    useGameStore.setState({ room: room(), activeCode: 'ABCDE' });
    render(
      <>
        <AppRoutes />
        <Toasts />
      </>,
    );
    act(() => socket.trigger('room:closed', { reason: 'expired' }));
    expect(screen.getByText(t('room.closed.expired'))).toBeTruthy();
    expect(screen.getByRole('button', { name: t('home.create') })).toBeTruthy();
  });
});
