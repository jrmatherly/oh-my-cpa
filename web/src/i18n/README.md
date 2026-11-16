# The console's copy

The console's copy lives in `web/src/i18n/locales/en/`, one file per product area. This fork reads
English only, and that catalog is the typed source of every message id. Adding or changing a
sentence is a text edit in one file, with no build step beyond the checks below.

```
locales/
  en/<area>.ts    the catalog: its ids are the message ids
  en/index.ts     assembles the area files into one catalog
```

## Changing a sentence

1. Find the id. `grep -rn "the sentence" web/src/i18n/locales/en` names the file and the id, and
   `grep -rn "id.you.found" web/src --include=*.tsx` shows where it is rendered.
2. Edit the value, keeping the id.
3. Run `pnpm check-i18n`.

`pnpm check-i18n` is the gate. It checks that no id is defined twice, that braces and ICU plural
forms are well formed, that every id is referenced by some source file, that every registered Agent
capability has copy, that the spellings `GLOSSARY.md` has settled are the ones in use, and that no
`.ts` or `.tsx` source file under `web/src` holds a Chinese character. It cannot decide whether a sentence reads well.
That is `STYLE.md` and a reviewer.

## Adding a sentence

1. Add the id and the sentence to the area file that holds its siblings. A prefix can span files
   (`af.*` lives in `authFiles.ts`, `pg.*` in `agent.ts`), so place an id beside the ones it belongs
   with rather than guessing from its prefix.
2. Run `pnpm check-i18n` and `pnpm type-check`.
3. Write it where it is rendered with `t('your.id')`. The key is a `MessageKey`, so a typo does not
   compile.

## Copy chosen at runtime

Not every id is a literal. A server reports a category, a permission class, a warmup reason, and
the console has a sentence for the ones it knows:

- `prefixedKey('audit.cat.', category)` and `messageKey(id)` answer a `MessageKey` or `undefined`;
- `translateOr(t, id, fallback)` renders the fallback when the console has no sentence.

A new value the server starts reporting therefore needs a new catalog entry under the same prefix,
and until then it reads as itself rather than as a lookup key. `pnpm check-i18n` checks that
completeness against the list the server publishes for Agent capabilities only. Other families are
not checked, so adding the sentence is part of the server change.

## Other languages

This fork does not support adding a language. `language.ts` registers English alone.

## Files

| File | What it holds |
| --- | --- |
| `catalog.ts` | `MessageKey`, `Catalog`, `TFunc`, and the helpers that answer a key or `undefined` |
| `format.ts` | Placeholder filling and ICU plural selection |
| `language.ts` | The registry of reading languages, which holds English only |
| `resources.ts` | Where the catalog and the antd locale come from |
| `index.tsx` | The provider, the translator, and the `hasMessage`/`messageKey`/`translateOr` helpers |
| `GLOSSARY.md` | The word for each concept, and the variants the gate refuses |
| `STYLE.md` | How a sentence reads |
