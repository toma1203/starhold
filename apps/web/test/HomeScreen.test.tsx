import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createT } from '@starhold/i18n';
import { HomeScreen } from '../src/screens/HomeScreen.tsx';
import { useGameStore } from '../src/store/gameStore.ts';
import { loadNickname } from '../src/net/session.ts';

const t = createT('en');

const createRoom = vi.fn<(name: string) => Promise<string | null>>();
const joinRoom = vi.fn<(code: string, name: string) => Promise<boolean>>();

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  createRoom.mockReset().mockResolvedValue('ABCDE');
  joinRoom.mockReset().mockResolvedValue(true);
  useGameStore.setState(
    { ...useGameStore.getInitialState(), locale: 'en', createRoom, joinRoom },
    true,
  );
});

describe('HomeScreen', () => {
  it('create button disabled until nickname non-empty', async () => {
    const user = userEvent.setup();
    render(<HomeScreen />);
    const create = screen.getByRole('button', { name: t('home.create') });
    expect(create).toHaveProperty('disabled', true);
    await user.type(screen.getByLabelText(t('home.nickname')), '   ');
    expect(create).toHaveProperty('disabled', true);
    await user.type(screen.getByLabelText(t('home.nickname')), 'Nova');
    expect(create).toHaveProperty('disabled', false);
  });

  it('create sends the trimmed nickname, saves it and opens the room', async () => {
    const user = userEvent.setup();
    render(<HomeScreen />);
    await user.type(screen.getByLabelText(t('home.nickname')), '  Nova ');
    await user.click(screen.getByRole('button', { name: t('home.create') }));
    expect(createRoom).toHaveBeenCalledWith('Nova');
    expect(loadNickname()).toBe('Nova');
    await waitFor(() => expect(window.location.pathname).toBe('/room/ABCDE'));
  });

  it('stays on the home page when creating fails', async () => {
    createRoom.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<HomeScreen />);
    await user.type(screen.getByLabelText(t('home.nickname')), 'Nova');
    await user.click(screen.getByRole('button', { name: t('home.create') }));
    expect(window.location.pathname).toBe('/');
  });

  it('prefills the saved nickname', () => {
    localStorage.setItem('starhold.nickname', 'Vega');
    render(<HomeScreen />);
    expect(screen.getByLabelText(t('home.nickname'))).toHaveProperty('value', 'Vega');
  });

  it('join uppercases code', async () => {
    const user = userEvent.setup();
    render(<HomeScreen />);
    await user.type(screen.getByLabelText(t('home.nickname')), 'Nova');
    const code = screen.getByLabelText(t('home.code'));
    await user.type(code, 'abcde');
    expect(code).toHaveProperty('value', 'ABCDE');
    await user.click(screen.getByRole('button', { name: t('home.join') }));
    expect(joinRoom).toHaveBeenCalledWith('ABCDE', 'Nova');
    await waitFor(() => expect(window.location.pathname).toBe('/room/ABCDE'));
  });

  it('join stays disabled without a nickname or a full code', async () => {
    const user = userEvent.setup();
    render(<HomeScreen />);
    const join = screen.getByRole('button', { name: t('home.join') });
    await user.type(screen.getByLabelText(t('home.code')), 'ABCDE');
    expect(join).toHaveProperty('disabled', true);
    await user.type(screen.getByLabelText(t('home.nickname')), 'Nova');
    expect(join).toHaveProperty('disabled', false);
    await user.clear(screen.getByLabelText(t('home.code')));
    await user.type(screen.getByLabelText(t('home.code')), 'AB');
    expect(join).toHaveProperty('disabled', true);
  });

  it('links to rules, privacy and credits', () => {
    render(<HomeScreen />);
    expect(screen.getByRole('link', { name: t('pages.rules.title') })).toHaveProperty(
      'pathname',
      '/rules',
    );
    expect(screen.getByRole('link', { name: t('pages.privacy.title') })).toHaveProperty(
      'pathname',
      '/privacy',
    );
    expect(screen.getByRole('link', { name: t('pages.credits.title') })).toHaveProperty(
      'pathname',
      '/credits',
    );
  });

  it('switches language through the language switch', async () => {
    const user = userEvent.setup();
    render(<HomeScreen />);
    await user.click(screen.getByRole('button', { name: 'Hrvatski' }));
    expect(useGameStore.getState().locale).toBe('hr');
    expect(screen.getByRole('button', { name: createT('hr')('home.create') })).toBeTruthy();
  });
});
