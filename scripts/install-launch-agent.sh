#!/bin/bash
#
# Installs (or reinstalls) the launchd agent that polls the Winds on a schedule.
#
# launchd rather than cron because a laptop sleeps: a StartCalendarInterval that
# was missed while asleep fires once on wake, where cron would simply skip it.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.concordlarp.ravens.poll"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
TARGET="gui/$UID/$LABEL"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

# Local times, unlike the CI cron which was in UTC. These are the same four points
# in the day: 08:07, 12:07, 16:07 and 20:07 Perth time.
cat >"$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO_DIR/scripts/poll-local.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>7</integer></dict>
    <dict><key>Hour</key><integer>12</integer><key>Minute</key><integer>7</integer></dict>
    <dict><key>Hour</key><integer>16</integer><key>Minute</key><integer>7</integer></dict>
    <dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>7</integer></dict>
  </array>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/concord-ravens.launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/concord-ravens.launchd.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
PLIST_EOF

launchctl bootout "$TARGET" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
launchctl enable "$TARGET"

echo "installed $LABEL"
echo
echo "  schedule   08:07, 12:07, 16:07, 20:07 local, plus once at login"
echo "  run now    launchctl kickstart -k $TARGET"
echo "  status     launchctl print $TARGET | head -20"
echo "  logs       tail -f \$HOME/Library/Logs/concord-ravens.log"
echo "  uninstall  launchctl bootout $TARGET && rm $PLIST"
