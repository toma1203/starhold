import { useMemo } from 'react';
import { createT } from '@starhold/i18n';
import type { Translate } from '@starhold/i18n';
import { useGameStore } from '../store/gameStore.ts';

/** Translate function bound to the locale in the store; re-renders when the locale changes. */
export function useT(): Translate {
  const locale = useGameStore((s) => s.locale);
  return useMemo(() => createT(locale), [locale]);
}
