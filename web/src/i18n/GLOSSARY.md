# Glossary

One word per concept. The console's copy is read by operators who compare two windows side by
side, so a concept that changes its name between two screens reads as two different things:
"supplier" here and "provider" there is a support question, not a style preference.

This fork reads English only, so the table has one language. Upstream's rows for Simplified
Chinese, Traditional Chinese and Malay went with those catalogs.

This file is also executable. A row under **Enforced** names the variant the catalog must not use,
and `pnpm check-i18n` fails on any occurrence of it, including one inside a longer sentence.

## Enforced

| Language | Concept | Use | Not | Why |
| --- | --- | --- | --- | --- |
| `en` | provider | provider | supplier | The catalog's own usage: it never writes "supplier". |

The machine-readable half of the table is the `glossary-enforced` block at the end of this file. A
row here without a line there is a row the gate does not check.

## Terms the console writes one way

Product names (Devin, Claude Code, Codex, OpenRouter), protocol names (OAuth, SSE, MCP, Base URL),
units the operator reads as units (`ms`, `TPS`, `RPM`), and the `stdio` transport are written the
same way everywhere. They are proper nouns, and `pnpm check-i18n` does not report them.

## Numbers, dates and placeholders

Placeholders (`{n}`, `{count}`) keep their name wherever a sentence is reworded, and an ICU plural
always carries an `other` branch. A catalog sentence holds words, not digits: dates and times are
formatted through `Intl` with the reading language's locale.

Grouping and compact suffixes (`1,234`, `12.3K`) come from `Intl.NumberFormat('en')`, so two
tables never disagree about the same column. `web/src/types/tokenDisplay.ts` is where that
formatting lives.

## Enforced spellings, for the gate

```glossary-enforced
en	supplier	provider
```
