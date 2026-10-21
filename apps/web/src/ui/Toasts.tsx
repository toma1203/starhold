import { useEffect } from 'react';
import { useT } from '../i18n/useT.ts';
import { useGameStore } from '../store/gameStore.ts';
import type { Toast } from '../store/gameStore.ts';

export const TOAST_MS = 5000;

function ToastItem({ toast }: { toast: Toast }) {
  const t = useT();
  const dismiss = useGameStore((s) => s.dismissToast);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [dismiss, toast.id]);

  return (
    <li className="toast">
      <span>{t(toast.key, toast.params)}</span>
      <button
        type="button"
        className="toast-close"
        aria-label={t('common.close')}
        onClick={() => dismiss(toast.id)}
      >
        ×
      </button>
    </li>
  );
}

export function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  return (
    <ul className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </ul>
  );
}
