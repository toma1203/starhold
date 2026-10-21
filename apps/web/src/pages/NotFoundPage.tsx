import { Link } from 'wouter';
import { useT } from '../i18n/useT.ts';

export function NotFoundPage() {
  const t = useT();
  return (
    <main className="screen">
      <h1>{t('pages.notFound.title')}</h1>
      <p>{t('pages.notFound.body')}</p>
      <Link href="/">{t('pages.notFound.back')}</Link>
    </main>
  );
}
