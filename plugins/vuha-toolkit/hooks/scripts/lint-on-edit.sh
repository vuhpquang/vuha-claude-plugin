#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): run prettier, then eslint --fix, on the file just edited,
# only in projects whose path matches VUHA_LINT_PATHS (an extended regex).
# Errors eslint cannot fix go back to Claude (exit 2) so it fixes them next.
set -uo pipefail

LINT_PATHS="${VUHA_LINT_PATHS:-/Work/Repos/momo/(mini-app|library)/}"

file=$(python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("tool_input") or {}).get("file_path",""))' 2>/dev/null)
[[ -n "$file" && -f "$file" ]] || exit 0
[[ "$file" =~ $LINT_PATHS ]] || exit 0
[[ "$file" == */node_modules/* ]] && exit 0

# The nearest folder up from the file that has the linters installed.
root=$(dirname "$file")
while [[ "$root" != "/" && ! -d "$root/node_modules/.bin" ]]; do root=$(dirname "$root"); done
bin="$root/node_modules/.bin"
[[ -d "$bin" ]] || exit 0
cd "$root" || exit 0

case "$file" in
  *.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs|*.json|*.md|*.css|*.scss|*.yml|*.yaml)
    [[ -x "$bin/prettier" ]] && "$bin/prettier" --write --log-level warn "$file" >/dev/null 2>&1 ;;
esac

case "$file" in
  *.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs)
    if [[ -x "$bin/eslint" ]]; then
      out=$("$bin/eslint" --fix --quiet "$file" 2>&1)
      if [[ $? -eq 1 && -n "$out" ]]; then
        echo "eslint --fix left errors in $file:" >&2
        echo "$out" | tail -n 30 >&2
        exit 2
      fi
    fi ;;
esac

exit 0
