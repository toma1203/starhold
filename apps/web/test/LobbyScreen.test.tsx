import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createT } from '@starhold/i18n';
import type { RoomInfo, SeatInfo } from '@starhold/protocol';
import { LobbyScreen } from '../src/screens/LobbyScreen.tsx';
import { useGameStore } from '../src/store/gameStore.ts';

const t = createT('en');

function seat(id: string, name: string, over: Partial<SeatInfo> = {}): SeatInfo {
  return { playerId: id, name, isBot: false, botLevel: null, connected: true, afk: false, ...over };
}

function room(over: Partial<RoomInfo> = {}): RoomInfo {
  return {
    code: 'ABCDE',
    phase: 'LOBBY',
    hostId: 'p1',
    seats: [seat('p1', 'Nova'), seat('p2', 'Vega')],
    settings: { targetVp: 8, turnSeconds: 90 },
    you: 'p1',
    ...over,
  };
}

const actions = {
  addBot: vi.fn(),
  removeBot: vi.fn(),
  updateSettings: vi.fn(),
  startGame: vi.fn(),
  leaveRoom: vi.fn(),
};

function setRoom(r: RoomInfo) {
  useGameStore.setState({ room: r });
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  useGameStore.setState({ ...useGameStore.getInitialState(), locale: 'en', ...actions }, true);
  window.history.replaceState(null, '', '/room/ABCDE');
});

describe('LobbyScreen', () => {
  it('host sees add-bot and start; non-host does not', () => {
    setRoom(room());
    const { unmount } = render(<LobbyScreen />);
    expect(screen.getAllByRole('button', { name: new RegExp(t('lobby.addBot')) })).toHaveLength(2);
    expect(screen.getByRole('button', { name: t('lobby.start') })).toBeTruthy();
    unmount();

    setRoom(room({ you: 'p2' }));
    render(<LobbyScreen />);
    expect(screen.queryByRole('button', { name: new RegExp(t('lobby.addBot')) })).toBeNull();
    expect(screen.queryByRole('button', { name: t('lobby.start') })).toBeNull();
    expect(screen.getByText(t('lobby.waiting'))).toBeTruthy();
  });

  it('start disabled with 1 seat', () => {
    setRoom(room({ seats: [seat('p1', 'Nova')] }));
    render(<LobbyScreen />);
    expect(screen.getByRole('button', { name: t('lobby.start') })).toHaveProperty('disabled', true);
    expect(screen.getByText(t('lobby.needPlayers'))).toBeTruthy();
  });

  it('start is enabled with 2 seats and starts the game', async () => {
    setRoom(room());
    render(<LobbyScreen />);
    const start = screen.getByRole('button', { name: t('lobby.start') });
    expect(start).toHaveProperty('disabled', false);
    await userEvent.setup().click(start);
    expect(actions.startGame).toHaveBeenCalledTimes(1);
  });

  it('adds easy and normal bots', async () => {
    setRoom(room());
    render(<LobbyScreen />);
    const user = userEvent.setup();
    const [easy, normal] = screen.getAllByRole('button', { name: new RegExp(t('lobby.addBot')) });
    await user.click(easy!);
    await user.click(normal!);
    expect(actions.addBot.mock.calls).toEqual([['easy'], ['normal']]);
  });

  it('disables add-bot when all four seats are taken', () => {
    setRoom(
      room({
        seats: [seat('p1', 'A'), seat('p2', 'B'), seat('p3', 'C'), seat('p4', 'D')],
      }),
    );
    render(<LobbyScreen />);
    for (const b of screen.getAllByRole('button', { name: new RegExp(t('lobby.addBot')) })) {
      expect(b).toHaveProperty('disabled', true);
    }
  });

  it('lists seats with host, you and bot markers and removes only bots', async () => {
    setRoom(
      room({
        seats: [
          seat('p1', 'Nova'),
          seat('p2', 'Vega', { connected: false }),
          seat('b1', 'Bot Orion', { isBot: true, botLevel: 'easy' }),
        ],
      }),
    );
    render(<LobbyScreen />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText(t('lobby.host'))).toBeTruthy();
    expect(within(items[0]!).getByText(t('lobby.you'))).toBeTruthy();
    expect(within(items[1]!).getByLabelText(t('game.disconnected'))).toBeTruthy();
    expect(within(items[1]!).queryByRole('button')).toBeNull();
    expect(within(items[0]!).queryByRole('button')).toBeNull();
    await userEvent.setup().click(within(items[2]!).getByRole('button'));
    expect(actions.removeBot).toHaveBeenCalledWith('b1');
  });

  it('gives every seat its colour and shape', () => {
    setRoom(room());
    render(<LobbyScreen />);
    const markers = screen.getAllByTestId('player-marker');
    expect(markers.map((m) => m.getAttribute('data-shape'))).toEqual(['circle', 'square']);
    expect(markers.map((m) => m.getAttribute('data-color'))).toEqual(['#E69F00', '#56B4E9']);
  });

  it('host changes target and timer, non-host only reads them', async () => {
    setRoom(room());
    const { unmount } = render(<LobbyScreen />);
    const user = userEvent.setup();
    const target = screen.getByLabelText(t('lobby.settingsTarget'));
    const timer = screen.getByLabelText(t('lobby.settingsTimer'));
    expect([...(target as HTMLSelectElement).options].map((o) => o.value)).toEqual([
      '6',
      '8',
      '10',
    ]);
    expect([...(timer as HTMLSelectElement).options].map((o) => o.value)).toEqual([
      '60',
      '90',
      '120',
    ]);
    await user.selectOptions(target, '10');
    expect(actions.updateSettings).toHaveBeenLastCalledWith({ targetVp: 10, turnSeconds: 90 });
    await user.selectOptions(timer, '60');
    expect(actions.updateSettings).toHaveBeenLastCalledWith({ targetVp: 8, turnSeconds: 60 });
    unmount();

    setRoom(room({ you: 'p2' }));
    render(<LobbyScreen />);
    expect(screen.queryByLabelText(t('lobby.settingsTarget'))).toBeNull();
    expect(screen.getByText('8')).toBeTruthy();
  });

  it('copy link writes room URL', async () => {
    setRoom(room());
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<LobbyScreen />);
    await user.click(screen.getByRole('button', { name: t('lobby.copyLink') }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/room/ABCDE`);
    expect(useGameStore.getState().toasts.map((x) => x.key)).toEqual(['lobby.linkCopied']);
  });

  it('copy link falls back to selecting the link text when the clipboard is unavailable', async () => {
    setRoom(room());
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(<LobbyScreen />);
    await user.click(screen.getByRole('button', { name: t('lobby.copyLink') }));
    const link = screen.getByDisplayValue(
      `${window.location.origin}/room/ABCDE`,
    ) as HTMLInputElement;
    expect(link.selectionStart).toBe(0);
    expect(link.selectionEnd).toBe(link.value.length);
    expect(useGameStore.getState().toasts).toHaveLength(0);
  });

  it('shows the room code and leaves the room', async () => {
    setRoom(room());
    render(<LobbyScreen />);
    expect(screen.getByText(t('lobby.room', { code: 'ABCDE' }))).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: t('lobby.leave') }));
    expect(actions.leaveRoom).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/');
  });
});
