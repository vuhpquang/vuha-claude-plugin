#!/usr/bin/env bash
# `start` (UserPromptSubmit) stamps when the turn began; `stop` (Stop) shows a macOS
# notification when the turn took at least VUHA_NOTIFY_MIN_SECONDS (default 30).
set -uo pipefail

[[ "$(uname)" == "Darwin" ]] || exit 0

read -r session cwd < <(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("session_id","x"), d.get("cwd",""))' 2>/dev/null)
stamp="${TMPDIR:-/tmp}/vuha-turn-${session:-x}"

if [[ "${1:-}" == "start" ]]; then
  date +%s > "$stamp"
  exit 0
fi

[[ -f "$stamp" ]] || exit 0
elapsed=$(( $(date +%s) - $(cat "$stamp") ))
rm -f "$stamp"
(( elapsed >= ${VUHA_NOTIFY_MIN_SECONDS:-30} )) || exit 0

if (( elapsed >= 60 )); then took="$((elapsed / 60))m$((elapsed % 60))s"; else took="${elapsed}s"; fi
project=$(basename "${cwd:-$PWD}")

osascript -e "display notification \"Done after ${took}\" with title \"Claude Code\" subtitle \"${project//\"/}\" sound name \"Glass\"" >/dev/null 2>&1
exit 0
