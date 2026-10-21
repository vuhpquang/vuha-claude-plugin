#!/bin/zsh
# Scheduled entry (launchd com.vuha.devlog, 09:00 and 17:30): writes the dev log only for days whose
# commits or Claude Code prompts changed since the note was last written, catching up on missed days.
# The 17:30 run writes today; the 09:00 run settles the previous days (work done after 17:30 included).
# Env: VUHA_DEVLOG_DRY=1 (only print what would be written), VUHA_DEVLOG_DIR, VUHA_DEVLOG_CATCHUP_DAYS (default 7), VUHA_DEVLOG_CLAUDE_CONFIG (default ~/.claude-work)
set -u
here=${0:A:h}
state=~/.local/state/vuha-devlog
dir=${VUHA_DEVLOG_DIR:-$HOME/Library/CloudStorage/OneDrive-Personal/obsidian-notes/Dev Logs}
config=${VUHA_DEVLOG_CLAUDE_CONFIG:-$HOME/.claude-work}
mkdir -p $state
echo "== $(date '+%F %T')"

if kill -0 "$(cat $state/lock 2>/dev/null)" 2>/dev/null; then
  echo "skip: another run is in progress"; exit 0
fi
echo $$ > $state/lock
trap 'rm -f $state/lock' EXIT

batt=$(pmset -g batt 2>/dev/null)
if [[ $batt == *discharging* ]] && (( ${${batt##*$'\t'}%%%*} < 20 )); then
  echo "skip: on battery below 20%"; exit 0
fi

since=$(date -v-${VUHA_DEVLOG_CATCHUP_DAYS:-7}d +%F)
last=$(date +%F)
(( $(date +%H) < 17 )) && last=$(date -v-1d +%F)

# Fingerprint per day: "c<commits>:<hash> s<prompts>:<hash>"; a day with nothing new keeps its fingerprint
typeset -A sig commits prompts
while read -r d n h; do sig[$d]="c$n:$h"; commits[$d]=$n; done < <(python3 -I $here/collect-commits.py --sig $since)
while read -r d n h; do sig[$d]="${sig[$d]:-c0} s$n:$h"; prompts[$d]=$n; done < <(python3 -I $here/collect-sessions.py --sig $since)

written=()
for d in ${(ko)sig}; do
  [[ $d > $last ]] && continue
  (( ${commits[$d]:-0} == 0 && ${prompts[$d]:-0} < 3 )) && continue  # a stray question is not a work day
  note="$dir/${d:0:4}/${d:5:2}/$d.md"
  [[ -f $note && "$(cat $state/$d 2>/dev/null)" == "${sig[$d]}" ]] && continue
  echo "writing $d (${sig[$d]})"
  [[ -n ${VUHA_DEVLOG_DRY:-} ]] && continue
  CLAUDE_CONFIG_DIR=$config claude -p "Dùng skill vuha-toolkit:devlog để viết dev log cho ngày $d. Chạy không cần hỏi lại." \
    --dangerously-skip-permissions < /dev/null
  [[ -f $note ]] && print -r -- "${sig[$d]}" > $state/$d && written+=(${d:8:2}/${d:5:2})
done

if (( ${#written} )); then
  msg="Đã viết: ${(j:, :)written}"
  if command -v terminal-notifier >/dev/null; then
    terminal-notifier -title "Dev log" -message "$msg" -open "obsidian://open?path=${dir// /%20}/${last:0:4}/${last:5:2}/$last.md"
  else
    osascript -e "display notification \"$msg\" with title \"Dev log\""
  fi
  echo "$msg"
else
  echo "nothing new"
fi
