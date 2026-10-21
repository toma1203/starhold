import { useT } from '../i18n/useT.ts';
import { PageShell } from './PageShell.tsx';

export function CreditsPage() {
  const t = useT();
  return (
    <PageShell title={t('pages.credits.title')}>
      <section className="panel">
        <p>{t('pages.credits.author')}</p>
        <p>{t('pages.credits.built')}</p>
        <p>{t('pages.credits.art')}</p>
        <p>{t('pages.credits.license')}</p>
      </section>
    </PageShell>
  );
}
