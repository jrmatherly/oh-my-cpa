/**
 * The console's reading-language registry.
 *
 * Kept in its own module because language identity is read by non-React code too:
 * the heatmap's date formatter, the HTML `lang` attribute, and the catalogs. A registry
 * buried in the React provider would force those modules to import a component file just
 * to read a locale tag.
 *
 * `name` is the language's **endonym** - its own name in its own script - and is
 * deliberately not translated. A switcher that renamed a language to its English
 * name would be unusable by exactly the reader who needs it: someone who
 * cannot read the console's current language cannot recognize their own behind a
 * translation of it, and would have no way back out. `id` and `code` are likewise
 * stable in every reading.
 *
 * `locale` is the BCP 47 tag used for `Intl` and `document.documentElement.lang`.
 * It is separate from `id` because a stored id is a stable internal key, not a
 * locale tag.
 */
export interface LanguageOption {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly locale: string;
}

// This fork reads English only. The registry, the provider and the catalog loader stay as upstream
// built them to keep merges small. Do not add a row: english-only.sh removes any other catalog.
export const LANGUAGES = [
  { id: 'en', name: 'English', code: 'EN', locale: 'en' },
] as const satisfies readonly LanguageOption[];

export type Lang = (typeof LANGUAGES)[number]['id'];

/**
 * The language a visit reads when nothing else names one: no choice saved in this browser, no
 * language pinned by the deployment, and a browser asking for a language the console does not
 * read. It is shipped with the entry, which is what makes it a fallback at all: a deferred
 * catalog that failed is exactly the one that could not be fetched.
 */
export const DEFAULT_LANG: Lang = 'en';

export function isLang(value: unknown): value is Lang {
  return LANGUAGES.some((language) => language.id === value);
}

/**
 * The registered language a browser's preferred tags ask for, or `undefined` when they name none.
 *
 * Tags are matched by primary subtag, because a region is not a reading language: `en-GB` and
 * `en-US` both read `en`.
 */
export function matchBrowserLanguage(tags: readonly string[]): Lang | undefined {
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) continue;
    const primary = normalized.split('-')[0];
    const match = LANGUAGES.find((language) => language.locale.toLowerCase().split('-')[0] === primary);
    if (match) return match.id;
  }
  return undefined;
}

/**
 * The reading language a visit starts in: the choice this browser saved, else the language the
 * deployment pinned (`OMCPA_DEFAULT_LANGUAGE`), else the first language the browser asks for that
 * the console reads, else the built-in one.
 *
 * An unrecognized value falls through to the next source, so a stale stored id, or a document
 * served without runtime configuration, still renders a language the console has rather than
 * nothing.
 */
export function resolveInitialLang(
  stored: unknown,
  configuredDefault: unknown,
  browserLanguages: readonly string[],
): Lang {
  if (isLang(stored)) return stored;
  if (isLang(configuredDefault)) return configuredDefault;
  return matchBrowserLanguage(browserLanguages) ?? DEFAULT_LANG;
}

/** The BCP 47 tag for a reading language, for Intl and the document element. */
export function languageLocale(lang: Lang): string {
  return LANGUAGES.find((language) => language.id === lang)?.locale ?? 'en';
}
