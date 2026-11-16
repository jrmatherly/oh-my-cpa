#!/usr/bin/env bash
# Helpers for cutting a fork release. Each subcommand reads or checks; only `bump` edits files,
# and nothing here commits, tags or pushes.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
REPO="jrmatherly/oh-my-cpa"
IMAGE="ghcr.io/$REPO"
VERSIONED=(package.json web/package.json deploy/site/docs/package.json)
STABLE='^[0-9]+\.[0-9]+\.[0-9]+$'

current_version() { node -p 'require("./package.json").version'; }

status() {
  local last version
  last="$(git describe --tags --abbrev=0 --match 'v1.*' 2>/dev/null || echo none)"
  version="$(current_version)"
  echo "branch:           $(git rev-parse --abbrev-ref HEAD) at $(git rev-parse --short HEAD)"
  echo "tree:             $([ -z "$(git status --porcelain)" ] && echo clean || echo DIRTY)"
  echo "package version:  $version$(git rev-parse -q --verify "refs/tags/v$version" >/dev/null && echo '  (already tagged: bump before releasing)')"
  for file in "${VERSIONED[@]}"; do
    [ "$(node -p "require('./$file').version")" = "$version" ] || echo "MISMATCH:         $file"
  done
  echo "last fork tag:    $last"
  if [ "$last" != none ]; then
    echo "commits since:    $(git rev-list --count "$last"..HEAD)"
    git log --oneline --no-merges "$last"..HEAD | sed 's/^/  /'
    echo "migrations added: $(git diff --name-only --diff-filter=A "$last"..HEAD -- migrations | wc -l | tr -d ' ')"
  fi
  [ -f "docs/releases/v$version.md" ] && echo "release note:     docs/releases/v$version.md" || echo "release note:     MISSING for v$version"
  echo "upstream:"
  .claude/skills/upstream-review/scripts/upstream-review.sh --stat 2>/dev/null | grep -E 'commits to review|Up to date' | sed 's/^/  /' || true
}

bump() {
  local next="${1:?usage: release.sh bump <MAJOR.MINOR.PATCH>}"
  [[ "$next" =~ $STABLE ]] || { echo "not a stable version: $next" >&2; exit 2; }
  for file in "${VERSIONED[@]}"; do
    # Replace only the package's own version line, and keep the file's formatting.
    NEXT="$next" node -e '
      const fs = require("fs"), file = process.argv[1];
      const text = fs.readFileSync(file, "utf8");
      const out = text.replace(/^(\s*"version":\s*")[^"]+(")/m, `$1${process.env.NEXT}$2`);
      if (out === text) { console.error(`${file}: version unchanged`); process.exit(1); }
      fs.writeFileSync(file, out);
    ' "$file"
    echo "bumped $file to $next"
  done
  RELEASE_TAG="v$next" node scripts/release-plan.mjs >/dev/null && echo "release plan accepts v$next"
}

# What a published release must show: every attachment, a manifest signed by the committed key
# that names the tag, and the same digest behind the anonymous version tags.
verify() {
  local tag="${1:?usage: release.sh verify <vMAJOR.MINOR.PATCH>}" version dir failed=0
  version="${tag#v}"
  dir="$(mktemp -d)"
  trap 'rm -rf "$dir"' RETURN

  local state
  state="$(gh release view "$tag" --repo "$REPO" --json isDraft,isPrerelease,assets \
    --jq '"draft=\(.isDraft) prerelease=\(.isPrerelease) assets=\(.assets | length)"')"
  echo "release:   $state"
  [ "$state" = "draft=false prerelease=false assets=14" ] || { echo "  FAIL: want a public release with 14 assets"; failed=1; }

  gh release download "$tag" --repo "$REPO" --dir "$dir" \
    --pattern release-manifest.json --pattern release-manifest.json.sig --pattern checksums.txt
  local digest
  digest="$(DIR="$dir" TAG="$tag" IMAGE="$IMAGE" node --input-type=module -e '
    import fs from "node:fs";
    import { verifyManifest } from "./scripts/sign-release-manifest.mjs";
    const dir = process.env.DIR;
    const manifest = fs.readFileSync(`${dir}/release-manifest.json`, "utf8");
    const signature = fs.readFileSync(`${dir}/release-manifest.json.sig`, "utf8").trim();
    const key = fs.readFileSync("internal/updater/release_public_key.txt", "utf8").trim();
    if (!verifyManifest(manifest, signature, key)) { console.error("signature does not verify"); process.exit(1); }
    const parsed = JSON.parse(manifest);
    if (parsed.version !== process.env.TAG) { console.error(`manifest names ${parsed.version}`); process.exit(1); }
    if (parsed.image.repository !== process.env.IMAGE) { console.error(`manifest names ${parsed.image.repository}`); process.exit(1); }
    console.log(parsed.image.digest);
  ')" || { echo "manifest:  FAIL"; return 1; }
  echo "manifest:  signed by the committed key, names $tag, digest $digest"

  local token
  token="$(curl -fsS "https://ghcr.io/token?scope=repository:$REPO:pull" | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')"
  for name in "$tag" "$version" latest; do
    local got
    got="$(curl -fsSI -H "Authorization: Bearer $token" \
      -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json' \
      "https://ghcr.io/v2/$REPO/manifests/$name" | tr -d '\r' | awk 'tolower($1)=="docker-content-digest:"{print $2}')"
    if [ "$got" = "$digest" ]; then echo "image:     $IMAGE:$name resolves anonymously to the signed digest"
    else echo "image:     FAIL $IMAGE:$name is ${got:-unreachable}"; failed=1; fi
  done
  return "$failed"
}

case "${1:-}" in
  status) status ;;
  bump) shift; bump "$@" ;;
  verify) shift; verify "$@" ;;
  *) echo "usage: release.sh status | bump <MAJOR.MINOR.PATCH> | verify <vMAJOR.MINOR.PATCH>" >&2; exit 2 ;;
esac
