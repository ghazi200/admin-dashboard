#!/usr/bin/env bash
# Force-stop a stuck Android emulator (when Device Manager Stop / Cold Boot won't work).
set -euo pipefail

SDK="${ANDROID_HOME:-/usr/local/share/android-commandlinetools}"
export PATH="$SDK/platform-tools:$SDK/emulator:$PATH"

echo "Stopping emulators..."

for s in $(adb devices 2>/dev/null | awk 'NR>1 && $2!="" {print $1}'); do
  echo "  adb -s $s emu kill"
  adb -s "$s" emu kill 2>/dev/null || true
done

adb kill-server 2>/dev/null || true
sleep 1
adb start-server 2>/dev/null || true

pkill -9 -f "qemu-system" 2>/dev/null || true
pkill -9 -f "emulator.*-avd" 2>/dev/null || true
pkill -9 -f "netsimd" 2>/dev/null || true
pkill -9 -f "crashpad_handler.*emulator" 2>/dev/null || true

sleep 1
echo
adb devices -l 2>/dev/null || true
if ps aux | grep -E '[q]emu-system|[e]mulator.*-avd' >/dev/null 2>&1; then
  echo "WARN: Some emulator processes may still be running. Quit Android Studio, then run this script again."
  exit 1
fi

echo "Done. No emulator processes. In Device Manager you can Cold Boot or start a fresh AVD."
