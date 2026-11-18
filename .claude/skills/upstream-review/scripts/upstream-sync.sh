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
# The draft lives on one rolling branch that the script rebuilds from the checked-out commit
# (main in the workflow) and force-pushes. Once anyone else commits to that branch the script
# leaves it alone, and says so in the issue while there are commits to review.
#
# USAGE
#   GITHUB_REPOSITORY=owner/repo GH_TOKEN=... upstream-sync.sh
#   DRY_RUN=1 upstream-sync.sh    merge locally and print the issue text, plus the pull request
#                                 text when the merge commits; write nothing to GitHub. Resets a
#                                 local sync/upstream-auto: a clean merge leaves the checkout on
#                                 it, a failed one leaves HEAD detached at the start commit.
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
# Text from upstream or from a tool's error output is untrusted: fence it, and keep it from
# closing the fence.
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

# Once upstream is merged, the tree is upstream's to write: a file it adds beside these helpers
# would be run or imported with them. Run copies taken before the merge, outside the tree, with
# no token and Python in isolated mode.
trusted="$(mktemp -d)"
trap 'rm -rf "$trusted"' EXIT
cp "$SCRIPTS/english-only.sh" "$SCRIPTS/english-strings.py" "$trusted/"
helper() { env -u GH_TOKEN -u GITHUB_TOKEN "$@"; }

# The rolling branch as the remote holds it: absent, bot (every first-parent commit past the
# start commit has the bot's committer email) or foreign. Always absent in a dry run. $seen is
# its tip.
branch=absent seen="" issue="" pr=""
if live; then
  gh auth setup-git
  gh label create "$LABEL" --repo "$REPO" --color 1d76db --force \
    --description "Upstream commits waiting for review" >/dev/null
  issue="$(gh issue list --repo "$REPO" --label "$LABEL" --state open --json number --jq '.[0].number // empty')"
  # --head matches a branch name in any fork, so keep only this repository's pull request into main.
  pr="$(gh pr list --repo "$REPO" --head "$BRANCH" --state open --json number,isCrossRepository,baseRefName \
    --jq '[.[] | select((.isCrossRepository | not) and .baseRefName == "main")][0].number // empty')"
  # A failed read must not pass for "absent": the run would report a refused push over a good draft.
  if git ls-remote --exit-code origin "refs/heads/$BRANCH" >/dev/null; then
    git fetch -q origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
    seen="$(git rev-parse "origin/$BRANCH")"
    committers="$(git log --first-parent --format=%ce "$base..$seen")"
    branch=bot
    if [ -n "$committers" ] && grep -qvxF "$BOT_EMAIL" <<<"$committers"; then branch=foreign; fi
  elif [ $? -ne 2 ]; then
    die "could not read $BRANCH on origin"
  fi
fi

# A draft nobody touched is stale once the watermark or main has passed it without it.
retire_draft() {
  if [ -n "$pr" ] && [ "$branch" = bot ]; then
    # Delete under the lease first: a commit pushed since the branch was read keeps both its
    # branch and its pull request. GitHub may already have closed the pull request with its
    # branch; `gh pr close` then does nothing, which is why the comment is posted on its own.
    if git push -q --force-with-lease="refs/heads/$BRANCH:$seen" origin ":refs/heads/$BRANCH"; then
      gh pr comment "$pr" --repo "$REPO" --body "$1" >/dev/null
      gh pr close "$pr" --repo "$REPO" >/dev/null
    else
      echo "left $BRANCH and its pull request: the branch moved after it was read" >&2
    fi
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
  local title body gate gate_detail="" conflicts log took workflows
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
  # Neither token this job is meant to hold can push a workflow change, and one that could
  # would start that workflow from the branch, with this repository's secrets, before anyone
  # had read it. Either way a person merges this window.
  workflows="$(git diff --name-only "$base...$end" -- .github/workflows)"
  if [ -n "$workflows" ]; then
    draft="No draft: the window changes workflow files. A branch that holds them runs them with this repository's secrets, so read them and merge in a session.$(fenced "$workflows")"
    return 0
  fi
  # Without an open pull request (an earlier run could not open one, or someone closed it),
  # rebuild so this run opens one.
  if [ -n "$pr" ] && git merge-base --is-ancestor "$end" "$seen" && git merge-base --is-ancestor "$base" "$seen"; then
    draft="Draft pull request: #$pr. It already merges \`$short\` into the current \`main\`."
    return 0
  fi

  git checkout -q -B "$BRANCH" "$base"
  # A conflict exits non-zero and is settled below. A merge that never started is a failure.
  log="$(git -c user.name="$BOT_NAME" -c user.email="$BOT_EMAIL" merge -q --no-ff --no-commit "$end" 2>&1)" || true
  if ! git rev-parse -q --verify MERGE_HEAD >/dev/null; then
    git checkout -q --detach "$base"
    draft="No draft: \`git merge\` failed before it started.$(fenced "$(tail -5 <<<"$log")")"
    return 0
  fi
  if ! log="$(helper bash "$trusted/english-only.sh" 2>&1)"; then
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
  # The rewrite exits 1 while Chinese it has no phrase for remains; the check below reports it.
  helper python3 -I "$trusted/english-strings.py" >/dev/null 2>&1 || true
  git add -A
  gate="passes"
  if ! log="$(helper python3 -I "$trusted/english-strings.py" --check 2>&1)"; then
    gate="FAILS"
    gate_detail="$(fenced "$(tail -15 <<<"$log")")"
  fi
  git -c user.name="$BOT_NAME" -c user.email="$BOT_EMAIL" commit -q --no-verify -m "$title"
  [ -z "$took" ] || took="
- \`english-only.sh\` took upstream's whole side of these English catalog files, so a sentence the fork added or reworded there needs re-applying by hand:$(fenced "$took")"

  body="## Summary

Unattended merge of upstream \`$short\` ($commits past the watermark) into \`main\`, opened by the \`Upstream sync\` workflow for review. Nothing here has been read by a person or an agent.

Still to do before this merges, per \`.claude/skills/upstream-review/SKILL.md\`: classify each commit, write the decision log, apply any SKIP revert and fork fix, regenerate what the window touches (OpenAPI spec, demo data), and \`--advance $end\`.

## Validation

- \`english-only.sh\` and \`english-strings.py\` ran after the merge. The English gate $gate.$gate_detail$took
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

  # The lease refuses the push if the branch moved since it was read; an empty one requires it absent.
  if ! log="$(git push --force-with-lease="refs/heads/$BRANCH:$seen" origin "HEAD:refs/heads/$BRANCH" 2>&1)"; then
    draft="No draft: the merge is clean but the push was refused.$(fenced "$(tail -5 <<<"$log")")"
    return 0
  fi
  if [ -n "$pr" ]; then
    if ! log="$(gh pr edit "$pr" --repo "$REPO" --title "$title" --body "$body" 2>&1)"; then
      draft="Draft pull request: #$pr. Its branch is pushed but its description could not be updated and is stale.$(fenced "$(tail -3 <<<"$log")")"
      return 0
    fi
  elif log="$(gh pr create --repo "$REPO" --draft --base main --head "$BRANCH" --title "$title" --body "$body" 2>&1)" \
    && [[ "${log##*/}" =~ ^[0-9]+$ ]]; then
    pr="${log##*/}"
  else
    draft="The merge is pushed to \`$BRANCH\` but the pull request could not be opened. Open it from https://github.com/$REPO/compare/main...$BRANCH?expand=1$(fenced "$(tail -3 <<<"$log")")"
    return 0
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
