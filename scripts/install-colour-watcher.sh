#!/bin/bash
# Reads the pixels of any clip still on the describer's estimate, every 15
# minutes, for free. Install once:
#
#   bash scripts/install-colour-watcher.sh
#
# Remove it:
#
#   launchctl bootout gui/$(id -u)/app.04am.colour-watcher
#   rm ~/Library/LaunchAgents/app.04am.colour-watcher.plist
#
# WHY LAUNCHD AND NOT CRON: cron on macOS doesn't survive sleep well and has
# no per-user env. launchd re-runs a missed interval after the Mac wakes,
# which is what you want for a laptop that closes.
#
# WHY NOT PYTHON: this runs the SAME extractor the app uses, which imports
# lib/color/buckets.ts — the identical bucketOf that search matches on. A
# second implementation in another language would have its own copy of the
# buckets, the 15% floor and the neutral rule, and the first time one was
# tuned they would disagree without anything failing.
#
# It only runs while this Mac is awake. That is fine: a new clip is
# searchable by colour immediately on the describer's estimate, and this
# replaces it with the real thing whenever the machine is next up.
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="app.04am.colour-watcher"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE="$(command -v node)"

mkdir -p "$HOME/Library/LaunchAgents" "$REPO/.logs"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>--conditions=react-server</string>
    <string>--experimental-strip-types</string>
    <string>--env-file=.env.local</string>
    <string>scripts/read-colors.ts</string>
    <string>--apply</string>
    <string>--stale</string>
  </array>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$REPO/.logs/colour-watcher.log</string>
  <key>StandardErrorPath</key><string>$REPO/.logs/colour-watcher.log</string>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "Installed. Runs every 15 minutes and on login."
echo "Log: $REPO/.logs/colour-watcher.log"
echo "Watch it:  tail -f $REPO/.logs/colour-watcher.log"
