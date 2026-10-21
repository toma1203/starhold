import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createT, en } from '@starhold/i18n';
import type { Locale, MessageKey } from '@starhold/i18n';
import { CreditsPage } from '../src/pages/CreditsPage.tsx';
import { PrivacyPage } from '../src/pages/PrivacyPage.tsx';
import { RulesPage } from '../src/pages/RulesPage.tsx';
import { AppRoutes } from '../src/routes.tsx';
import { useGameStore } from '../src/store/gameStore.ts';

const keysOf = (prefix: string) =>
  (Object.keys(en) as MessageKey[]).filter((k) => k.startsWith(prefix));

function useLocale(locale: Locale) {
  useGameStore.setState({ ...useGameStore.getInitialState(), locale }, true);
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe.each(['en', 'hr'] as const)('static pages in %s', (locale) => {
  const t = createT(locale);

  it('RulesPage renders every rules key as text, with no raw keys', () => {
    useLocale(locale);
    const { container } = render(<RulesPage />);
    const text = container.textContent ?? '';
    for (const key of keysOf('pages.rules.')) expect(text, key).toContain(t(key));
    expect(text).not.toMatch(/\b(pages|game|common|end|err)\.[a-z]/);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t('pages.rules.title'));
  });

  it('RulesPage has one section heading per rules section', () => {
    useLocale(locale);
    render(<RulesPage />);
    const titles = keysOf('pages.rules.').filter(
      (k) => k.endsWith('.title') && k !== 'pages.rules.title',
    );
    expect(titles.length).toBeGreaterThanOrEqual(10);
    for (const key of titles) {
      expect(screen.getByRole('heading', { level: 2, name: t(key) }), key).toBeTruthy();
    }
  });

  it('PrivacyPage renders every privacy key and links the issue tracker', () => {
    useLocale(locale);
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? '';
    for (const key of keysOf('pages.privacy.')) expect(text, key).toContain(t(key));
    const link = screen.getByRole('link', { name: /github\.com\/toma1203\/starhold\/issues/ });
    expect(link.getAttribute('href')).toBe('https://github.com/toma1203/starhold/issues');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('CreditsPage renders every credits key', () => {
    useLocale(locale);
    const { container } = render(<CreditsPage />);
    const text = container.textContent ?? '';
    for (const key of keysOf('pages.credits.')) expect(text, key).toContain(t(key));
  });

  it('every page links back to the start page', () => {
    useLocale(locale);
    for (const Page of [RulesPage, PrivacyPage, CreditsPage]) {
      const { unmount } = render(<Page />);
      expect(screen.getByRole('link', { name: t('common.back') }).getAttribute('href')).toBe('/');
      unmount();
    }
  });
});

describe('PrivacyPage content', () => {
  it('mentions localStorage, the nickname in memory, and no analytics', () => {
    useLocale('en');
    const { container } = render(<PrivacyPage />);
    const text = container.textContent ?? '';
    expect(text).toContain('localStorage');
    expect(text).toMatch(/nickname[^.]*server memory/i);
    expect(text).toMatch(/no accounts, no analytics, no ads and no tracking cookies/i);
    expect(text).toMatch(/logs contain no nicknames/i);
  });

  it('the Croatian text also names localStorage', () => {
    expect(createT('hr')('pages.privacy.storage')).toContain('localStorage');
  });
});

describe('routes', () => {
  it.each([
    ['/rules', 'pages.rules.title'],
    ['/privacy', 'pages.privacy.title'],
    ['/credits', 'pages.credits.title'],
  ] as const)('%s renders its page rather than a title stand-in', (path, titleKey) => {
    useLocale('en');
    window.history.replaceState(null, '', path);
    const { container } = render(<AppRoutes />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(createT('en')(titleKey));
    expect((container.textContent ?? '').length).toBeGreaterThan(100);
  });
});
