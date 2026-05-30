#!/usr/bin/env bash
# Diagnose why Guard UI won't install/run from Android Studio.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID="$ROOT/android"
SDK="${ANDROID_HOME:-/usr/local/share/android-commandlinetools}"
ADB="$SDK/platform-tools/adb"
JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"

export PATH="$SDK/platform-tools:$SDK/emulator:$SDK/cmdline-tools/latest/bin:$PATH"
export JAVA_HOME
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$HOME/.gradle}"

echo "== Guard UI Android run check =="
echo "Project: $ANDROID"
echo "JAVA_HOME: $JAVA_HOME"
echo "SDK: $SDK"
echo

if [[ ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "ERROR: No JDK at JAVA_HOME. In Android Studio:"
  echo "  Settings → Build Tools → Gradle → Gradle JDK → Embedded JDK"
  exit 1
fi

if [[ ! -f "$ANDROID/local.properties" ]]; then
  echo "WARN: missing android/local.properties — copy local.properties.example and set sdk.dir"
else
  echo "local.properties sdk.dir=$(grep sdk.dir "$ANDROID/local.properties" || true)"
fi

echo
echo "== Devices =="
if [[ ! -x "$ADB" ]]; then
  echo "ERROR: adb not found under $SDK/platform-tools"
  exit 1
fi
"$ADB" devices -l || true

echo
echo "== Package manager (emulator must pass this before Run works) =="
DEVICE="$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
if [[ -z "$DEVICE" ]]; then
  echo "ERROR: No device/emulator in 'device' state."
  echo "  Start one in Android Studio: Device Manager → Play, or:"
  echo "  emulator -avd Pixel_7"
  exit 1
fi

PM_OUT="$("$ADB" -s "$DEVICE" shell pm path android 2>&1)" || true
if echo "$PM_OUT" | grep -q "package:"; then
  echo "OK ($DEVICE): package manager is up"
else
  echo "ERROR ($DEVICE): package manager broken — Android Studio cannot install the app."
  echo "  Output: $PM_OUT"
  echo
  echo "Fix:"
  echo "  1. Device Manager → ⋮ on your AVD → Cold Boot Now"
  echo "  2. If still broken: Wipe Data, or delete AVD and create a new Pixel API 34 image"
  echo "  3. Or use a physical phone with USB debugging"
  exit 1
fi

echo
echo "== Web bundle =="
if [[ ! -d "$ROOT/build" ]]; then
  echo "WARN: no build/ folder — run: cd frontend-guard-ui && npm run build:mobile"
else
  echo "OK: build/ exists"
fi

echo
echo "== Gradle assembleDebug =="
(cd "$ANDROID" && ./gradlew assembleDebug -q)
APK="$ANDROID/app/build/outputs/apk/debug/app-debug.apk"
echo "OK: $APK"

echo
echo "All checks passed. In Android Studio: open frontend-guard-ui/android, Sync, select $DEVICE, Run."
