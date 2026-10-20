#!/bin/zsh
# Installs (or removes) the launchd job com.vuha.devlog that writes the dev log every day at 17:30.
# Usage: schedule.sh install|uninstall
# Env:   VUHA_DEVLOG_TIME  HH:MM (default 17:30)   VUHA_DEVLOG_CLAUDE_CONFIG  config dir to run with (default ~/.claude-work)
set -eu
label=com.vuha.devlog
plist=~/Library/LaunchAgents/$label.plist
runner=~/.local/bin/vuha-devlog
log=~/Library/Logs/vuha-devlog.log

if [[ "${1:-}" == uninstall ]]; then
  launchctl bootout gui/$(id -u)/$label 2>/dev/null || true
  rm -f "$plist" "$runner"
  echo "removed $label"; exit 0
fi
[[ "${1:-}" == install ]] || { echo "usage: $0 install|uninstall"; exit 2; }

time=${VUHA_DEVLOG_TIME:-17:30}
config=${VUHA_DEVLOG_CLAUDE_CONFIG:-$HOME/.claude-work}
mkdir -p ~/.local/bin ~/Library/LaunchAgents

cat > "$runner" <<RUN
#!/bin/zsh
# Daily dev log (launchd: $label). Runs Claude Code headless with the vuha-toolkit devlog skill.
echo "== \$(date '+%F %T')"
cd ~ || exit 1
CLAUDE_CONFIG_DIR=$config $(command -v claude || echo ~/.local/bin/claude) -p \\
  "Dùng skill vuha-toolkit:devlog để viết dev log cho hôm nay (\$(date +%F)). Chạy không cần hỏi lại." \\
  --dangerously-skip-permissions
echo "exit \$?"
RUN
chmod +x "$runner"

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
    <string>$runner</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>$((10#${time%%:*}))</integer>
    <key>Minute</key>
    <integer>$((10#${time##*:}))</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$log</string>
  <key>StandardErrorPath</key>
  <string>$log</string>
</dict>
</plist>
PLIST

launchctl bootout gui/$(id -u)/$label 2>/dev/null || true
launchctl bootstrap gui/$(id -u) "$plist"
echo "installed $label: every day at $time → $runner (log: $log)"
