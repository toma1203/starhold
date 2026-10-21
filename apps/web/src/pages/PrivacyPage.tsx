import { useT } from '../i18n/useT.ts';
import { PageShell } from './PageShell.tsx';

const ISSUES_PATH = 'github.com/toma1203/starhold/issues';

/** Turns the issue tracker address inside a sentence into a link; the rest stays plain text. */
function withIssueLink(text: string) {
  const at = text.indexOf(ISSUES_PATH);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <a href={`https://${ISSUES_PATH}`} target="_blank" rel="noopener noreferrer">
        {ISSUES_PATH}
      </a>
      {text.slice(at + ISSUES_PATH.length)}
    </>
  );
}

export function PrivacyPage() {
  const t = useT();
  return (
    <PageShell title={t('pages.privacy.title')}>
      <p className="lead">{t('pages.privacy.intro')}</p>
      <section className="panel">
        <p>{t('pages.privacy.memory')}</p>
        <p>{t('pages.privacy.storage')}</p>
        <p>{t('pages.privacy.none')}</p>
        <p>{t('pages.privacy.logs')}</p>
        <p>{withIssueLink(t('pages.privacy.contact'))}</p>
      </section>
    </PageShell>
  );
}
