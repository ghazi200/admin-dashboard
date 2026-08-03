#!/usr/bin/env bash
# Install the beta debug APK on a connected emulator/phone and launch Guard UI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
PKG="com.abe.guardui"
ACTIVITY="${PKG}/.MainActivity"

export ANDROID_HOME="${ANDROID_HOME:-/usr/local/share/android-commandlinetools}"
ADB="$ANDROID_HOME/platform-tools/adb"

if [[ ! -f "$APK" ]]; then
  echo "APK missing. Run: ./scripts/build-beta-apk.sh"
  exit 1
fi

DEVICE="$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
if [[ -z "$DEVICE" ]]; then
  echo "No Android device/emulator connected."
  echo "  Open Android Studio → Device Manager → start Pixel_7 (or plug in a phone with USB debugging)."
  exit 1
fi

echo "Installing on $DEVICE ..."
"$ADB" -s "$DEVICE" install -r "$APK"
echo "Launching Guard UI ..."
"$ADB" -s "$DEVICE" shell am start -n "$ACTIVITY"
echo "Done. App should open on the device."
