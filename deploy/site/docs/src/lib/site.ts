import { AGENT_GUIDE_URL, GITHUB_URL, SITE_ORIGIN } from '../../../site-meta.mjs';

/** Facts shared by every page of the public site. */
export { AGENT_GUIDE_URL, GITHUB_URL, SITE_ORIGIN };
export const GITHUB_SOURCE = `${GITHUB_URL}/blob/main`;

export type Lang = 'en';

/** The fork publishes one language; the route segment stays so page addresses match upstream's. */
export function asLang(_value: string): Lang {
  return 'en';
}

/** The prompt a reader pastes into a coding agent; it must match `docs/install-for-agents.md`. */
export const AGENT_PROMPT: Record<Lang, string> = {
  en: `Install Oh My CPA for me by following\n${AGENT_GUIDE_URL}`,
};

/** Docs pages are published at `/docs/<lang>/<slug>/` with a Markdown twin at `/docs/<lang>/<slug>.md`. */
export function docsPath(lang: Lang, slugs: string[] = []): string {
  return slugs.length ? `/docs/${lang}/${slugs.join('/')}/` : `/docs/${lang}/`;
}

export function markdownPath(lang: Lang, slugs: string[]): string {
  return `/docs/${lang}/${slugs.join('/')}.md`;
}
