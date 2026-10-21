import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { useT } from '../i18n/useT.ts';
import { LanguageSwitch } from '../ui/LanguageSwitch.tsx';

/** Frame shared by the static pages: back link, language switch, then the page. */
export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  const t = useT();
  return (
    <main className="screen page">
      <nav className="page-nav">
        <Link href="/">{t('common.back')}</Link>
        <LanguageSwitch />
      </nav>
      <h1>{title}</h1>
      {children}
    </main>
  );
}
