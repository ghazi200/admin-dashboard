#!/usr/bin/env bash
# Run from frontend-guard-ui. Requires Xcode and CocoaPods to be installed.
# See BUILD_MOBILE.md → "Installing Xcode and CocoaPods".

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

if ! command -v pod &>/dev/null; then
  echo "CocoaPods not found. Install it first (see BUILD_MOBILE.md)."
  exit 1
fi

echo "Running pod install in ios/App..."
cd ios/App
pod install
cd "$ROOT"
echo "Opening iOS project in Xcode..."
npx cap open ios
