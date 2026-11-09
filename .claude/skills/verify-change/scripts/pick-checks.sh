#!/bin/bash
# Prints (or with --run, runs) the lowest-layer checks from docs/testing.md that
# cover the files changed since <base> (default: HEAD, plus untracked files).
set -euo pipefail

run=0; base=HEAD
for arg in "$@"; do
  case "$arg" in --run) run=1 ;; *) base="$arg" ;; esac
done
root=$(git rev-parse --show-toplevel)
cd "$root"

files=$( { git diff --name-only "$base" --; git ls-files --others --exclude-standard; } | sort -u )
[ -z "$files" ] && { echo "No changed files relative to $base." >&2; exit 0; }

cmds=()
add() { cmds+=("$1"); }
changed() { printf '%s\n' "$files" | grep -qE "$1"; }

# Paths come from the repository, so each one is shell-quoted before it reaches eval.
quoted() { while IFS= read -r p; do printf '%q ' "$p"; done; }

go_files=$(printf '%s\n' "$files" | grep -E '\.go$' || true)
if [ -n "$go_files" ]; then
  go_pkgs=$(printf '%s\n' "$go_files" | while IFS= read -r f; do printf './%s\n' "${f%/*}"; done | sort -u | quoted)
  add "gofmt -l -- $(printf '%s\n' "$go_files" | quoted)"
  add "go test -short $go_pkgs"
  add "golangci-lint run $go_pkgs"
fi
changed '^migrations/' && add "go test -short ./internal/repository/..."

if changed '^(web/src|web/tests|scripts/acceptance)/'; then
  add "pnpm type-check"
  add "pnpm test:logic"
  changed '^web/tests/.*\.component\.test\.tsx$|^web/src/components/' && add "pnpm test:components"
  changed '\.module\.css$|\.tsx$' && add "pnpm check-css-modules"
  changed '^web/src/.*\.tsx?$' && add "pnpm check:feedback" && add "pnpm lint:antd"
  changed '^web/src/i18n/' && add "pnpm check-i18n"
fi
changed '^scripts/.*\.(mjs|ts)$' && add "pnpm type-check:tooling" && add "pnpm test:self"
changed '\.md$' && add "pnpm check-docs"
changed '^\.github/workflows/' && add "pnpm verify:workflow:lint"
changed '^(internal/api|internal/demo)/' && add "pnpm check:demo"

[ ${#cmds[@]} -eq 0 ] && { echo "No repository check maps to these files; review them by hand."; exit 0; }

printf '%s\n' "${cmds[@]}"
if [ "$run" -eq 1 ]; then
  status=0
  for c in "${cmds[@]}"; do
    echo; echo "▶ $c"
    if ! eval "$c"; then status=1; echo "✗ failed: $c" >&2; fi
  done
  exit $status
fi
