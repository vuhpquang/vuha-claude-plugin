#!/bin/sh
# Wait until a slskd download finishes, then print where it landed.
# Usage: wait-download.sh <username> <remote filename as returned by search_music> [timeout seconds, default 600]
# Prints: STATE=<slskd state>, then on success FILE=<local path>, DIR=<folder>, URL=<file:// link to the folder>.
set -eu

USER_NAME=$1
REMOTE=$2
TIMEOUT=${3:-600}
SECRETS=${SLSKD_SECRETS:-$HOME/.config/slskd/secrets.env}
HOST=${SLSKD_HOST:-http://127.0.0.1:5030}
DOWNLOADS=${SLSKD_DOWNLOADS:-$HOME/Music/Soulseek/complete}

# shellcheck disable=SC1090
. "$SECRETS"

state() {
  curl -s -H "X-API-Key: $SLSKD_API_KEY" "$HOST/api/v0/transfers/downloads/$USER_NAME" |
    REMOTE="$REMOTE" python3 -c '
import json, os, sys
want = os.environ["REMOTE"]
try:
    data = json.load(sys.stdin)
except ValueError:
    sys.exit()
for d in data.get("directories", []):
    for f in d.get("files", []):
        if f.get("filename") == want:
            print(f.get("state", ""))
            sys.exit()
'
}

start=$(date +%s)
while :; do
  s=$(state)
  case "$s" in
    Completed*) break ;;
  esac
  if [ $(($(date +%s) - start)) -ge "$TIMEOUT" ]; then
    echo "STATE=${s:-not found} (gave up after ${TIMEOUT}s)"
    exit 1
  fi
  sleep 3
done

echo "STATE=$s"
case "$s" in
  *Succeeded) ;;
  *) exit 1 ;;
esac

# slskd saves into <downloads>/<remote parent folder>/<file>; search by name to be safe.
base=${REMOTE##*\\}
file=$(find "$DOWNLOADS" -type f -name "$base" -print 2>/dev/null | head -1)
[ -n "$file" ] || { echo "FILE=not found under $DOWNLOADS"; exit 1; }
dir=$(dirname "$file")
echo "FILE=$file"
echo "DIR=$dir"
echo "URL=$(python3 -c 'import pathlib, sys; print(pathlib.Path(sys.argv[1]).as_uri())' "$dir")"
