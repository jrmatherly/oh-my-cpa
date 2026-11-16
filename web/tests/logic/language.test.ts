/**
 * The reading language a visit starts in.
 *
 * This fork reads English only. The resolution order upstream built stays - a saved choice, then
 * the deployment's `OMCPA_DEFAULT_LANGUAGE`, then the browser - and every path through it has to
 * land on a language the console has, whatever a stale profile or another deployment left behind.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { DEFAULT_LANG, LANGUAGES, languageLocale, matchBrowserLanguage, resolveInitialLang } from '../../src/i18n/language.ts';

test('the console registers English and nothing else', () => {
  assert.deepEqual(LANGUAGES.map((language) => language.id), ['en']);
  assert.equal(DEFAULT_LANG, 'en');
});

test('the document ships the language a first visit reads', () => {
  const indexHTML = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.equal(/<html lang="([^"]+)">/.exec(indexHTML)?.[1], languageLocale(DEFAULT_LANG));
});

test('a language the console no longer reads falls through to English', () => {
  // A browser profile from before the fork dropped the other catalogs still stores one of these.
  for (const stale of ['zh', 'zh-Hant', 'ms', 'klingon', 'toString', null, '']) {
    assert.equal(resolveInitialLang(stale, undefined, []), 'en', String(stale));
    assert.equal(resolveInitialLang(null, stale, ['zh-CN', 'ja-JP']), 'en', String(stale));
  }
});

test('a browser tag is matched by its primary subtag', () => {
  assert.equal(matchBrowserLanguage(['en-GB']), 'en');
  assert.equal(matchBrowserLanguage(['ja-JP', 'en-US']), 'en', 'the order of preference decides');
  assert.equal(matchBrowserLanguage(['zh-CN', 'ms-MY']), undefined);
});
