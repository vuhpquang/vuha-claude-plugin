#!/usr/bin/env bash
# Prints the commits you authored on one day, grouped by repository, each commit once
# (worktrees and clones of the same repo repeat the same hashes; only the first listing keeps them).
# Usage: collect-commits.sh [YYYY-MM-DD]   (default: today)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
"$here/../../standup/scripts/collect-commits.sh" "${1:-$(date +%F)}" | awk '
  /^## / { header = $0; next }
  /^- / {
    if (seen[$2]++) next
    if (header != "") { print ""; print header; header = "" }
    print; next
  }
  NF { print }
'
