import { en } from './en.ts';
import type { MessageKey } from './en.ts';
import { hr } from './hr.ts';

export { en, hr };
export type { MessageKey };

export type Locale = 'en' | 'hr';
export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, hr };

/** First browser language tag starting with `hr` selects Croatian; everything else is English. */
export function detectLocale(langs: readonly string[]): Locale {
  return langs.some((tag) => tag.toLowerCase().startsWith('hr')) ? 'hr' : 'en';
}

/** Replaces `{name}` in a single pass; a missing param stays as `{name}`. */
export function createT(locale: Locale): Translate {
  const dict = dictionaries[locale];
  return (key, params) =>
    dict[key].replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = params !== undefined && Object.hasOwn(params, name) ? params[name] : undefined;
      return value === undefined ? match : String(value);
    });
}

/** Picks a plural form. EN: one for 1, else other. HR: one / few / other (few falls back to other). */
export function plural(
  locale: Locale,
  n: number,
  forms: { one: string; few?: string; other: string },
): string {
  if (locale === 'en') return n === 1 ? forms.one : forms.other;
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms.one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few ?? forms.other;
  return forms.other;
}
