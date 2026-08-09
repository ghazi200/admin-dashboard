#!/usr/bin/env bash
# Build a signed Play Store Android App Bundle (AAB) for Internal testing.
#
# Prerequisites (once):
#   1. keytool … → ~/guard-ui-upload.keystore  (see android/keystore.properties.example)
#   2. Copy android/keystore.properties.example → android/keystore.properties and fill passwords/paths
#   3. frontend-guard-ui/.env.production with production API URLs
#
# Usage (from frontend-guard-ui):
#   ./scripts/build-play-bundle.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production — copy from .env.production.example and set Railway URLs."
  exit 1
fi

PROPS="$ROOT/android/keystore.properties"
if [[ ! -f "$PROPS" ]]; then
  echo "Missing android/keystore.properties"
  echo "Copy android/keystore.properties.example → android/keystore.properties and fill it in."
  exit 1
fi

STORE_FILE="$(grep -E '^storeFile=' "$PROPS" | cut -d= -f2-)"
if [[ -z "$STORE_FILE" || ! -f "$STORE_FILE" ]]; then
  echo "keystore.properties storeFile not found: ${STORE_FILE:-"(empty)"}"
  exit 1
fi

if [[ -z "${JAVA_HOME:-}" ]] && [[ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
fi

echo "==> Building web app + Capacitor Android sync (production)..."
npm run build:android

echo "==> Building signed release AAB..."
cd android
./gradlew bundleRelease

AAB="$ROOT/android/app/build/outputs/bundle/release/app-release.aab"
if [[ -f "$AAB" ]]; then
  echo ""
  echo "Play bundle ready (upload this to Play Console → Internal testing):"
  echo "  $AAB"
  ls -lh "$AAB"
  echo ""
  echo "Also bump versionCode in android/app/build.gradle before each new Play upload."
else
  echo "AAB not found at expected path: $AAB" >&2
  exit 1
fi
