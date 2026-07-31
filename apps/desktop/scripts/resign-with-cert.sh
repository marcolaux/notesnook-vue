#!/usr/bin/env bash
# resign-with-cert — re-sign an already-built macOS .app with a named identity
# (e.g. a self-signed cert from create-self-sign-cert.sh), WITHOUT rebuilding.
#
# Used to validate the "stable signing identity → Local Network permission"
# fix quickly: create the cert, re-sign the existing .app, relaunch, and the
# Local Network prompt should fire on first LAN access (where the ad-hoc build
# never prompted).
#
# Usage:
#   ./scripts/resign-with-cert.sh "<identity CN>" "/path/to/Notesnook Vue.app"
set -euo pipefail

IDENTITY="${1:?usage: resign-with-cert.sh <identity CN> <app path>}"
APP="${2:?usage: resign-with-cert.sh <identity CN> <app path>}"
ENTITLEMENTS="${RESIGN_ENTITLEMENTS:-$(cd "$(dirname "$0")/.." && pwd)/entitlements.mac.plist}"

if [ ! -d "$APP" ]; then echo "resign: app not found: $APP" >&2; exit 1; fi
if [ ! -f "$ENTITLEMENTS" ]; then echo "resign: entitlements not found: $ENTITLEMENTS" >&2; exit 1; fi

# Confirm the identity exists in the keychain.
if ! security find-identity -p codesigning -v | grep -q "\"$IDENTITY\""; then
  echo "resign: identity \"$IDENTITY\" not found among codesigning identities." >&2
  echo "  create one with: ./scripts/create-self-sign-cert.sh" >&2
  exit 1
fi

sign() { codesign --force --options runtime --entitlements "$ENTITLEMENTS" --sign "$IDENTITY" "$1"; }

echo "resign: re-signing $APP with identity \"$IDENTITY\" (Hardened Runtime + entitlements)…"
FW="$APP/Contents/Frameworks"
if [ -d "$FW" ]; then
  for entry in "$FW"/*; do
    case "$entry" in
      *.app|*.framework|*.dylib) sign "$entry" ;;
    esac
  done
fi
sign "$APP"

codesign --verify --deep --strict "$APP" && echo "resign: verified."
echo
echo "Done. Clear any stale TCC state and relaunch:"
echo "  tccutil reset LocalNetwork org.notesnookvue.desktop"
echo "  open \"$APP\""
echo "Then set the custom server to your LAN host and click Test connection —"
echo "the Local Network prompt should now fire."