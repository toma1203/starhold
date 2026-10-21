import { Link } from 'wouter';
import type { MessageKey } from '@starhold/i18n';
import { useT } from '../i18n/useT.ts';

/** Stand-in for the rules, privacy and credits pages until their content lands. */
export function TitlePage({ titleKey }: { titleKey: MessageKey }) {
  const t = useT();
  return (
    <main className="screen">
      <h1>{t(titleKey)}</h1>
      <Link href="/">{t('common.back')}</Link>
    </main>
  );
}
