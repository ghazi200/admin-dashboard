#!/bin/bash

echo "🧪 Testing Live Callouts Endpoint"
echo "================================="
echo ""

# Get token from user or use default
TOKEN=${1:-""}

if [ -z "$TOKEN" ]; then
    echo "Usage: ./test-endpoint.sh YOUR_ADMIN_TOKEN"
    echo ""
    echo "To get your token:"
    echo "1. Open browser console (F12)"
    echo "2. Run: localStorage.getItem('adminToken')"
    echo "3. Copy the token and run this script"
    exit 1
fi

echo "Testing endpoint..."
echo ""

curl -X GET http://localhost:5000/api/admin/dashboard/live-callouts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -s | jq '.' || echo "Response received (install jq for pretty print)"

echo ""
echo "✅ Done!"
