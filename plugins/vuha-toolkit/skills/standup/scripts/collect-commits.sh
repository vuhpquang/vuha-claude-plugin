#!/usr/bin/env bash
# Prints the commits you authored on one day, grouped by repository.
# Usage: collect-commits.sh [YYYY-MM-DD]   (default: the previous working day)
# Env:   VUHA_STANDUP_ROOTS   colon-separated folders to search for git repos (default ~/Work/Repos)
#        VUHA_STANDUP_AUTHORS extra author patterns, '|'-separated (your git emails are always included)
set -uo pipefail

if [[ -n "${1:-}" ]]; then
  day="$1"
elif [[ "$(date +%u)" == "1" ]]; then
  day=$(date -v-3d +%F 2>/dev/null || date -d '3 days ago' +%F)
else
  day=$(date -v-1d +%F 2>/dev/null || date -d yesterday +%F)
fi
next=$(date -j -v+1d -f %F "$day" +%F 2>/dev/null || date -d "$day +1 day" +%F)

authors="$(git config --global user.email 2>/dev/null)"
[[ -n "${VUHA_STANDUP_AUTHORS:-}" ]] && authors="${authors:+$authors|}$VUHA_STANDUP_AUTHORS"

echo "# Commits on $day"
IFS=: read -ra roots <<< "${VUHA_STANDUP_ROOTS:-$HOME/Work/Repos}"
for root in "${roots[@]}"; do
  [[ -d "$root" ]] || continue
  find "$root" -maxdepth 4 -name .git -prune -print 2>/dev/null | while read -r gitdir; do
    repo=$(dirname "$gitdir")
    pattern="$authors"
    local_email=$(git -C "$repo" config user.email 2>/dev/null)
    [[ -n "$local_email" ]] && pattern="${pattern:+$pattern|}$local_email"
    [[ -n "$pattern" ]] || continue
    log=$(git -C "$repo" log --all --no-merges --extended-regexp --author="$pattern" \
      --since="$day 00:00" --until="$next 00:00" --format='- %h %s (%ad)' --date=format:%H:%M 2>/dev/null)
    if [[ -n "$log" ]]; then
      echo
      echo "## $(basename "$repo")  ($(git -C "$repo" branch --show-current 2>/dev/null))"
      echo "$log"
    fi
  done
done
