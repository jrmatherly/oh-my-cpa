---
name: upstream-review
description: Review what changed in upstream WizisCool/oh-my-cpa since our last review, decide per commit whether this fork adopts, adapts or skips it, check with GitHub and a local dry run whether it merges cleanly, and bring it in without disturbing our deviations. Use for "sync from upstream", "sync fork", "what changed upstream", "review upstream", "did oh-my-cpa release", "are we behind upstream", "bring upstream commit X in", or any periodic upstream check. Encodes the merge-first rule, the release-tag window, the watermark, the per-file divergence markers, the validation batch and the deviations table.
argument-hint: "[--stat | --urls | --tip | --show <sha> | --diverged | --dry-run-merge | --github | --advance <sha>]"
---

# Upstream review

This repo is the GitHub fork `jrmatherly/oh-my-cpa` of `WizisCool/oh-my-cpa` and shares history with it. That gives three things a copied repo never has, and the method leans on all of them:

1. **A real merge-base.** `git merge-base HEAD upstream/main` is the last upstream commit our tree carries wholesale. Our deviation footprint is `git diff <merge-base> HEAD` (`--diverged`), and `git merge upstream/main` is a legal operation.
2. **A dry run that cannot touch the tree.** `git merge-tree --write-tree HEAD <end>` merges in memory and lists conflicting files (`--dry-run-merge`).
3. **GitHub's fork compare.** `gh api repos/jrmatherly/oh-my-cpa/compare/WizisCool:main...main` reports `ahead_by`, `behind_by` and `status` (`--github`). GitHub counts **commits, not patches**: a cherry-pick leaves the fork reading "behind" until a merge records the ancestry, and the "Sync fork" button is a merge.

## Sync policy: merge first, cherry-pick for the exceptions

- **Default is a merge.** When the window's verdicts are all ADOPT and `--dry-run-merge` is clean, `git merge <end>` on a branch, run the validation batch, push when asked. GitHub's "Sync fork" does the same merge into `main` directly; use it only after the local dry run is clean, since it runs no local validation.
- **A SKIP is a revert on our side, not a withheld merge.** Withholding a merge for one unwanted commit forces cherry-pick-forever and a permanently misleading GitHub compare. Merge, then `git revert <sha>` (subject `revert(upstream): <original subject>`), and add a row to the deviations table. The revert is the deviation; a later upstream change to the same lines conflicts on purpose and gets read.
- **An ADAPT is a conflict resolved per the deviations table.** Take upstream's logic everywhere the table does not name; keep ours where it does.
- **Cherry-pick (`git cherry-pick -x`)** takes a single fix early, ahead of the next merge. The merge that follows absorbs the pick (patch ids match; the listing tags it `[picked]`).

## The window

A window runs from `lastReviewedSha` to the **newest upstream release tag past it**; when no tag is newer, to `upstream/main`. `--tip` forces the tip. Upstream tags about every few days and squashes each PR into one commit, so a release window is a coherent unit and `docs/releases/v*.md` (upstream's release note, in the tree after the merge) summarizes it. Upstream's `v*` tags are fetched into `refs/remotes/upstream/tags/`, never into `refs/tags/`, because this fork cuts its own tags. The driver sets `remote.upstream.tagOpt --no-tags` and `remote.upstream.pruneTags false` on every run, so a plain `git fetch upstream` or `git fetch --all` cannot copy them into `refs/tags/` either. Both are needed: `tagOpt` stops tag auto-following, and `pruneTags` overrides a global `fetch.pruneTags=true`, which mirrors a remote's `refs/tags/*` and would also delete this fork's own tags locally. Without them, `push.followTags` publishes the copies on the next branch push, which is how `v0.4.0` to `v0.4.5` reached the fork on 2026-11-15 (kept, beside the `v0.1.0` to `v0.3.26` the fork was created with). A global `fetch.prune=true` still empties `refs/remotes/upstream/tags/` on a plain fetch; the driver refetches it on every run.

## Tooling

| Piece | Path |
| --- | --- |
| Driver | `.claude/skills/upstream-review/scripts/upstream-review.sh` (needs `jq`; `--github` needs `gh`) |
| Watermark (tracked) | `.upstream-review/watermark.json` (`forkPointSha` fixed, `lastReviewedSha` advances) |
| Decision logs (tracked) | `.upstream-review/reviews/<YYYY-MM-DD>-review.md` |
| Check picker | `.claude/skills/verify-change/scripts/pick-checks.sh <sha-before-merge> --run` runs the repo checks the merged files reach |
| Backend phrase translator | `.claude/skills/upstream-review/scripts/english-strings.py` rewrites upstream's hardcoded Chinese phrases to this fork's English in Go source, tests, golden files and acceptance fixtures, and lists the files whose Chinese it has no phrase for; `--check` changes nothing and exits 1 if it would; run it after every merge |
| English-only converger | `.claude/skills/upstream-review/scripts/english-only.sh` removes the catalogs this fork does not ship and makes the English files the typed source again; run it after every merge, conflicts and all |

```bash
S=.claude/skills/upstream-review/scripts/upstream-review.sh
$S                   # fetch, list un-reviewed commits oldest first, window end, merge-base
$S --stat            # + each touched file with a divergence marker
$S --urls            # + github commit URL per commit (for the log)
$S --show <sha>      # one commit's diff against its upstream parent
$S --diverged        # our footprint vs the merge-base
$S --dry-run-merge   # merge-tree against the window end; exit 1 on conflict
$S --github          # GitHub compare for main and the current branch
$S --advance <end>   # after the log names <end>; refuses to move backward or without a log
```

`gh` ranks a remote named `upstream` above `origin`, so `gh repo set-default jrmatherly/oh-my-cpa` is set in this clone's git config (`remote.origin.gh-resolved`); a fresh clone needs it again or `gh pr create` targets WizisCool.

Tags on a listed commit: `[merge]`, `[picked]`, `[merged]` (already an ancestor of HEAD; classify it anyway, revert if SKIP), `[release vX]`. Markers in `--stat`, our HEAD against the commit's parent:

| | Meaning | In a merge |
| --- | --- | --- |
| `=` | ours equals the pre-image | clean |
| `<` | ours equals the merge-base, not the pre-image | an earlier un-reviewed upstream commit touched it; both come |
| `~` | ours differs from both | we changed it; likely conflict, resolve per the table |
| `x` | we removed it | check the table |
| `+` | new upstream file | created |
| `bin` | binary | inspect by hand |

## Method

1. Run `--stat` and `--github`. Group commits by upstream's conventional scope: `feat(web)`, `fix(api)`, `fix(cpa)`, `docs`, `chore(release)`, `i18n`.
2. For each non-merge, non-`[picked]` commit, `--show <sha>` and read the diff against its parent. For a window over about 20 commits, dispatch one reviewer subagent per scope with the SHAs and marker output, and synthesize one log.
3. Classify our state from the markers and the diff: ALREADY-HAVE, ABSENT, DIVERGED, PARTIAL.
4. Verdict: `ADOPT`, `ADAPT` (resolve `~` per the table), `SKIP` (merge then revert), `MONITOR` (comparison review of an upstream feature that overlaps one of ours; default SKIP for its files, record what it does better).
5. Run `--dry-run-merge`. Conflicts should be the `~` files the ADAPT verdicts already name; a surprise conflict is a deviation nobody recorded, so record it first.
6. Write every verdict with file-level evidence and the commit URL to the dated decision log (template below).
7. On a branch: `git merge <end>`, run `english-only.sh` (it settles every conflict under `web/src/i18n/locales/`), resolve the remaining conflicts per the deviations table and the "English only" section, run `english-strings.py` until it exits 0, apply SKIP reverts, run the validation batch. Push only when asked.
8. `--advance <end>` and commit `.upstream-review/` with the merge. `--github` should then read `behind_by=0`.

### Validation batch

A merge commit runs no hook, so run the checks by hand. `pick-checks.sh` reads the diff since the pre-merge SHA and selects the lanes from docs/dev/testing.md; `pnpm test:fast` is the floor.

```bash
before=$(git rev-parse HEAD)   # record before the merge
# ... merge ...
.claude/skills/verify-change/scripts/pick-checks.sh "$before" --run
pnpm test:fast
git diff --name-only "$before"..HEAD -- .claude .upstream-review .gitignore AGENTS.md CLAUDE.md
```

The last line lists fork-local files the merge touched. It should be empty except what the log predicted; anything else means an upstream hunk landed on our automation and needs reading. A window that changes console read DTOs needs `pnpm demo:generate && pnpm check:demo`; one that changes the embedded SPA or auth flow earns `pnpm verify:browser:smoke`.

## Rules for this repo

- **`chore(release): prepare vX` commits are ADAPT.** The fork keeps its own version line, `v1.x` (owner's decision, 2026-11-16). Take `docs/releases/vX.md` and its entry in `docs/releases/README.md`, which are upstream's notes. Keep the fork's `version` in `package.json`, `web/package.json` and `deploy/site/docs/package.json`: the bump conflicts on those three lines and resolves to ours.
- **An upstream file under `.claude/` is ADAPT, never taken blind.** Upstream has none today. Ours is the fork's automation; read theirs for a rule or hook worth having, port the idea, resolve keeping ours.
- **This fork is English only** (owner's decision, 2026-11-15). No upstream change that carries Chinese, or another reading language, is adopted as written. The section "English only" below says what each kind of upstream hunk becomes; read it before classifying any commit that touches `web/src/i18n/`, `internal/quota/`, the demo recordings, a test fixture, `docs/`, `README*.md`, `deploy/site/` or the site scripts under `scripts/`.
- **Migrations are ordered by number** (`migrations/NNN_*.sql`; the schema version is the highest number). A fork migration at upstream's next number collides on the next merge. Decide the fork's numbering scheme before adding the first one (open question below); until then the fork adds no migration.
- **Generated artefacts are regenerated, never merged by hand**: `internal/web/dist` (from `pnpm build`), `deploy/cloudflare/data/*` (from `pnpm demo:generate`), lucide icon catalog, the OpenUI prompt (`pnpm check:openui-prompt`). A conflict in one means its source changed; resolve the source and regenerate.
- **Keep `-x` on every cherry-pick** and keep upstream's subject including its `(#NNN)`. GitHub resolves those numbers against this fork's own PR list, so the decision log carries the `--urls` link for every adopted commit.
- **A watermark advance without a decision log is a lost review.** Never advance past commits you did not classify; `--advance` refuses when no log names the SHA.

### English only

The fork ships one reading language, English, and holds no Chinese character outside `english-strings.py` itself, whose phrase table is the allow list's one entry. Upstream is Chinese-first and keeps writing Chinese into the same files, so every sync meets this deviation. The rule is simple: **take upstream's logic, never its Chinese, and never restore what the fork removed.** A conflict in one of these areas is expected and is resolved toward the fork.

What an upstream hunk becomes:

| Upstream changes | Verdict | What to do |
| --- | --- | --- |
| `web/src/i18n/locales/en/*` (new or reworded English sentences) | ADOPT | `english-only.sh` takes upstream's side and strips the link to the Chinese source again. |
| `web/src/i18n/locales/{zh,zh-Hant,ms}/*`, or any new language directory | SKIP, no revert needed | `english-only.sh` deletes every directory under `locales/` except `en`. |
| the language registry, default, switchers, `OMCPA_DEFAULT_LANGUAGE` handling, `check-i18n.ts`, and `compactEnglishCatalogPlugin` (`scripts/compact-locales.mjs`, which reads `locales/zh` and is deleted here; an upstream edit to it is a modify/delete conflict resolved as deleted, with its names kept out of `scripts/ci-scope.mjs`, `scripts/ci-scope.test.mjs` and `scripts/sync-web-dist.test.mjs`) | ADAPT, keep ours | Files: `web/src/i18n/{language,resources,catalog}.ts`, one re-export line in `web/src/i18n/index.tsx`, `web/index.html` (`lang="en"`), `PreferenceMenus.tsx`, `HeaderNav.tsx`, `OmcSettingsPage.tsx`, `web/src/types/pluginStoreMetadata.ts`, `web/vite.config.ts`, `internal/config/config.go` (`ConsoleLanguages`, `retiredConsoleLanguages`), `internal/agent/runtime.go` (`LANGUAGES`), `scripts/check-i18n.ts`, `scripts/browser-acceptance.mjs`, `scripts/acceptance/add-provider.mjs` (English selectors), `GLOSSARY.md`, `STYLE.md` and `README.md` under `web/src/i18n`, the code-style lines of `AGENTS.md` that state the English-only rule and give English examples, and the language notes in `.env.example`, `deploy/native.env.example` and `docs/reference/environment.md`. Tests rewritten for one language, where an upstream hunk that brings back a `zh` case is ADAPT: `web/tests/logic/language.test.ts`, `web/tests/i18n.component.test.tsx`, `web/tests/plugin-store.component.test.tsx`, `web/tests/logic/plugin-config.test.ts`, `web/tests/logic/oauth-workspace.test.ts`, `web/tests/logic/demo-replay.test.ts`, `internal/agent/*_test.go`, `internal/config/config_test.go`. Take upstream's hunks elsewhere in those files. |
| a Chinese string the backend sends (quota labels, reset and expiry phrases, plan and source fallbacks, recommendation reasons) in `internal/quota/*.go`, `internal/api/management_quota.go`, `internal/cpa/discovery/discovery.go` | ADAPT | Take upstream's logic, then run `english-strings.py`. A file with Chinese it cannot rewrite is listed with its line count; add a row to `PHRASES`, or to `PATTERNS` for a composed label, never an inline edit. Keep the label shape `<model> <period> limit` or `<model> <period> usage` with the period as one word (`5-hour`, `90-minute`, `weekly`): `modelLabel` in `web/src/pages/oauthManagement/credentialSections.ts` parses it. |
| Go tests, `internal/quota/testdata/golden/*`, acceptance fixtures and web tests that expect those strings | ADAPT | Take upstream's file, then run `english-strings.py`, which rewrites them from the same table. |
| the Chinese number style (`zh` in `TOKEN_NUMBER_STYLES`, `formatZh`, the `zh` entry of `TOKEN_STYLES` in `internal/agent/prompt.go`, `omc.token_style_zh`) | SKIP | Removed here, with `resolveTokenNumberStyle`, `isChineseLanguage` and the language dependency of `web/src/types/tokenDisplayContext.tsx`. A stored `zh` preference reads as `en-compact`, and tests in `web/tests/logic/dashboard-providers.test.ts`, `internal/agent/prompt_test.go` and `internal/api/agent_http_test.go` assert what a retired `zh` does. Do not restore the style, its option or its tests. `english-only.sh` deletes `omc.token_style_zh` from `locales/en/settings.ts` again after it takes upstream's side of that file. |
| the demo recordings `web/src/demo/{agentRecording,playgroundRecording}.json` | ADAPT | Take upstream's re-recording whole, then run `english-strings.py`, which drops each `"zh"` line. `web/src/demo/pacing.ts` and `recordingTemplate.ts` replay English only; keep ours. |
| Chinese provider-name aliases in `web/src/types/providerIconIds.ts`, Chinese brand names in `web/src/generated/lobeIconCatalog.json`, the Chinese font family name in `web/src/types/fonts.ts` and `web/src/index.css` | SKIP | Removed here. `scripts/sync-lobe-icon-catalog.mjs` strips Chinese names when the catalog is regenerated; keep that rule. |
| a comment, example, test sample or fixture that quotes Chinese | ADAPT | Rewrite it in English. A test that has to feed Chinese data to a parser, an IME handler or a font check writes it as `\u` escapes with a one-line reason. Where the test needs no Chinese (a length or glyph-set check), substitute a non-Chinese character. Either way the line differs from upstream and conflicts when upstream edits it: `web/tests/payload-rules.component.test.tsx`, `web/tests/search-input.component.test.tsx` and `web/tests/logic/font-shards.test.ts` (escapes), `internal/repository/custom_icons_test.go` and `scripts/font-shards.test.mjs` (substitutions). |
| Chinese docs (`docs/zh/**`), `README.zh-CN.md`, `.zh` screenshots, `deploy/site/og/*-zh.png` | SKIP | Deleted here. An upstream edit is a modify/delete conflict resolved as deleted; a new file is removed. Keep `README.zh-CN.md` and `docs/zh` out of `ARCHIVE_FILES` in `scripts/native-release.mjs` (the release build fails on a listed file that is missing), out of `DOCS_INPUTS` in `scripts/ci-scope.mjs`, and out of the link lines of `README.md`, `docs/README.md` and `.coderabbit.yaml`. |
| the public site's second language: `deploy/site/landing/{copy,render}.mjs` and `site.js`, `deploy/site/worker.mjs`, `wrangler.jsonc`, the Fumadocs app under `deploy/site/docs/src/`, `scripts/sync-docs-site.mjs`, `scripts/build-site.mjs`, `scripts/render-social-cards.mjs`, `scripts/readme-screenshots.mjs`, and their tests | ADAPT, keep ours | The site keeps upstream's shape with one language: the `[lang]` route segment, the `{ en: ... }` records in `DOCS_SECTIONS` and `COPY`, `LANDING_PAGES` and `DOCS_LANGUAGES` all stay, each holding English alone, so page addresses stay `/docs/en/...` and an upstream hunk conflicts only on the line that carries `zh`. Take upstream's logic and its English half, drop the `zh` key, entry, route or card. A page upstream adds to `DOCS_SECTIONS` keeps its `en` source, title and description. Removed with the language: the landing page's language link and its `/zh/` redirect, `LocaleMemory` (`deploy/site/docs/src/components/locale-memory.tsx`), the language chooser on `/docs/`, the `zhNotice` callout, and `asLang`'s second branch. The gate fails on any Chinese these hunks bring back. `docs/releases/*.md` are upstream's notes and ADOPT, with a Chinese word rewritten in English. |

Upstream comments that mention other languages in passing are left as upstream wrote them to keep merges small. The `zh-Hant` and `ms` chunk rules in `web/vite.config.ts` are removed; keep them out. `@fumadocs/language` stays in `deploy/site/docs/package.json` unused, because removing it re-resolved unrelated packages in the lockfile.

Compatibility the fork keeps on purpose, so do not "clean" it away: `loadDefaultLanguage` reads a retired pin (`zh`, `zh-Hant`, `ms`) as unpinned so an older deployment still starts; a stored `omc-lang` or `omc_token_style` of `zh` falls back to English; `modelLabel` still strips upstream's Chinese period word (written as escapes), because quota snapshots saved before the change carry it.

After every merge, in this order:

```bash
.claude/skills/upstream-review/scripts/english-only.sh      # catalogs: delete the others, re-strip English
.claude/skills/upstream-review/scripts/english-strings.py   # phrases, tests, golden files, recordings
pnpm type-check && pnpm check-i18n                          # a key upstream added only in Chinese fails here
```

`english-strings.py` is also the gate: it exits 1 and lists the files while any Chinese remains in a tracked file outside its allow list. It runs as `pnpm check:english`: as its own step in CI's `static-repo` job, which runs for every change, and first in `verify:static:repository`. The CI step in `.github/workflows/ci.yml`, that script line and the `check:english` entry in `package.json` are fork additions to keep through a merge. `pnpm check-i18n` separately fails on a Chinese character in any `.ts` or `.tsx` source under `web/src` outside the catalog and test files. `pick-checks.sh --run` always includes the gate. A sync is not finished until both are clean. `english-only.sh` takes upstream's whole side of a conflicted English catalog file, so a sentence the fork added or reworded there is re-applied by hand afterwards; it prints each file it took.


### Release identity (the fork publishes its own builds)

The fork publishes its own image, releases and signed manifests, decoupled from upstream (owner's decision, 2026-11-16). Upstream's pipeline names its registry owner, signing key and repository in the files below. Each now holds the fork's value and is a deviation: **take upstream's logic, keep the fork's identity, and never restore `wiziscool/oh-my-cpa`, `WizisCool/oh-my-cpa`, a Docker Hub login or upstream's public key.** An upstream hunk elsewhere in these files is ADOPT.

| Identity | Fork's value | Where it lives |
| --- | --- | --- |
| Container image | `ghcr.io/jrmatherly/oh-my-cpa`, public | `.github/workflows/release.yml` (`RELEASE_IMAGE: ghcr.io/${{ github.repository }}`), the default and the `ghcr.io/owner/repository` rule in `scripts/release-plan.mjs` with its test, `scripts/native-release.mjs`, the `OMCPA_IMAGE` default in `deploy/compose.omc.yml` and `deploy/compose.full.yml` with `scripts/deployment.test.mjs`, the install command in `internal/updater/cli.go` and `web/src/pages/SystemPage/UpdateControls.tsx` |
| Registry login | `ghcr.io` with `github.actor` and `GITHUB_TOKEN`; `packages: write` on the `publish` and `promote` jobs; no `DOCKERHUB_TOKEN` | `.github/workflows/release.yml`, with the concurrency group `ghcr-release` and the release note's `Image:` line |
| Repository | `jrmatherly/oh-my-cpa` | `DefaultOMCRepository` in `internal/config/config.go` and `internal/demo/release.go`, `ProjectRepository` in `internal/release/stargazers.go`, `org.opencontainers.image.source` in `Dockerfile` (GHCR links the package to the repository through it), the repository links in `HeaderNav.tsx` and `ReceiptPaper.tsx` |
| Signing key | the fork's Ed25519 public key; the private half is the `RELEASE_SIGNING_KEY` Actions secret | `internal/updater/release_public_key.txt`. `scripts/sign-release-manifest.mjs` refuses to sign with a key that does not match it. An upstream change to this file is SKIP: an installation of the fork trusts the fork's key alone |
| Version line | the fork's own plain `vX.Y.Z` tags on the `v1.x` line, cut from the fork's `main`. Upstream's line is `v0.x`, so a fork tag, image tag or release note never shares a name with an upstream one | the `version` in `package.json`, `web/package.json` and `deploy/site/docs/package.json`. `STABLE_TAG` in `scripts/release-plan.mjs` and `ParseVersion` in `internal/release/version.go` refuse a suffix, so the fork does not mark its versions with one. The fork's notes are `docs/releases/v1.*.md`, listed first on the "Latest release notes" line of `docs/releases/README.md`, where an upstream entry is added after ours |
| Docs and community | the fork's image, releases, issues and security contact | the install, upgrade and operations guides under `docs/`, `docs/dev/releasing.md`, `README.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/*`. The README's Docker Hub pulls badge and `SECURITY.md`'s email fallback are deleted, so an upstream edit to either resolves as deleted. The README links its documentation to `docs/README.md`, since the hosted docs site is upstream's |

What stays upstream's, on purpose:

- **CPA is a third party.** `eceasy/cli-proxy-api`, `router-for-me/CLIProxyAPI` and `omc-community/omc-plugins` are not the fork's identity. `LegacyOMCSourceURL` in `internal/pluginregistry/registry.go` is a value the gateway removes from old configurations and must keep upstream's address.
- **The public site.** `deploy/site/site-meta.mjs` (`SITE_ORIGIN`, `GITHUB_REPO`), `deploy/site/worker.mjs`, both `wrangler.jsonc` files and the `omc.junze.dev` links are upstream's site. The fork has no domain and deploys none of it.
- **Upstream's release notes.** `docs/releases/v*.md` name upstream's images and are kept as written.
- **Test fixtures and comments.** `wiziscool/oh-my-cpa` in Go and script tests, in `scripts/acceptance/contracts/system-updater.json` and in two updater comments is an opaque sample. The tests pass with any value, so they are left as upstream wrote them to keep merges small.
- **The Go module path** `github.com/oh-my-cpa/oh-my-cpa`.

A running installation can still be pointed elsewhere without a code change: `OMCPA_OMC_REPO` (release feed and manifest), `OMCPA_UPDATER_PUBLIC_KEY` (trust key) and `OMCPA_IMAGE` (Compose image). The updater pulls `<running repository>@<manifest digest>` with no registry credentials, which is why the package must stay public.

Upstream's `v*` tags stay out of `refs/tags/` (see "The window"). The fork still carries upstream's `v0.1.0` to `v0.4.5` there from before that rule; they are upstream's commits and no fork release.

The path-scoped rule `.claude/rules/release-identity.md` repeats the short version whenever one of these files is opened.

### Open questions

Each names the check that settles it.

- **Fork migration numbering.** Read `internal/repository/db.go` (how `schema_migrations` orders and applies versions) and decide: a reserved high range for fork migrations, or renumbering ours on every merge. Settle before the first fork migration.

## Deviations decided

A new deviation gets a row; a SKIP revert gets a row with the upstream SHA.

| Upstream | Ours | Status | Notes |
| --- | --- | --- | --- |
| no `.claude/` directory | `.claude/settings.json`, `hooks/`, `rules/`, `skills/`, `agents/` (tracked; only `settings.local.json` is ignored) | landed 2026-11-09 | Fork harness. KEEP; an upstream file arriving at the same path is ADAPT. |
| no `.upstream-review/` | `watermark.json`, `reviews/` | landed 2026-11-09 | Fork-only. KEEP. |
| `.gitignore` ends at upstream's last rule | a tail block ignoring `.claude/settings.local.json` and `private/` | landed 2026-11-09 | Upstream hunks above the block merge cleanly; a conflict keeps both, our block stays last. |
| `AGENTS.md` names `internal/repository/migrations/` | names `migrations/`, where the files are | landed 2026-11-09 | ADAPT. One token; if upstream corrects it differently, take theirs. Worth an upstream PR. |
| `AGENTS.md` and `docs/dev/testing.md` say `pnpm verify:browser:smoke` builds the embedded SPA | say it compiles the Go binary around the SPA that `pnpm build` last wrote, and name `pnpm build && pnpm verify:browser:smoke` | landed 2026-11-09 | ADAPT. Keep ours while `scripts/browser-acceptance.mjs` runs no web build; if upstream makes the smoke build the SPA, take theirs. |
| `web/src/components/dashboard/DashboardProviders.tsx` renders the provider list toggle label as a bare text node after the chevron | wraps the label in `<span>` | landed 2026-11-09 | Same translator crash as the routing toggle. An upstream hunk elsewhere in the file is ADOPT; one rewriting the toggle is ADAPT and keeps the wrap. |
| `.coderabbit.yaml` uses the deprecated `request_changes_workflow`, bare `docs/*.md` guideline paths and a dead `code_generation` block | `auto_approvals.enabled`, `applyTo` guideline entries, Biome off | landed 2026-11-09 | Upstream hunks to `path_instructions` are ADOPT; one touching `knowledge_base`, `auto_approvals` or `tools` is ADAPT and keeps ours. The guides moved to `docs/dev/` in v0.4.3, so our `applyTo` entries name `docs/dev/architecture.md` and `docs/dev/design.md`. Schema-checked with `check-jsonschema`. |
| `.github/workflows/readme-screenshots.yml` runs its `screenshots` job on any repository | the job carries `if: github.repository == 'WizisCool/oh-my-cpa'` | landed 2026-11-15 | The workflow force-pushes a branch, opens a PR and auto-merges it daily. The README images are upstream's and arrive with each sync. Upstream hunks elsewhere in the file are ADOPT; one rewriting the job header is ADAPT and keeps the guard. |
| four reading languages with Chinese the default and typed source; Chinese labels, phrases, aliases, examples and fixtures across web, Go, tests and scripts | English only, everywhere | landed 2026-11-15 | NEVER ADOPT the Chinese half of an upstream hunk. See "English only" above for the verdict per kind of change, the two scripts that re-apply the deviation after a merge, and the gate that fails while any Chinese remains outside its allow list. Deleted files are backed up under the gitignored `private/backup/2026-11-15-english-only/` and `private/backup/2026-11-16-english-only-docs/`. |
| Docker Hub image `wiziscool/oh-my-cpa`, repository `WizisCool/oh-my-cpa`, upstream's Ed25519 release key, upstream's version numbers | `ghcr.io/jrmatherly/oh-my-cpa`, `jrmatherly/oh-my-cpa`, the fork's key, the fork's own `v1.x` line | landed 2026-11-16 | NEVER ADOPT upstream's registry, repository, login, key or version bump. See "Release identity" above for the value and the files of each identity, and for what stays upstream's on purpose. `chore(release)` commits are ADAPT: take the note, keep our version. |

## Decision log template

```markdown
# Upstream review - <YYYY-MM-DD>

Window: `<from>..<full end sha>` (<tip | release vX>), N commits (M merges, P already picked). Driver: `--stat`, `--dry-run-merge` (clean | conflicts in ...), `--github` (status, ahead_by, behind_by before).

## Headline
One paragraph: merge or cherry-pick, what the window is about, anything that needs a human decision.

## Verdicts
| # | Commit | Scope | Our state | Markers | Verdict | Evidence |
|---|--------|-------|-----------|---------|---------|----------|
| 1 | <short> | feat(web) | ABSENT | `= +` | ADOPT | what it changes, where; <commit url> |

## Landed
Branch, merge or picks, reverts, validation batch results, fork-local diff check, `--github` after.

## Red flags
Anything upstream did that this fork must watch (a changed security boundary, a generated artefact, a renamed path).
```
