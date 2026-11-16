#!/usr/bin/env bash
# english-only.sh - re-apply the mechanical half of this fork's English-only deviation.
#
# Upstream ships four reading languages with Simplified Chinese as the typed source. This fork
# ships English only, with English as the source. Upstream keeps editing the catalogs it still
# has, so after every merge the removed ones come back as conflicts and the English files regain
# their link to the Chinese source. Run this after `git merge` (conflicts and all) and it
# converges the tree again. It is idempotent: a second run changes nothing.
#
# It does two things, and nothing else (the hand-edited files are in the deviations table):
#   1. removes the catalogs this fork does not ship;
#   2. makes each English domain file a plain object, since it is now the source it was checked against.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
LOCALES=web/src/i18n/locales

# Every language directory but English goes, so a language upstream adds later goes too.
for dir in "$LOCALES"/*/; do
  lang="$(basename "$dir")"
  [ "$lang" = en ] && continue
  git rm -r -q -f --ignore-unmatch -- "$LOCALES/$lang"
  rm -rf -- "${LOCALES:?}/$lang"
  echo "removed $LOCALES/$lang"
done

for file in "$LOCALES"/en/*.ts; do
  [ -e "$file" ] || continue
  if git ls-files -u -- "$file" | grep -q .; then
    if ! git ls-files -u -- "$file" | awk '$3 == 3' | grep -q .; then
      # Upstream deleted this domain file; the index it also edited no longer names it.
      git rm -q -f -- "$file"
      echo "removed $file (deleted upstream)"
      continue
    fi
    # We only ever strip lines from these files, so upstream's side is the whole truth. A fork
    # edit to an English sentence in a conflicted file is lost here: re-apply it after the run.
    git checkout --theirs -- "$file"
    conflicted=1
    echo "took upstream's $file"
  else
    conflicted=0
  fi
  before="$(git hash-object "$file")"
  perl -0pi -e '
    s{^import type \{ Translation \} from \x27\.\./\.\./catalog\x27;\n}{}m;
    s{^import type source from \x27\.\./zh/[^\x27]+\x27;\n\n?}{}m;
    s{\} satisfies Translation<typeof source>;}{\};};
    s{^import type \{ Catalog \} from \x27\.\./\.\./catalog\x27;\n}{}m;
    s{\} satisfies Catalog;}{\};};
  ' "$file"
  # Stage only what this run settled, never an unrelated local edit.
  if [ "$conflicted" = 1 ] || [ "$before" != "$(git hash-object "$file")" ]; then git add -- "$file"; fi
done

# An English domain file upstream deleted while we had stripped it shows up outside the glob above.
git ls-files -u -- "$LOCALES/en" | awk '{print $4}' | sort -u | while IFS= read -r file; do
  [ -e "$file" ] && continue
  git rm -q -f --ignore-unmatch -- "$file"
  echo "removed $file (deleted upstream)"
done

if grep -rnE "satisfies (Translation|Catalog)|import type .*(catalog|/zh/)" "$LOCALES/en" >/dev/null; then
  echo "ERROR: an English catalog file still refers to the Chinese source" >&2
  exit 1
fi
echo "English catalogs are the source."
