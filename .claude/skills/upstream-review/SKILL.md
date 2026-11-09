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

A window runs from `lastReviewedSha` to the **newest upstream release tag past it**; when no tag is newer, to `upstream/main`. `--tip` forces the tip. Upstream tags about every few days and squashes each PR into one commit, so a release window is a coherent unit and `docs/releases/v*.md` (upstream's release note, in the tree after the merge) summarizes it. Upstream's `v*` tags are fetched into `refs/remotes/upstream/tags/`, never into `refs/tags/`, because this fork cuts its own tags.

## Tooling

| Piece | Path |
| --- | --- |
| Driver | `.claude/skills/upstream-review/scripts/upstream-review.sh` (needs `jq`; `--github` needs `gh`) |
| Watermark (tracked) | `.upstream-review/watermark.json` (`forkPointSha` fixed, `lastReviewedSha` advances) |
| Decision logs (tracked) | `.upstream-review/reviews/<YYYY-MM-DD>-review.md` |
| Check picker | `.claude/skills/verify-change/scripts/pick-checks.sh <sha-before-merge> --run` runs the repo checks the merged files reach |

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
7. On a branch: `git merge <end>`, resolve conflicts, apply SKIP reverts, run the validation batch. Push only when asked.
8. `--advance <end>` and commit `.upstream-review/` with the merge. `--github` should then read `behind_by=0`.

### Validation batch

A merge commit runs no hook, so run the checks by hand. `pick-checks.sh` reads the diff since the pre-merge SHA and selects the lanes from docs/testing.md; `pnpm test:fast` is the floor.

```bash
before=$(git rev-parse HEAD)   # record before the merge
# ... merge ...
.claude/skills/verify-change/scripts/pick-checks.sh "$before" --run
pnpm test:fast
git diff --name-only "$before"..HEAD -- .claude .upstream-review .gitignore AGENTS.md CLAUDE.md
```

The last line lists fork-local files the merge touched. It should be empty except what the log predicted; anything else means an upstream hunk landed on our automation and needs reading. A window that changes console read DTOs needs `pnpm demo:generate && pnpm check:demo`; one that changes the embedded SPA or auth flow earns `pnpm verify:browser:smoke`.

## Rules for this repo

- **`chore(release): prepare vX` commits are ADOPT** while this fork ships no release of its own. They rewrite version tokens and add `docs/releases/vX.md`. Once the fork publishes builds (see Release identity below), each one becomes ADAPT: take the release note, keep our version line.
- **An upstream file under `.claude/` is ADAPT, never taken blind.** Upstream has none today. Ours is the fork's automation; read theirs for a rule or hook worth having, port the idea, resolve keeping ours.
- **Locale catalogs (`web/src/i18n/locales/*`) are ADOPT** as long as we have added no keys of our own. The first fork key turns each catalog file into a shared append-only file: upstream hunks ADOPT, ours stay, conflicts keep both, and `pnpm check-i18n` proves the four stay aligned.
- **Migrations are ordered by number** (`migrations/NNN_*.sql`; the schema version is the highest number). A fork migration at upstream's next number collides on the next merge. Decide the fork's numbering scheme before adding the first one (open question below); until then the fork adds no migration.
- **Generated artefacts are regenerated, never merged by hand**: `internal/web/dist` (from `pnpm build`), `deploy/cloudflare/data/*` (from `pnpm demo:generate`), lucide icon catalog, the OpenUI prompt (`pnpm check:openui-prompt`). A conflict in one means its source changed; resolve the source and regenerate.
- **Keep `-x` on every cherry-pick** and keep upstream's subject including its `(#NNN)`. GitHub resolves those numbers against this fork's own PR list, so the decision log carries the `--urls` link for every adopted commit.
- **A watermark advance without a decision log is a lost review.** Never advance past commits you did not classify; `--advance` refuses when no log names the SHA.

### Release identity (the fork publishes its own builds)

Upstream's release pipeline names its registry owner, signing key and repository in these places. Today they are upstream's values and ADOPT; the day the fork publishes a build, each becomes a row in the deviations table and a `~` file at every merge.

| Area | Files |
| --- | --- |
| Release workflow | `.github/workflows/release.yml` (`RELEASE_IMAGE: wiziscool/oh-my-cpa`, Docker Hub username) |
| Image references | `Dockerfile`, `deploy/compose.omc.yml`, `deploy/compose.full.yml` |
| Updater trust | `internal/updater/release_public_key.txt` (embedded Ed25519 key), `internal/updater/reference.go`, `engine.go`, `cli.go` |
| Release metadata | `internal/release/manifest.go`, `internal/config/config.go`, `internal/demo/release.go`, `internal/pluginregistry/registry.go` |
| Release scripts | `scripts/release-plan.mjs`, `scripts/native-release.mjs`, `scripts/sign-release-manifest.mjs`, `scripts/tools-versions.json` |
| Tests and contracts | `web/tests/logic/system-versions.test.ts`, `scripts/acceptance/contracts/system-updater.json`, `scripts/*.test.mjs` for the above |
| Community surface | `.github/ISSUE_TEMPLATE/*`, `README*.md` badges and links |

The path-scoped rule `.claude/rules/release-identity.md` repeats the short version whenever one of these files is opened.

### Open questions

Each names the check that settles it.

- **Fork migration numbering.** Read `internal/repository/db.go` (how `schema_migrations` orders and applies versions) and decide: a reserved high range for fork migrations, or renumbering ours on every merge. Settle before the first fork migration.
- **Fork release tags.** `scripts/release-identity.mjs` asserts tag identity and upstream's tags are `v*`. Decide the fork's tag scheme (for example `fork-v0.3.26+1`) before the first fork release, so the two tag series never collide in `refs/tags/`.

## Deviations decided

A new deviation gets a row; a SKIP revert gets a row with the upstream SHA.

| Upstream | Ours | Status | Notes |
| --- | --- | --- | --- |
| no `.claude/` directory | `.claude/settings.json`, `hooks/`, `rules/`, `skills/`, `agents/` (tracked; only `settings.local.json` is ignored) | landed 2026-11-09 | Fork harness. KEEP; an upstream file arriving at the same path is ADAPT. |
| no `.upstream-review/` | `watermark.json`, `reviews/` | landed 2026-11-09 | Fork-only. KEEP. |
| `.gitignore` ends at upstream's last rule | a tail block `# Personal Claude Code overrides` ignoring `.claude/settings.local.json` | landed 2026-11-09 | Upstream hunks above the block merge cleanly; a conflict keeps both, our block stays last. |
| `AGENTS.md` names `internal/repository/migrations/` | names `migrations/`, where the files are | landed 2026-11-09 | ADAPT. One token; if upstream corrects it differently, take theirs. Worth an upstream PR. |
| `web/src/pages/routing/PolicyStrip.tsx` renders the Failover label as a bare text node after the chevron | wraps the label in `<span>` | landed 2026-11-09 | Fixes the `insertBefore` crash under a page translator. Worth an upstream PR once confirmed on a built artifact. An upstream hunk elsewhere in the file is ADOPT; one rewriting the toggle is ADAPT, pinned by `web/tests/routing-page.component.test.tsx`. The row goes when upstream picks it. |
| `web/src/components/dashboard/DashboardProviders.tsx` renders the provider list toggle label as a bare text node after the chevron | wraps the label in `<span>` | landed 2026-11-09 | Same translator crash as the routing toggle. An upstream hunk elsewhere in the file is ADOPT; one rewriting the toggle is ADAPT and keeps the wrap. |
| `web/index.html` carries only `omc-theme-boot` | adds `omc-lang-boot` after it; `LANG_KEY` exported from `web/src/i18n/language.ts` | landed 2026-11-09 | Fork-only until the translate trigger is confirmed. Upstream hunks to the theme boot are ADOPT, pinned by `web/tests/logic/theme-boot.test.ts`. |

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
