#!/bin/bash

# Test Script for Live Callouts Fix
# This script helps you start all services in the correct order

echo "🚀 Starting ABE Guard AI Services for Testing"
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if services are already running
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo -e "${YELLOW}⚠️  Port $1 is already in use${NC}"
        return 1
    else
        return 0
    fi
}

echo "📋 Checking ports..."
check_port 4000 && echo -e "${GREEN}✅ Port 4000 available (abe-guard-ai)${NC}" || echo -e "${RED}❌ Port 4000 in use${NC}"
check_port 5000 && echo -e "${GREEN}✅ Port 5000 available (admin-dashboard backend)${NC}" || echo -e "${RED}❌ Port 5000 in use${NC}"
check_port 3000 && echo -e "${GREEN}✅ Port 3000 available (guard-ui)${NC}" || echo -e "${RED}❌ Port 3000 in use${NC}"
check_port 3001 && echo -e "${GREEN}✅ Port 3001 available (admin-dashboard frontend)${NC}" || echo -e "${RED}❌ Port 3001 in use${NC}"

echo ""
echo "📝 To start all services, open 4 separate terminals:"
echo ""
echo "Terminal 1 - abe-guard-ai (Socket.IO - Port 4000):"
echo "   cd ~/abe-guard-ai/backend && npm start"
echo ""
echo "Terminal 2 - admin-dashboard backend (REST API - Port 5000):"
echo "   cd ~/admin-dashboard/backend && npm run dev"
echo ""
echo "Terminal 3 - guard-ui (Guard UI - Port 3000):"
echo "   cd ~/guard-ui/guard-ui && npm start"
echo ""
echo "Terminal 4 - admin-dashboard frontend (Admin UI - Port 3001):"
echo "   cd ~/admin-dashboard/frontend-admin-dashboard/admin-dashboard-frontend && npm start"
echo ""
echo "💡 Tip: Start in this order for best results!"
echo ""
echo "🔍 After starting, check:"
echo "   - Browser console for socket connection: '✅ Admin realtime socket connected'"
echo "   - Network tab for /api/admin/dashboard/live-callouts response"
echo "   - Response should have structure: { data: [...] }"
echo ""
echo "📖 See TESTING_GUIDE.md for detailed testing instructions"
