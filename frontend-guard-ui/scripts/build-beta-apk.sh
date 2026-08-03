#!/usr/bin/env bash
# Build production Guard UI web assets and a debug APK for internal beta testers.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production — copy from .env.production.example and set Railway URLs."
  exit 1
fi

echo "==> Building web app (production env from .env.production)..."
npm run build:android

if [[ -z "${JAVA_HOME:-}" ]] && [[ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
fi

echo "==> Assembling debug APK..."
cd android
./gradlew assembleDebug

APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
if [[ -f "$APK" ]]; then
  echo ""
  echo "Beta APK ready:"
  echo "  $APK"
  ls -lh "$APK"
else
  echo "APK not found at expected path: $APK" >&2
  exit 1
fi
