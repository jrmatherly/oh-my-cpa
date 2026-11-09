#!/bin/bash
# PostToolUse hook for Edit|Write. Mirrors two CI gates at edit time: gofmt on Go
# files, and the four-locale rule for the i18n catalogs.
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
    others=$(ls "$(dirname "$(dirname "$file_path")")" | grep -vx "$locale" | tr '\n' ' ')
    jq -n --arg ctx "The $locale catalog changed. The same keys exist in the ${others}catalogs (web/src/i18n/locales/), and 'pnpm check-i18n' verifies placeholders, plurals and unused keys across all four." \
      '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$ctx}}' ;;
esac
exit 0
