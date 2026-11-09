#!/usr/bin/env bash
# upstream-review.sh - list, classify, dry-run and watermark upstream (WizisCool/oh-my-cpa)
# commits for this fork.
#
# This repo is a GitHub fork sharing history with upstream, so the merge-base of HEAD and
# upstream/main is the last upstream commit our tree carries wholesale, and GitHub's fork
# compare counts commits across the network. Sync is merge-first (see SKILL.md); the driver
# answers "what is new", "what would conflict" and "what does GitHub think" before anything
# is touched.
#
# .upstream-review/watermark.json holds:
#   forkPointSha     the upstream commit the fork started tracking from (history; fixed)
#   lastReviewedSha  the last upstream commit we assessed (advances per review)
#
# The window runs from lastReviewedSha to the END ref: the newest upstream release tag
# (refs/remotes/upstream/tags/v*) that is past the watermark, or upstream/main when no tag
# is newer. --tip forces upstream/main. Upstream's tags live under refs/remotes/upstream/tags/
# so they never collide with the tags this fork cuts for its own releases.
#
# USAGE (from anywhere inside the repo)
#   upstream-review.sh [--tip]            fetch, list un-reviewed commits in the window (oldest first)
#   upstream-review.sh --stat [--tip]     same, plus each touched file with a marker (below)
#   upstream-review.sh --urls [--tip]     same, plus a github.com commit URL per commit
#   upstream-review.sh --show <sha>       one upstream commit's full diff
#   upstream-review.sh --diverged         our footprint: files where HEAD differs from the merge-base
#   upstream-review.sh --dry-run-merge    merge the window END in memory (git merge-tree); exit 1 on conflict
#   upstream-review.sh --github           GitHub's view: ahead/behind/status for main and the current branch
#   upstream-review.sh --advance <sha>    set lastReviewedSha to the END SHA printed by the listing you reviewed
#
# Tags on a listed commit: [merge] (parents are in the range), [picked] (an earlier cherry-pick
# already carries this patch, by patch id), [merged] (already an ancestor of HEAD; classify it
# anyway and revert it if SKIP), [release vX] (upstream tagged this commit).
#
# Markers in --stat compare our HEAD with the commit's own parent (the pre-image a merge merges from):
#   =   our file equals the pre-image             clean for this file
#   <   equals the merge-base, not the pre-image  an earlier un-reviewed upstream commit touched it; comes along
#   ~   differs from both                         we changed it; expect a conflict, resolve per the deviations table
#   x   we removed it                             skip unless we want the file back
#   +   new upstream file                         the merge creates it
#   bin binary file                               inspect by hand
# Only --advance writes a file, the watermark, after a decision log under .upstream-review/reviews/
# names the SHA.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
STATE="$REPO_ROOT/.upstream-review/watermark.json"

die() { echo "ERROR: $*" >&2; exit 1; }
[ -f "$STATE" ] || die "missing $STATE"
command -v jq >/dev/null || die "jq is required"

require() { [ -n "$2" ] || die "watermark.json: $1 is missing"; }
is_sha()  { [[ "$1" =~ ^[0-9a-f]{40}$ ]] || die "watermark.json: $2 is not a full SHA: $1"; }
is_name() { [[ "$1" =~ ^[A-Za-z0-9._][A-Za-z0-9._/-]*$ ]] || die "watermark.json: $2 is not a safe git name: $1"; }

IFS=$'\t' read -r URL REMOTE BRANCH FORK FORK_DATE WATERMARK WATERMARK_DATE < <(
  jq -r '[.upstreamUrl, .upstreamRemote, .upstreamBranch, .forkPointSha, .forkPointDate, .lastReviewedSha, .lastReviewedDate] | map(. // "") | @tsv' "$STATE")
require upstreamUrl "$URL"
require upstreamRemote "$REMOTE";     is_name "$REMOTE" upstreamRemote
require upstreamBranch "$BRANCH";     is_name "$BRANCH" upstreamBranch
require forkPointSha "$FORK";         is_sha "$FORK" forkPointSha
require lastReviewedSha "$WATERMARK"; is_sha "$WATERMARK" lastReviewedSha
[[ "$URL" =~ ^https://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(\.git)?$ ]] || die "watermark.json: upstreamUrl must be a plain https github.com URL"
TIP="refs/remotes/$REMOTE/$BRANCH"
TAGNS="refs/remotes/$REMOTE/tags"
UP_REPO="${URL#https://github.com/}"; UP_REPO="${UP_REPO%.git}"   # owner/repo
GH_WEB="https://github.com/$UP_REPO/commit"

g() { git -C "$REPO_ROOT" "$@"; }

ensure_upstream() {
  local have
  if have="$(g remote get-url -- "$REMOTE" 2>/dev/null)"; then
    [ "$have" = "$URL" ] || die "remote '$REMOTE' points at $have, watermark.json says $URL"
  else
    echo "[upstream-review] adding remote $REMOTE -> $URL" >&2
    g remote add --no-tags -- "$REMOTE" "$URL"
  fi
  echo "[upstream-review] fetching $REMOTE/$BRANCH and its v* tags" >&2
  if ! g fetch -q --no-tags -- "$REMOTE" "+refs/heads/$BRANCH:$TIP" "+refs/tags/v*:$TAGNS/v*"; then
    g rev-parse -q --verify "$TIP" >/dev/null || die "fetch failed and no cached $TIP"
    echo "[upstream-review] fetch failed; using cached $TIP" >&2
  fi
  g merge-base --is-ancestor "$WATERMARK" "$TIP" || die "lastReviewedSha is not an ancestor of $REMOTE/$BRANCH (history rewritten?)"
  BASE="$(g merge-base HEAD "$TIP")"
  pick_end
}

# END is the newest upstream release tag past the watermark, else the tip. --tip overrides.
pick_end() {
  END="$TIP"; END_LABEL="tip"
  [ "${USE_TIP:-0}" = 1 ] && return 0
  local tag
  tag="$(g for-each-ref --sort=-creatordate --format='%(refname)' "$TAGNS/v*" |
    while read -r ref; do
      g merge-base --is-ancestor "$ref" "$TIP" || continue
      g merge-base --is-ancestor "$ref" "$WATERMARK" && continue
      echo "$ref"; break
    done)"
  [ -n "$tag" ] || return 0
  # Peel an annotated tag so END is the commit the listing, the log and --advance all name.
  END="$(g rev-parse "$tag^{commit}")"; END_LABEL="release ${tag#"$TAGNS"/}"
}

release_tag_of() {  # upstream tag(s) pointing at this commit, if any
  g for-each-ref --points-at "$1" --format='%(refname:strip=4)' "$TAGNS/v*" | tr '\n' ' '
}

# One line per file the commit touches: marker, +adds, -dels, path.
stat_commit() {
  local commit="$1" meta path pre head base i j n=0
  local paths pres heads bases adds dels; paths=(); pres=(); heads=(); bases=(); adds=(); dels=()
  while IFS= read -r -d '' meta && IFS= read -r -d '' path; do
    read -r _ _ pre _ <<<"$meta"
    paths[n]="$path"; pres[n]="$pre"; n=$((n+1))
  done < <(g diff-tree --no-commit-id --no-renames -r -z --raw "$commit")
  [ "$n" -gt 0 ] || return 0
  i=0
  while IFS=$'\t' read -r -d '' add del path; do adds[i]="$add"; dels[i]="$del"; i=$((i+1)); done < <(g diff-tree --no-commit-id --no-renames -r -z --numstat "$commit")
  i=0
  while read -r head _ && read -r base _; do heads[i]="$head"; bases[i]="$base"; i=$((i+1)); done < <(
    for ((j=0; j<n; j++)); do printf 'HEAD:%s\n%s:%s\n' "${paths[j]}" "$BASE" "${paths[j]}"; done |
    g cat-file --batch-check='%(objectname) %(objecttype)' | sed 's/^.* missing$/- missing/')
  for ((i=0; i<n; i++)); do
    pre="${pres[i]}"; head="${heads[i]}"; base="${bases[i]}"
    if [ "${adds[i]}" = "-" ]; then m=bin
    elif [[ "$pre" =~ ^0+$ ]]; then
      if [ "$head" = "-" ]; then m="+"; elif [ "$head" = "$base" ]; then m="<"; else m="~"; fi
    elif [ "$head" = "-" ]; then m=x
    elif [ "$head" = "$pre" ]; then m="="
    elif [ "$head" = "$base" ]; then m="<"
    else m="~"; fi
    [ "$m" = bin ] && printf '      %-3s %5s %5s  %s\n' bin "" "" "${paths[i]}" || printf '      %-3s %5s %5s  %s\n' "$m" "+${adds[i]}" "-${dels[i]}" "${paths[i]}"
  done
}

github_view() {
  command -v gh >/dev/null || die "--github needs the gh CLI"
  local origin our_repo branch refs ref
  origin="$(g remote get-url origin)"
  our_repo="${origin#https://github.com/}"; our_repo="${our_repo#git@github.com:}"; our_repo="${our_repo%.git}"
  branch="$(g rev-parse --abbrev-ref HEAD)"
  echo "GitHub fork compare (counts commits, not patches: a cherry-pick still reads as behind until merged)"
  refs=main; [ "$branch" = main ] || refs="main $branch"
  for ref in $refs; do
    printf '  %-28s ' "$UP_REPO:$BRANCH...$ref"
    gh api "repos/$our_repo/compare/${UP_REPO%%/*}:$BRANCH...$ref" \
      --jq '"status=\(.status) ahead_by=\(.ahead_by) behind_by=\(.behind_by)"' 2>/dev/null || echo "(compare failed; branch not pushed?)"
  done
  echo "  web: https://github.com/$our_repo/compare/$branch...${UP_REPO%%/*}:$BRANCH   (what a merge would bring in)"
  echo "  web: https://github.com/$UP_REPO/compare/$BRANCH...${our_repo%%/*}:$branch   (our deviations, as upstream would see them)"
}

USE_TIP=0
args=()
for a in "$@"; do case "$a" in --tip) USE_TIP=1 ;; *) args+=("$a") ;; esac; done
set -- "${args[@]+"${args[@]}"}"
cmd="${1:-list}"
case "$cmd" in
  --show)
    [ $# -ge 2 ] || die "--show needs a <sha>"
    ensure_upstream
    sha="$(g rev-parse -q --verify "$2^{commit}")" || die "not a commit: $2"
    g show "$sha"; exit 0 ;;
  --diverged)
    ensure_upstream
    echo "Files where our HEAD differs from the merge-base $(g rev-parse --short "$BASE") (fork point $(g rev-parse --short "$FORK")):"
    g diff --stat=120 "$BASE" HEAD; exit 0 ;;
  --dry-run-merge)
    ensure_upstream
    echo "Dry-run merge of $END_LABEL ($(g rev-parse --short "$END")) into HEAD (git merge-tree, nothing checked out):"
    if out="$(g merge-tree --write-tree --name-only HEAD "$END")"; then
      echo "  clean. Merged tree $(echo "$out" | head -1 | cut -c1-12); \`git merge $(g rev-parse --short "$END")\` will not conflict."
      exit 0
    else
      rc=$?
      [ "$rc" -eq 1 ] || { echo "ERROR: merge-tree failed (exit $rc): $out" >&2; exit 2; }
      echo "  CONFLICTS in:"; echo "$out" | sed '1d;/^$/,$d' | sed 's/^/    /'
      echo "  Resolve per the deviations table in SKILL.md, or cherry-pick around them."
      exit 1
    fi ;;
  --github)
    ensure_upstream
    github_view; exit 0 ;;
  --advance)
    [ $# -ge 2 ] || die "--advance needs the END <sha> you reviewed (printed by the listing)"
    ensure_upstream
    NEWSHA="$(g rev-parse -q --verify "$2^{commit}")" || die "not a commit: $2"
    g merge-base --is-ancestor "$NEWSHA" "$TIP" || die "$2 is not on $REMOTE/$BRANCH"
    NEWSHORT="$(g rev-parse --short "$NEWSHA")"
    g merge-base --is-ancestor "$WATERMARK" "$NEWSHA" || die "watermark would move backward: current $(g rev-parse --short "$WATERMARK") is not an ancestor of $NEWSHORT"
    grep -rlq -- "$NEWSHORT" "$(dirname "$STATE")/reviews" 2>/dev/null || die "no decision log mentions $NEWSHORT; write .upstream-review/reviews/<date>-review.md first"
    NEWDATE="$(g log -1 --date=short --pretty=%ad "$NEWSHA")"
    NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    tmp="$(mktemp "$(dirname "$STATE")/.watermark.XXXXXX")"
    trap 'rm -f "$tmp"' EXIT
    jq --arg s "$NEWSHA" --arg ss "$NEWSHORT" --arg d "$NEWDATE" --arg n "$NOW" \
      '.lastReviewedSha=$s | .lastReviewedShaShort=$ss | .lastReviewedDate=$d | .lastAdvancedAt=$n' \
      "$STATE" > "$tmp" || die "jq failed; watermark left unchanged"
    mv "$tmp" "$STATE"
    echo "[upstream-review] watermark -> $NEWSHORT ($NEWDATE). Commit .upstream-review/ to share it." >&2
    exit 0 ;;
  -h|--help) sed -n '2,42p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  list|--stat|--urls) ;;
  *) die "unknown option '$cmd' (see --help)" ;;
esac

ensure_upstream
RANGE="$WATERMARK..$END"
COUNT="$(g rev-list --count "$RANGE")"
UNMERGED="$(g rev-list --count "HEAD..$END")"
BEYOND="$(g rev-list --count "$END..$TIP")"
ENDSHA="$(g rev-parse "$END")"
echo "Upstream review: $REMOTE/$BRANCH"
echo "  fork point:          $(g rev-parse --short "$FORK") $FORK_DATE"
echo "  merge-base:          $(g rev-parse --short "$BASE")"
echo "  last reviewed:       $(g rev-parse --short "$WATERMARK") $WATERMARK_DATE"
echo "  window end:          $ENDSHA  ($END_LABEL)"
echo "  commits to review:   $COUNT"
echo "  not yet merged:      $UNMERGED  (what merging the window end would bring; picked ones included)"
[ "$BEYOND" -gt 0 ] && echo "  beyond the window:   $BEYOND  (on $REMOTE/$BRANCH after $END_LABEL; --tip includes them)"
[ "$COUNT" -eq 0 ] && { echo "Up to date."; exit 0; }

PICKED=" $(g rev-list --cherry-mark --right-only --no-merges "HEAD...$END" | awk '/^=/{print substr($1,2)}' | tr '\n' ' ') "

g log --reverse --date=short --pretty='%H%x09%h%x09%ad%x09%p%x09%s' "$RANGE" |
while IFS=$'\t' read -r full short date parents subj; do
  tag=""; case "$parents" in *" "*) tag="  [merge]";; esac
  case "$PICKED" in *" $full "*) tag="$tag  [picked]";; esac
  g merge-base --is-ancestor "$full" HEAD && tag="$tag  [merged]"
  rel="$(release_tag_of "$full")"; [ -n "$rel" ] && tag="$tag  [release ${rel% }]"
  echo
  echo "* $short  $date  $subj$tag"
  [ "$cmd" = "--urls" ] && echo "    $GH_WEB/$full"
  if [ "$cmd" = "--stat" ] && [[ "$tag" != *"[merge]"* ]]; then
    stat_commit "$full"
  fi
done

echo
echo "Next: classify each commit (see SKILL.md), run --dry-run-merge, write .upstream-review/reviews/$(date +%Y-%m-%d)-review.md"
echo "with 'Window: $(g rev-parse --short "$WATERMARK")..$ENDSHA', then: $0 --advance $ENDSHA"
