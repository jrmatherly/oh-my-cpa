#!/usr/bin/env bash
# upstream-sync.sh - the unattended half of an upstream review, run daily by
# .github/workflows/upstream-sync.yml.
#
# It does the steps of SKILL.md that need no judgment: list what upstream landed past the
# watermark, merge it on a branch, re-apply the English-only deviation, and leave the result
# as one tracking issue and one draft pull request. It never merges into main, never marks
# the pull request ready and never advances the watermark: classifying each commit, the
# decision log and --advance stay with the reviewer.
#
# The window always ends at upstream's tip (--tip), so a daily run carries everything landed
# so far and not only what upstream has tagged.
#
# The draft lives on one rolling branch that the script rebuilds from main and force-pushes.
# Once anyone else commits to that branch the script leaves it alone and says so in the issue.
#
# USAGE
#   GITHUB_REPOSITORY=owner/repo GH_TOKEN=... upstream-sync.sh
#   DRY_RUN=1 upstream-sync.sh    merge locally, print the issue and pull request text, write
#                                 nothing to GitHub. Leaves the checkout on the sync branch.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
SCRIPTS=.claude/skills/upstream-review/scripts
DRY_RUN="${DRY_RUN:-0}"
BRANCH=sync/upstream-auto
LABEL=upstream-sync
BOT_NAME='github-actions[bot]'
BOT_EMAIL='41898282+github-actions[bot]@users.noreply.github.com'

die() { echo "ERROR: $*" >&2; exit 1; }
live() { [ "$DRY_RUN" != 1 ]; }
# Upstream's subjects and paths are untrusted text: fence them, and keep them from closing the fence.
# shellcheck disable=SC2016
fenced() { printf '\n\n```text\n%s\n```' "${1//\`/\'}"; }
live && : "${GITHUB_REPOSITORY:?set GITHUB_REPOSITORY, or DRY_RUN=1}"
REPO="${GITHUB_REPOSITORY:-owner/repo}"
[ -z "$(git status --porcelain)" ] || die "the working tree is not clean"

listing="$("$SCRIPTS/upstream-review.sh" --stat --tip)"
count="$(sed -n 's/^  commits to review: *//p' <<<"$listing")"
end="$(sed -n 's/^  window end: *\([0-9a-f]\{40\}\).*/\1/p' <<<"$listing")"
[[ "$count" =~ ^[0-9]+$ && -n "$end" ]] || die "could not read the driver's listing"
short="$(git rev-parse --short "$end")"
commits="$count commits"; [ "$count" -eq 1 ] && commits="1 commit"
base="$(git rev-parse HEAD)"

# The rolling branch as the remote holds it: absent, bot (every commit on it past main is this
# script's) or foreign. $seen is its tip, for the push lease.
branch=absent seen="" issue="" pr=""
if live; then
  gh label create "$LABEL" --repo "$REPO" --color 1d76db --force \
    --description "Upstream commits waiting for review" >/dev/null
  issue="$(gh issue list --repo "$REPO" --label "$LABEL" --state open --json number --jq '.[0].number // empty')"
  pr="$(gh pr list --repo "$REPO" --head "$BRANCH" --state open --json number --jq '.[0].number // empty')"
  if git fetch -q origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" 2>/dev/null; then
    seen="$(git rev-parse "origin/$BRANCH")"
    committers="$(git log --first-parent --format=%ce "$base..$seen")"
    branch=bot
    if [ -n "$committers" ] && grep -qvxF "$BOT_EMAIL" <<<"$committers"; then branch=foreign; fi
  fi
fi

# A draft nobody touched is stale once main carries the window some other way.
retire_draft() {
  if [ -n "$pr" ] && [ "$branch" = bot ]; then
    gh pr close "$pr" --repo "$REPO" --delete-branch --comment "$1" >/dev/null
  fi
}

if [ "$count" -eq 0 ]; then
  echo "Up to date with upstream at $short."
  retire_draft "The watermark reached upstream's tip ($short) without this draft."
  if [ -n "$issue" ]; then
    gh issue close "$issue" --repo "$REPO" --comment "The watermark reached upstream's tip ($short). Nothing is waiting for review."
  fi
  exit 0
fi

# Sets $draft to one paragraph for the issue: where the draft is, or why there is none.
draft_pull_request() {
  local title body gate conflicts log took
  title="chore(upstream): merge $short ($commits)"

  if git merge-base --is-ancestor "$end" "$base"; then
    retire_draft "\`main\` already carries \`$short\`."
    draft="No draft: \`main\` already carries \`$short\`. Only the review is outstanding."
    return 0
  fi
  if [ "$branch" = foreign ]; then
    draft="No new draft: \`$BRANCH\` carries commits that are not this workflow's, so it was left as it is. Once its pull request is merged with a merge commit, or the branch is deleted, the next run rebuilds it."
    return 0
  fi
  # No open pull request means an earlier run could not open one: rebuild so this run tries again.
  if [ -n "$pr" ] && git merge-base --is-ancestor "$end" "$seen" && git merge-base --is-ancestor "$base" "$seen"; then
    draft="Draft pull request: #$pr. It already merges \`$short\` into the current \`main\`."
    return 0
  fi

  git checkout -q -B "$BRANCH" "$base"
  git -c user.name="$BOT_NAME" -c user.email="$BOT_EMAIL" merge -q --no-ff --no-commit "$end" >/dev/null 2>&1 || true
  if ! log="$("$SCRIPTS/english-only.sh" 2>&1)"; then
    git merge --abort
    git checkout -q --detach "$base"
    draft="No draft: \`english-only.sh\` failed on the merge.$(fenced "$(tail -5 <<<"$log")")"
    return 0
  fi
  took="$(sed -n "s/^took upstream's //p" <<<"$log")"
  conflicts="$(git diff --name-only --diff-filter=U)"
  if [ -n "$conflicts" ]; then
    git merge --abort
    git checkout -q --detach "$base"
    draft="No draft: the merge conflicts in files the English-only script does not settle. Resolve them per the deviations table in a session.$(fenced "$(head -50 <<<"$conflicts")")"
    return 0
  fi
  python3 "$SCRIPTS/english-strings.py" >/dev/null 2>&1 || true
  git add -A
  gate="passes"
  python3 "$SCRIPTS/english-strings.py" --check >/dev/null 2>&1 || gate="FAILS (\`pnpm check:english\` says why)"
  git -c user.name="$BOT_NAME" -c user.email="$BOT_EMAIL" commit -q --no-verify -m "$title"
  [ -z "$took" ] || took="
- \`english-only.sh\` took upstream's whole side of these English catalog files, so a sentence the fork added or reworded there needs re-applying by hand:$(fenced "$took")"

  body="## Summary

Unattended merge of upstream \`$short\` ($commits past the watermark) into \`main\`, opened by the \`Upstream sync\` workflow for review. Nothing here has been read by a person or an agent.

Still to do before this merges, per \`.claude/skills/upstream-review/SKILL.md\`: classify each commit, write the decision log, apply any SKIP revert and fork fix, regenerate what the window touches (OpenAPI spec, demo data), and \`--advance $end\`.

## Validation

- \`english-only.sh\` and \`english-strings.py\` ran after the merge. The English gate $gate.$took
- Nothing else ran before this opened. CI runs on the pull request; GitHub may ask for the run to be approved in the merge box first.

## Safety

- [ ] No keys, tokens, auth files or production data in the diff, description or screenshots.
- [ ] User-facing copy is translated in every supported locale.
- [ ] Persistence changes preserve forward migrations and immutable history.
- [ ] Response changes preserve the documented DTO and credential boundaries."

  if ! live; then
    printf '=== pull request: %s\n%s\n' "$title" "$body"
    draft="(dry run) merged locally on \`$BRANCH\`; the English gate $gate."
    return 0
  fi

  gh auth setup-git
  # The lease refuses the push if the branch moved since it was read; an empty one requires it absent.
  if ! log="$(git push --force-with-lease="refs/heads/$BRANCH:$seen" origin "HEAD:refs/heads/$BRANCH" 2>&1)"; then
    draft="No draft: the merge is clean but the push was refused.$(fenced "$(tail -5 <<<"$log")")"
    return 0
  fi
  if [ -n "$pr" ]; then
    gh pr edit "$pr" --repo "$REPO" --title "$title" --body "$body" >/dev/null
  elif ! log="$(gh pr create --repo "$REPO" --draft --base main --head "$BRANCH" --title "$title" --body "$body" 2>&1)"; then
    draft="The merge is pushed to \`$BRANCH\` but the pull request could not be opened. Open it from https://github.com/$REPO/compare/main...$BRANCH?expand=1$(fenced "$(tail -3 <<<"$log")")"
    return 0
  else
    pr="${log##*/}"
  fi
  draft="Draft pull request: #$pr. The English gate $gate."
}

draft=""
draft_pull_request

# GitHub refuses an issue body past 65536 characters.
if [ "${#listing}" -gt 55000 ]; then
  listing="${listing:0:55000}"$'\n... cut; run upstream-review.sh --stat --tip for the rest'
fi
issue_title="Upstream sync: $commits to review through $short"
issue_body="Upstream has $commits past the review watermark, through \`$short\`.

$draft

Review with \`/upstream-review\`. This issue closes itself once the watermark reaches upstream's tip.$(fenced "$listing")"

if ! live; then
  printf '=== issue: %s\n%s\n' "$issue_title" "$issue_body"
elif [ -n "$issue" ]; then
  gh issue edit "$issue" --repo "$REPO" --title "$issue_title" --body "$issue_body" >/dev/null
  echo "Updated issue #$issue."
else
  gh issue create --repo "$REPO" --label "$LABEL" --title "$issue_title" --body "$issue_body"
fi
