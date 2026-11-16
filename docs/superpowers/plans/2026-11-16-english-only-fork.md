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
| 2 | Backend strings, tests, fixtures, comments, the repo-wide gate | Pull request 5 |
| 3 | Docs, README, screenshots, public site, issue templates | Not started |
| 4 | Final sweep: empty the gate's allow list, close the loop in the skill | Not started |

### Phase 3: docs and the public site

Measured on 2026-11-16 at `be1b0679`. Re-measure before starting:
`.claude/skills/upstream-review/scripts/english-strings.py --check` lists nothing outside the allow
list, and `rg -l '\p{Han}' --hidden -g '!.git' -g '!node_modules' -g '!private' .` lists what is left.

Back up before deleting, into a new dated folder beside the existing one
(`private/backup/2026-11-15-english-only/` already holds the catalogs, `docs/zh`, `README.zh-CN.md`,
the `.zh` screenshots and the three i18n guides, 97 files with `FILES.txt` and `SHA256SUMS`). Files
phase 3 deletes that are not yet backed up need copying first; files that are only edited do not,
since git holds their history.

Delete:

- `docs/zh/` (28 files: root 9, `features` 6, `install` 7, `operate` 4, `ops` 1, `reference` 1).
- `README.zh-CN.md`.
- `docs/images/readme/*.zh.webp` (8 files).

Edit to English only:

- `README.md` and `docs/README.md`: each links to the Chinese README or docs (1 line of Chinese each).
- `docs/releases/v0.4.3.md`: one release note with Chinese. Upstream's file; translate the line or
  record it as an allowed exception, owner's call if translating changes meaning.
- `docs/ops/cloudflare-demo.md`: 3 references to the `/zh` site.
- `deploy/site/landing/copy.mjs` (103 lines of Chinese copy), `deploy/site/landing/render.mjs`,
  `deploy/site/worker.mjs`, `deploy/site/worker.test.mjs`, `deploy/site/wrangler.jsonc`: drop the
  `zh` landing page, its routes and its `hreflang` links.
- `deploy/site/docs/` (the Fumadocs app): `src/lib/i18n.ts`, `src/lib/site.ts`,
  `src/lib/layout.shared.tsx`, `src/app/[lang]/layout.tsx`, `src/app/[lang]/[[...slug]]/page.tsx`,
  `src/app/(entry)/page.tsx`, `src/components/docs-home.tsx`. Decide whether the `[lang]` route
  segment stays with one language or is flattened; flattening is a larger deviation from upstream.
- `scripts/sync-docs-site.mjs` (77 lines of Chinese, `DOCS_LANGUAGES = ['en', 'zh']`),
  `scripts/build-site.mjs` (`HREFLANG`), `scripts/build-site.test.mjs`,
  `scripts/render-social-cards.mjs` (two `zh` cards), `scripts/readme-screenshots.mjs`
  (`LANGUAGES = ['en', 'zh']`).
- `scripts/native-release.mjs` and `scripts/native-release.test.mjs`: `ARCHIVE_FILES` names
  `README.zh-CN.md`. The release build fails if the file is deleted and the list is not updated.
- `scripts/ci-scope.mjs` and `scripts/ci-scope.test.mjs`: `DOCS_INPUTS` names `README.zh-CN.md`.
- `scripts/compact-locales.mjs`: dead since phase 1 (it reads `locales/zh`); delete it, and its
  entries in `scripts/sync-web-dist.test.mjs` and `scripts/ci-scope*.mjs`, or leave it and say why.
- `.github/ISSUE_TEMPLATE/bug_report.yml` and `feature_request.yml`: one Chinese line each.
- `.coderabbit.yaml`: two rules that exempt `README.zh-CN.md` and `docs/zh/**` from the
  English-prose rule.
- `AGENTS.md`: the `deploy/site/` line (bilingual site) and the code-style line that names the
  Chinese docs as pending removal.
- `.gitignore`: the `deploy/site/docs/public/zh/` entry goes once the site builds no `zh` output.
- `.claude/rules/docs.md`: it still says only `README.zh-CN.md` is Chinese.
- `web/vite.config.ts`: the dead `zh-Hant` and `ms` chunk rules left from phase 1.

Then:

- Remove the phase 3 rows from `ALLOWED` in `english-strings.py`. The gate must still exit 0.
- Run `pnpm check-docs`, `pnpm test:self`, `pnpm verify:docs`, `pnpm build:site` and the docs-site
  build. CI's `docs-site` job runs a Next build and `wrangler deploy --dry-run`.
- Update the "English only" section and the release identity table in the skill.

Known traps:

- `scripts/native-release.mjs` lists doc files by name and the build fails on a missing one.
- `pnpm test:self` fails three `native-release` tests on macOS (`tar --force-local` needs GNU tar;
  `command -v gtar` finds nothing). They pass in CI.
- `pnpm verify:workflow:lint` expects `~/go/bin/actionlint`, which is absent on this Mac.
- `scripts/sync-lobe-icon-catalog.mjs` (`pnpm icons:lobe`) downloads the newest icon package, whose
  layout changed upstream, so it fails today. The catalog was edited in place with the generator's rule.
- The fork does not deploy upstream's site (`omc.junze.dev`). Site work is for consistency and so
  CI's `docs-site` job stays green, not for a live deployment.

### Phase 4: final sweep

- `english-strings.py`'s `ALLOWED` holds only the script itself.
- `rg -l '\p{Han}'` over tracked files lists only that script and the two tests that hold escapes
  (`web/tests/search-input.component.test.tsx`, `web/tests/logic/font-shards.test.ts` hold none as
  literal characters; confirm).
- Read the "English only" section of the skill once more against the tree. Every file it names exists.
- Run one real upstream sync through `english-only.sh` then `english-strings.py`. Both have only
  been tested against simulated merges.
- A retired `OMCPA_DEFAULT_LANGUAGE` (`zh`, `zh-Hant`, `ms`) is accepted silently. Add one warning log
  line where `internal/config/config.go` loads it, so an operator learns the pin no longer applies.
- Narrow `ALLOWED`'s `README` rule once `README.md` holds no Chinese.
- Remove `"Bash(pnpm lint:antd)",` from `.claude/settings.json` (Jason's edit; the agent cannot
  write that file).

## Open questions

- Fork migration numbering. Upstream holds migrations through 066. Read
  `internal/repository/db.go` before the fork adds its first migration.
- Fork release tag scheme. Read `scripts/release-identity.mjs` before the first fork release.
- Whether the `[lang]` route segment of the docs site is kept or flattened (phase 3, above).

## How the deviation is kept

- `.claude/skills/upstream-review/scripts/english-only.sh` deletes every catalog but English and
  re-strips the English files. Run it after every upstream merge.
- `.claude/skills/upstream-review/scripts/english-strings.py` rewrites known Chinese phrases in
  source, tests, golden files and recordings from one table, and is the gate. `pnpm check:english`
  runs it first in `verify:static:repository`, so CI fails while Chinese remains outside its allow list.
- `pnpm check-i18n` fails on Chinese in any `.ts` or `.tsx` source under `web/src`.
- The skill's "English only" section gives a verdict for each kind of upstream change.
