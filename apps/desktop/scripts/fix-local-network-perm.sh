#!/usr/bin/env bash
# fix-local-network-perm — repair Local Network access for an ALREADY-BUILT
# Notesnook Vue app without rebuilding.
#
# After a macOS update, a previously-working built/installed app can lose local
# network access and the System Settings → Privacy & Security → Local Network
# toggle becomes un-settable (or never appears). Cause: the app is unsigned and
# its Info.plist lacks `NSLocalNetworkUsageDescription`, so macOS refuses to
# prompt or list it. This script does in-place what the build pipeline now does
# at pack time (scripts/after-pack.mjs): inject the usage description + ad-hoc
# re-sign the bundle with the Hardened Runtime + entitlements. After relaunch
# the Local Network prompt fires and the toggle is settable.
#
# Usage:
#   ./scripts/fix-local-network-perm.sh                    # default app path
#   ./scripts/fix-local-network-perm.sh "/path/to/Notesnook Vue.app"
#
# Default path is the install location for this build's productName ("Notesnook
# Vue"). Run from the apps/desktop directory (so the entitlements path resolves),
# or pass an absolute entitlements path via FIX_LN_ENTITLEMENTS.
set -euo pipefail

APP="${1:-/Applications/Notesnook Vue.app}"
ENTITLEMENTS="${FIX_LN_ENTITLEMENTS:-$(cd "$(dirname "$0")/.." && pwd)/entitlements.mac.plist}"
USAGE="Notesnook Vue connects to your self-hosted Notesnook server and to other devices on your local network to sync your notes."

if [ ! -d "$APP" ]; then
  echo "fix-local-network: app not found at: $APP" >&2
  echo "  pass the path to your built .app as the first argument." >&2
  exit 1
fi
if [ ! -f "$ENTITLEMENTS" ]; then
  echo "fix-local-network: entitlements not found at: $ENTITLEMENTS" >&2
  echo "  run from apps/desktop, or set FIX_LN_ENTITLEMENTS=/abs/path/entitlements.mac.plist" >&2
  exit 1
fi
if [ "$(uname)" != "Darwin" ]; then
  echo "fix-local-network: this is a macOS-only fix." >&2
  exit 1
fi

PLIST="$APP/Contents/Info.plist"
echo "fix-local-network: patching $PLIST"
# Idempotent: remove then re-add (Add fails if the key already exists).
/usr/libexec/PlistBuddy -c "Delete :NSLocalNetworkUsageDescription" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :NSLocalNetworkUsageDescription string '$USAGE'" "$PLIST"
echo "fix-local-network: ad-hoc re-signing $APP (Hardened Runtime + entitlements)"

sign() { codesign --force --options runtime --entitlements "$ENTITLEMENTS" --sign - "$1"; }
FW="$APP/Contents/Frameworks"
if [ -d "$FW" ]; then
  for entry in "$FW"/*; do
    case "$entry" in
      *.app|*.framework|*.dylib) sign "$entry" ;;
    esac
  done
fi
sign "$APP"

codesign --verify --deep --strict "$APP" && echo "fix-local-network: signature verified."

# Clear any stale denied Local Network TCC entry for this bundle id so the
# prompt re-fires on next launch (safe, scoped to this app's id).
tccutil reset LocalNetwork org.notesnookvue.desktop 2>/dev/null || true

cat <<EOF

fix-local-network: done.
  1. Quit the app fully (⌘Q) if it's running, then relaunch it.
  2. On first local-network access macOS will prompt "allow to find and connect
     to devices on your local network" — click Allow.
  3. Verify the toggle at System Settings → Privacy & Security → Local Network
     (the app should now be listed and settable).

  Future builds from this repo already bake this in (afterPack ad-hoc sign +
     NSLocalNetworkUsageDescription), so you won't need this script again.
EOF