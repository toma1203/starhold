import type { MessageKey } from '@starhold/i18n';
import { useT } from '../i18n/useT.ts';
import { PageShell } from './PageShell.tsx';

interface Section {
  title: MessageKey;
  paragraphs: MessageKey[];
  /** Short list items that follow the paragraphs. */
  items?: MessageKey[];
}

const SECTIONS: Section[] = [
  {
    title: 'pages.rules.goal.title',
    paragraphs: ['pages.rules.goal.body', 'pages.rules.goal.timing'],
  },
  { title: 'pages.rules.map.title', paragraphs: ['pages.rules.map.body'] },
  { title: 'pages.rules.start.title', paragraphs: ['pages.rules.start.body'] },
  { title: 'pages.rules.roll.title', paragraphs: ['pages.rules.roll.body'] },
  { title: 'pages.rules.pirates.title', paragraphs: ['pages.rules.pirates.body'] },
  {
    title: 'pages.rules.trade.title',
    paragraphs: ['pages.rules.trade.bank', 'pages.rules.trade.players'],
  },
  {
    title: 'pages.rules.build.title',
    paragraphs: [],
    items: [
      'pages.rules.build.fleet',
      'pages.rules.build.colony',
      'pages.rules.build.starbase',
      'pages.rules.build.rule',
    ],
  },
  { title: 'pages.rules.expand.title', paragraphs: ['pages.rules.expand.body'] },
  {
    title: 'pages.rules.attack.title',
    paragraphs: ['pages.rules.attack.body', 'pages.rules.attack.conquest'],
  },
  { title: 'pages.rules.fortify.title', paragraphs: ['pages.rules.fortify.body'] },
  {
    title: 'pages.rules.awards.title',
    paragraphs: [],
    items: ['pages.rules.awards.largestEmpire', 'pages.rules.awards.warlord'],
  },
  { title: 'pages.rules.online.title', paragraphs: ['pages.rules.online.body'] },
];

/** The full rules, one section per topic. All copy comes from the dictionaries. */
export function RulesPage() {
  const t = useT();
  return (
    <PageShell title={t('pages.rules.title')}>
      <p className="lead">{t('pages.rules.intro')}</p>
      {SECTIONS.map((section) => (
        <section key={section.title} className="panel rules-section">
          <h2>{t(section.title)}</h2>
          {section.paragraphs.map((key) => (
            <p key={key}>{t(key)}</p>
          ))}
          {section.items && (
            <ul>
              {section.items.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </PageShell>
  );
}
