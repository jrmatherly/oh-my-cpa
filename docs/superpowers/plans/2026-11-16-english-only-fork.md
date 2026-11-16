# English-only fork

This fork (`jrmatherly/oh-my-cpa`) standardizes on English and deviates on purpose from upstream
(`WizisCool/oh-my-cpa`), which is Chinese-first. The work is split into phases so each one ends in
its own checks and its own pull request.

## Goal

No Chinese in the fork: not in the console, the backend, tests, fixtures, comments, docs or the
public site. Every deviation is recorded for the upstream-review skill so a sync never re-applies
what the fork removed. Nothing that was deleted is lost: deleted files are backed up first.

## Owner's decisions

Decided by Jason on 2026-11-15 and 2026-11-16. A later brief or handoff line that contradicts one
of these is wrong.

1. The console ships English only. `zh`, `zh-Hant` and `ms` are removed, with the language switchers.
2. All Chinese documentation and public-site content is deleted, including the `/zh` half of
   `deploy/site`. Not "keep the site code as inert upstream code".
3. The backup lives under `private/backup/`, local only and gitignored. It is not committed.
4. Deviating from upstream is fine. The requirement is to document each deviation in
   `.claude/skills/upstream-review/SKILL.md` so the next sync does not re-adopt it.
5. No Chinese examples are quoted, in comments or in tests. A test that must feed Chinese data to
   a parser, an input-method handler or a font check writes it as `\u` escapes with a one-line reason.
6. The Chinese half of the demo recordings is stripped, even though upstream regenerates those files.
7. The upstream release tags `v0.4.0` to `v0.4.5` stay on the fork.
8. Upstream syncs merge with a merge commit, never rebase or squash. Fork-only pull requests may
   merge any way; a stacked pair merges the lower one with a merge commit so the upper one needs no rebase.

## Phases

| Phase | Scope | State |
| --- | --- | --- |
| 1 | The console reads English only | Merged, pull request 4 (`3af7725c`) |
| 2 | Backend strings, tests, fixtures, comments, the repo-wide gate | Merged, pull request 5 (`4116acd3`) |
| 3 | Docs, README, screenshots, public site, issue templates | Merged, pull request 6 (`9c1471eb`) |
| 4 | Final sweep: close the loop in the skill, one real upstream sync, the retired-language warning | Small items merged, pull request 7 (`46baa5c2`); the upstream sync is left, as its own pull request |

### Phase 3: docs and the public site

Done. `docs/zh/`, `README.zh-CN.md`, the `.zh` screenshots, the two `zh` social cards,
`scripts/compact-locales.mjs` and the docs app's `LocaleMemory` are deleted, and every file that
named them is edited. The gate's allow list holds the script alone, and a scan for Chinese over
tracked files lists only that script.

The `[lang]` route segment is kept with one language, and so are the `{ en: ... }` records in the
docs manifest and the landing copy. Page addresses stay `/docs/en/...`, and an upstream change to
these files conflicts only on a line that carries `zh`. Flattening would have rewritten every docs
address across the sync script, the site build, the worker and their tests for a site the fork does
not deploy. The skill's "English only" section holds the verdict for each kind of upstream hunk.

Backups: `private/backup/2026-11-15-english-only/` (docs, README, screenshots) and
`private/backup/2026-11-16-english-only-docs/` (the script, the component, the two cards).

Known traps, still true:

- `pnpm test:self` fails three `native-release` tests on macOS (`tar --force-local` needs GNU tar;
  `command -v gtar` finds nothing). They pass in CI.
- `pnpm verify:workflow:lint` expects `~/go/bin/actionlint`, which is absent on this Mac.
- `scripts/sync-lobe-icon-catalog.mjs` (`pnpm icons:lobe`) downloads the newest icon package, whose
  layout changed upstream, so it fails today. The catalog was edited in place with the generator's rule.
- The fork does not deploy upstream's site (`omc.junze.dev`). Site work is for consistency and so
  CI's `docs-site` job stays green, not for a live deployment.

### Phase 4: final sweep

- Done: a retired `OMCPA_DEFAULT_LANGUAGE` (`zh`, `zh-Hant`, `ms`) logs one warning where
  `internal/config/config.go` loads it, and still starts unpinned.
- Done: every path the skill's "English only" section names exists or is listed there as deleted.
- Run one real upstream sync through `english-only.sh` then `english-strings.py`. Both have only
  been tested against simulated merges. Measured on 2026-11-16: upstream is 5 commits past the
  watermark `ec9ba414` (122 files), and a dry-run merge conflicts only where the fork deleted a file
  upstream changed (8 `.zh` screenshots, 6 catalog files under `zh`, `zh-Hant` and `ms`).
- Decide whether to drop the unused `@fumadocs/language` from `deploy/site/docs/package.json`. Removing it
  re-resolved `mdast-util-from-markdown` and a `fumadocs-mdx` peer in `pnpm-lock.yaml`, so phase 3 left it.

## Open questions

- Fork migration numbering. Upstream holds migrations through 066. Read
  `internal/repository/db.go` before the fork adds its first migration.
- Fork release tag scheme. Read `scripts/release-identity.mjs` before the first fork release.
- Whether to harden the gate. `english-strings.py` skips a text file that holds a NUL byte or is
  UTF-16 as binary, mis-decodes a Chinese file name under a non-UTF-8 locale, and its `HAN` class
  misses rare CJK ranges. No tracked file does any of these today. Read the script's scan loop.
- Whether the gate should cover built output. The staged site's API reference ships Scalar's own
  bundle, which carries its Chinese locale table; the gate reads tracked files only. Stage the site
  (`node scripts/build-site.mjs --from-built-docs --skip-demo`) and scan
  `tmp/site/dist/api-reference/scalar.*.js`.

## How the deviation is kept

- `.claude/skills/upstream-review/scripts/english-only.sh` deletes every catalog but English and
  re-strips the English files. Run it after every upstream merge.
- `.claude/skills/upstream-review/scripts/english-strings.py` rewrites known Chinese phrases in
  source, tests, golden files and recordings from one table, and is the gate. `pnpm check:english`
  runs it first in `verify:static:repository`, so CI fails while Chinese remains outside its allow list.
- `pnpm check-i18n` fails on Chinese in any `.ts` or `.tsx` source under `web/src`.
- The skill's "English only" section gives a verdict for each kind of upstream change.
