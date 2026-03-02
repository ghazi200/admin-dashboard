#!/usr/bin/env bash
# Build Guard UI for phone so it can reach your Mac's APIs.
# Run from frontend-guard-ui. Phone must be on the same Wi-Fi as your Mac.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

# Prefer en0 (Wi-Fi on many Macs), fallback to en1
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
if [ -z "$IP" ]; then
  echo "Could not detect Mac IP. Set it manually:"
  echo "  REACT_APP_GUARD_API_URL=http://YOUR_MAC_IP:4000 REACT_APP_ADMIN_API_URL=http://YOUR_MAC_IP:5000 npm run build:mobile"
  echo "Find your IP: System Settings → Network → Wi-Fi → Details"
  exit 1
fi

echo "Mac IP: $IP (phone must be on same Wi-Fi)"
echo ""
echo "Building with:"
echo "  REACT_APP_GUARD_API_URL=http://$IP:4000"
echo "  REACT_APP_ADMIN_API_URL=http://$IP:5000"
echo ""

export REACT_APP_GUARD_API_URL="http://$IP:4000"
export REACT_APP_ADMIN_API_URL="http://$IP:5000"
npm run build:mobile

echo ""
echo "Done. Run the app from Android Studio (green Run button)."
