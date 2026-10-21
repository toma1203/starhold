import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createT } from '@starhold/i18n';
import type { GameState } from '@starhold/engine';
import { EndScreen } from '../src/screens/EndScreen.tsx';
import { useGameStore } from '../src/store/gameStore.ts';
import { homeOf, makeState, patchSector, seedGame } from './fixtures.ts';

const t = createT('en');
const hr = createT('hr');

/** Three players, p2 won with a starbase, p3 has two conquests; p1 and p3 tie on everything else. */
function finished(reason: 'target' | 'roundLimit' = 'target'): GameState {
  const start = makeState(3, 1);
  const base = patchSector(start, homeOf(start, 'p2'), { structure: 'starbase' });
  return {
    ...base,
    phase: 'FINISHED',
    winner: 'p2',
    endReason: reason,
    players: base.players.map((p) => (p.id === 'p3' ? { ...p, conquests: 2 } : p)),
  };
}

function setup(me: string, state = finished(), locale: 'en' | 'hr' = 'en') {
  const spies = { rematch: vi.fn(), leaveRoom: vi.fn() };
  seedGame(state, me);
  const room = useGameStore.getState().room;
  if (room === null) throw new Error('seedGame did not create a room');
  useGameStore.setState({ locale, room: { ...room, phase: 'FINISHED' }, ...spies });
  window.history.replaceState(null, '', '/room/ABCDE');
  render(<EndScreen />);
  return spies;
}

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ ...useGameStore.getInitialState(), locale: 'en' }, true);
});

describe('EndScreen', () => {
  it('shows the winner and why the game ended', () => {
    setup('p1');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      t('end.winner', { player: 'Pilot 2' }),
    );
    expect(screen.getByText(t('end.reasonTarget'))).toBeTruthy();
  });

  it('says so when the round limit ended the game', () => {
    setup('p1', finished('roundLimit'));
    expect(screen.getByText(t('end.reasonRoundLimit'))).toBeTruthy();
    expect(screen.queryByText(t('end.reasonTarget'))).toBeNull();
  });

  it('is localised', () => {
    setup('p1', finished(), 'hr');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      hr('end.winner', { player: 'Pilot 2' }),
    );
  });

  it('ranks everybody by points with sectors and conquests', () => {
    setup('p1');
    const table = screen.getByRole('table', { name: t('end.ranking') });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual([
      t('end.rank'),
      t('end.player'),
      t('game.vp'),
      t('end.sectors'),
      t('end.conquests'),
    ]);
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      );
    // Starbase = 2 VP; the 1-VP tie is broken by seat order.
    expect(rows).toEqual([
      ['1', 'Pilot 2', '2', '1', '0'],
      ['2', `Pilot 1${t('lobby.you')}`, '1', '1', '0'],
      ['3', 'Pilot 3', '1', '1', '2'],
    ]);
  });

  it('shows Rematch to the host, who can press it', async () => {
    const host = setup('p1');
    await userEvent.setup().click(screen.getByRole('button', { name: t('end.rematch') }));
    expect(host.rematch).toHaveBeenCalledTimes(1);
  });

  it('has no Rematch button for a guest', () => {
    setup('p2');
    expect(screen.queryByRole('button', { name: t('end.rematch') })).toBeNull();
    expect(screen.getByRole('button', { name: t('end.home') })).toBeTruthy();
  });

  it('Back to start leaves the room and goes home', async () => {
    const spies = setup('p2');
    await userEvent.setup().click(screen.getByRole('button', { name: t('end.home') }));
    expect(spies.leaveRoom).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/');
  });

  it('announces the result in a polite live region', async () => {
    setup('p1');
    const region = document.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    // Filled after mount, so screen readers treat it as news rather than initial content.
    await screen.findByText(`${t('end.winner', { player: 'Pilot 2' })} ${t('end.reasonTarget')}`, {
      selector: '[aria-live="polite"]',
    });
  });

  it('does not break when the game has no recorded winner', () => {
    const state = { ...finished(), winner: null };
    setup('p1', state);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      t('end.winner', { player: 'Pilot 2' }),
    );
  });

  it('waits for the game state when only the room is known', () => {
    useGameStore.setState({
      room: {
        code: 'ABCDE',
        phase: 'FINISHED',
        hostId: 'p1',
        seats: [],
        settings: { targetVp: 8, turnSeconds: 90 },
        you: 'p1',
      },
    });
    render(<EndScreen />);
    expect(screen.getByText(t('game.loading'))).toBeTruthy();
  });
});
