import { useT } from '../i18n/useT.ts';
import { useGameStore } from '../store/gameStore.ts';
import type { Locale } from '@starhold/i18n';
import { Button } from './Button.tsx';

const LOCALES: readonly Locale[] = ['en', 'hr'];

export function LanguageSwitch() {
  const t = useT();
  const locale = useGameStore((s) => s.locale);
  const setLocale = useGameStore((s) => s.setLocale);
  return (
    <div className="language-switch" role="group" aria-label={t('common.language')}>
      {LOCALES.map((l) => (
        <Button
          key={l}
          variant="ghost"
          aria-pressed={l === locale}
          lang={l}
          onClick={() => setLocale(l)}
        >
          {t(`common.lang.${l}`)}
        </Button>
      ))}
    </div>
  );
}
