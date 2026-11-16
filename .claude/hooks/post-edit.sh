#!/bin/bash
# PostToolUse hook for Edit|Write. Mirrors two CI gates at edit time: gofmt on Go
# files, and the English-only rule for the i18n catalog.
set -euo pipefail

input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file_path" ] || [ ! -f "$file_path" ] && exit 0

case "$file_path" in
  *.go)
    if [ -n "$(gofmt -l "$file_path" 2>/dev/null)" ]; then
      echo "gofmt: $file_path is not formatted. Run: gofmt -w $file_path" >&2
      exit 2
    fi ;;
  */web/src/i18n/locales/*/*.ts)
    locale=$(basename "$(dirname "$file_path")")
    if [ "$locale" = en ]; then
      ctx="The English catalog changed. It is this fork's only catalog and the typed source of every message id; 'pnpm check-i18n' verifies placeholders, plurals and unused keys."
    else
      ctx="This fork reads English only: web/src/i18n/locales/$locale must not exist. Put the copy in locales/en, or run .claude/skills/upstream-review/scripts/english-only.sh after an upstream merge."
    fi
    jq -n --arg ctx "$ctx" \
      '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$ctx}}' ;;
esac
exit 0
