import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createT } from '@starhold/i18n';
import { useGameStore } from '../src/store/gameStore.ts';
import { Dialog } from '../src/ui/Dialog.tsx';
import { ErrorBoundary } from '../src/ui/ErrorBoundary.tsx';
import { Toasts, TOAST_MS } from '../src/ui/Toasts.tsx';

const t = createT('en');

beforeEach(() => {
  localStorage.clear();
  useGameStore.setState({ ...useGameStore.getInitialState(), locale: 'en' }, true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Toasts', () => {
  it('renders translated toasts with params and dismisses them by button', async () => {
    useGameStore.getState().pushToast('lobby.room', { code: 'ABCDE' });
    render(<Toasts />);
    expect(screen.getByText(t('lobby.room', { code: 'ABCDE' }))).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: t('common.close') }));
    expect(useGameStore.getState().toasts).toHaveLength(0);
  });

  it('dismisses a toast by itself after a few seconds', () => {
    vi.useFakeTimers();
    useGameStore.getState().pushToast('lobby.linkCopied');
    render(<Toasts />);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS + 1);
    });
    expect(useGameStore.getState().toasts).toHaveLength(0);
  });
});

describe('Dialog', () => {
  it('is labelled by its title and closes on Escape, backdrop and the close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <Dialog title="Hello" onClose={onClose}>
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(container.querySelector('.dialog-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: t('common.close') }));
    expect(onClose).toHaveBeenCalledTimes(3);
    await user.click(screen.getByText('body'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('ErrorBoundary', () => {
  it('shows a translated fallback with a reload button when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Boom(): never {
      throw new Error('boom');
    }
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(t('common.somethingWrong'))).toBeTruthy();
    expect(screen.getByRole('button', { name: t('common.reload') })).toBeTruthy();
  });
});
