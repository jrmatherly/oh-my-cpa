import type { Catalog } from './catalog';
import type { Lang } from './language';
import en from './locales/en';

/**
 * Where each registered language's copy comes from.
 *
 * English is bundled with the entry: it is the only language this fork reads, and the fallback
 * the loader names. A catalog added later can be its own chunk, as a function that imports it.
 *
 * `Record<Lang, ...>` is what turns a new registry row into a compile error here until its
 * catalog is supplied.
 */
export const CATALOGS: Record<Lang, Catalog | (() => Promise<Catalog>)> = {
  en,
};
