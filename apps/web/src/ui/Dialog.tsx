import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { useT } from '../i18n/useT.ts';
import { Button } from './Button.tsx';

export interface DialogProps {
  title: string;
  /** Without it the dialog cannot be dismissed (Escape, backdrop and the close button are off). */
  onClose?: () => void;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

/**
 * Modal dialog. On mount it moves focus to its first focusable element, keeps Tab and Shift+Tab
 * inside, closes on Escape (when dismissible) and gives focus back to the opener when it unmounts.
 */
export function Dialog({ title, onClose, children }: DialogProps) {
  const t = useT();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // Read through a ref so a parent re-render with a new callback never re-runs the effects.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = panel.current;
    if (el) (focusableIn(el)[0] ?? el).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = focusableIn(panel.current);
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) {
        e.preventDefault();
        panel.current.focus();
        return;
      }
      const active = document.activeElement;
      if (!panel.current.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panel}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
        {onClose && <Button onClick={onClose}>{t('common.close')}</Button>}
      </div>
    </div>
  );
}
