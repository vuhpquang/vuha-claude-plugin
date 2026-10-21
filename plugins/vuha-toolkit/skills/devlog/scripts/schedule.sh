#!/bin/zsh
# Installs (or removes) the launchd job com.vuha.devlog: runs run.sh at 09:00 and 17:30 at background priority.
# The scripts are copied to ~/.local/share/vuha-devlog so plugin updates do not break the job; install again after one.
# Usage: schedule.sh install|uninstall
set -eu
label=com.vuha.devlog
plist=~/Library/LaunchAgents/$label.plist
home=~/.local/share/vuha-devlog
log=~/Library/Logs/vuha-devlog.log

launchctl bootout gui/$(id -u)/$label 2>/dev/null || true
rm -f ~/.local/bin/vuha-devlog  # runner from the first version
if [[ "${1:-}" == uninstall ]]; then
  rm -rf "$plist" "$home"
  echo "removed $label"; exit 0
fi
[[ "${1:-}" == install ]] || { echo "usage: $0 install|uninstall"; exit 2; }

mkdir -p $home ~/Library/LaunchAgents
cp ${0:A:h}/run.sh ${0:A:h}/collect-commits.py ${0:A:h}/collect-sessions.py $home/

cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$home/run.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>17</integer><key>Minute</key><integer>30</integer></dict>
  </array>
  <key>ProcessType</key>
  <string>Background</string>
  <key>LowPriorityIO</key>
  <true/>
  <key>Nice</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>$log</string>
  <key>StandardErrorPath</key>
  <string>$log</string>
</dict>
</plist>
PLIST

launchctl bootstrap gui/$(id -u) "$plist"
echo "installed $label: 09:00 + 17:30 → $home/run.sh (log: $log)"
