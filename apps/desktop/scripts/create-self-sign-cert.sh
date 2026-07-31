#!/usr/bin/env bash
# create-self-sign-cert — make a self-signed code-signing certificate in the
# login keychain, so electron-builder/codesign can sign the app with a STABLE
# identity (not ad-hoc).
#
# Why: on recent macOS an ad-hoc (cdhash-only) signature does NOT get offered
# the "Local Network" privacy permission — the prompt never fires and the app
# never appears in System Settings → Privacy & Security → Local Network, so a
# self-hosted build can't reach LAN hosts. A self-signed cert (no paid Apple
# account needed) gives the app a certificate-based designated requirement TCC
# can track, so the prompt fires and the grant persists across rebuilds.
# Gatekeeper still warns (unnotarized, not a Developer ID) — same as before.
#
# One-time setup. After this, build with CSC_NAME set (see echo at the bottom):
#   CSC_NAME=notesnook-vue-selfsign npm run package:mac   # from apps/desktop
# (The afterPack hook self-skips when CSC_NAME is set, so electron-builder
#  signs with the cert directly — applying entitlements + Hardened Runtime.)
set -euo pipefail

NAME="notesnook-vue-selfsign"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "create-self-sign-cert: generating self-signed code-signing cert \"$NAME\"…"

# 1. Self-signed X.509 with a codeSigning extended key usage.
openssl req -x509 -newkey rsa:2048 -sha256 \
  -keyout "$WORK/key.pem" -out "$WORK/cert.pem" \
  -days 3650 -nodes \
  -subj "/CN=$NAME" \
  -addext "extendedKeyUsage=codeSigning" 2>/dev/null

# 2. Bundle cert + key into a .p12 (empty passphrase) for keychain import.
openssl pkcs12 -export -inkey "$WORK/key.pem" -in "$WORK/cert.pem" \
  -out "$WORK/cert.p12" -passout pass:

# 3. Import into the login keychain; -T /usr/bin/codesign pre-authorizes codesign
#    to use the private key without a per-use keychain prompt. (macOS may still
#    show a one-time "allow codesign to access key" dialog on first use.)
KEYCHAIN="${HOME}/Library/Keychains/login.keychain-db"
if [ ! -f "$KEYCHAIN" ]; then KEYCHAIN="login.keychain"; fi

# Remove a prior import with the same CN to make this idempotent.
security delete-certificate -c "$NAME" "$KEYCHAIN" 2>/dev/null || true

security import "$WORK/cert.p12" -k "$KEYCHAIN" -T /usr/bin/codesign -P ""

# 4. Mark the cert as trusted for code signing (so it shows as a valid identity
#    and `security find-identity -p codesigning` lists it). This writes to the
#    admin trust settings and may prompt for your login password once.
sudo security add-trusted-cert -d -r trustRoot \
  -k "$KEYCHAIN" "$WORK/cert.pem" 2>/dev/null || {
  echo "create-self-sign-cert: could not auto-trust the cert (needs your password)." >&2
  echo "  If the build can't find the identity, in Keychain Access right-click the" >&2
  echo "  \"$NAME\" cert → Get Info → Trust → 'When using this certificate: Use System Trust'." >&2
}

echo
echo "create-self-sign-cert: identities available for codesigning:"
security find-identity -p codesigning -v | grep -i "$NAME" || security find-identity -v
echo
echo "✓ Done. Build with:"
echo "    CSC_NAME=$NAME npm run package:mac   # from apps/desktop"
echo "  or to re-sign an already-built .app in place (no rebuild):"
echo "    ./apps/desktop/scripts/resign-with-cert.sh \"$NAME\" \"apps/desktop/release/mac-arm64/Notesnook Vue.app\""