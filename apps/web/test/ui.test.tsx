import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
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

describe('Dialog focus handling', () => {
  function Opener({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>open it</button>
        {open && (
          <Dialog
            title="Focus"
            onClose={() => {
              onClose?.();
              setOpen(false);
            }}
          >
            <input aria-label="first" />
            <input aria-label="second" />
          </Dialog>
        )}
      </>
    );
  }

  it('focuses the first focusable element on mount', () => {
    render(
      <Dialog title="Focus" onClose={() => undefined}>
        <input aria-label="first" />
        <input aria-label="second" />
      </Dialog>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText('first'));
  });

  it('falls back to the panel when nothing inside can take focus and no close handler exists', () => {
    render(
      <Dialog title="Plain">
        <p>text</p>
      </Dialog>,
    );
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Plain' }));
  });

  it('does not steal focus again when the parent re-renders with a new onClose', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Dialog title="Focus" onClose={() => undefined}>
        <input aria-label="first" />
        <input aria-label="second" />
      </Dialog>,
    );
    await user.click(screen.getByLabelText('second'));
    expect(document.activeElement).toBe(screen.getByLabelText('second'));
    rerender(
      <Dialog title="Focus" onClose={() => undefined}>
        <input aria-label="first" />
        <input aria-label="second" />
      </Dialog>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText('second'));
  });

  it('calls the latest onClose on Escape', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <Dialog title="Focus" onClose={first}>
        x
      </Dialog>,
    );
    rerender(
      <Dialog title="Focus" onClose={second}>
        x
      </Dialog>,
    );
    await userEvent.setup().keyboard('{Escape}');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside: last wraps to first, Shift+Tab from first wraps to last', async () => {
    const user = userEvent.setup();
    render(
      <Dialog title="Trap" onClose={() => undefined}>
        <input aria-label="first" />
        <input aria-label="second" />
      </Dialog>,
    );
    const close = screen.getByRole('button', { name: t('common.close') });
    expect(document.activeElement).toBe(screen.getByLabelText('first'));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(close);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('first'));
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('first'));
  });

  it('pulls focus back into the dialog when Tab is pressed while focus is outside', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>outside</button>
        <Dialog title="Trap" onClose={() => undefined}>
          <input aria-label="first" />
        </Dialog>
      </>,
    );
    screen.getByRole('button', { name: 'outside' }).focus();
    await user.tab();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('restores focus to the opener when it closes', async () => {
    const user = userEvent.setup();
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'open it' });
    await user.click(opener);
    expect(document.activeElement).toBe(screen.getByLabelText('first'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('is not dismissible and has no close button when onClose is omitted', async () => {
    render(
      <Dialog title="Locked">
        <input aria-label="only" />
      </Dialog>,
    );
    await userEvent.setup().keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Locked' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('common.close') })).toBeNull();
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
