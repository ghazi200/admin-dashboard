#!/bin/bash

# Quick service status checker
echo "🔍 Checking Service Status"
echo "=========================="
echo ""

check_service() {
    local port=$1
    local name=$2
    
    if lsof -i :$port 2>/dev/null | grep -q LISTEN; then
        echo "✅ $name (port $port) - RUNNING"
        return 0
    else
        echo "❌ $name (port $port) - NOT RUNNING"
        return 1
    fi
}

check_service 4000 "abe-guard-ai"
check_service 5000 "admin-dashboard backend"
check_service 3000 "guard-ui"
check_service 3001 "admin-dashboard frontend"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo ""
echo "📝 To start missing services, run in separate terminals:"
echo ""
echo "Terminal 1: cd $SCRIPT_DIR/abe-guard-ai/backend && npm start"
echo "Terminal 2: cd $SCRIPT_DIR/backend && npm start"
echo "Terminal 3: cd $SCRIPT_DIR/frontend-guard-ui && npm start"
echo "Terminal 4: cd $SCRIPT_DIR/frontend-admin-dashboard/admin-dashboard-frontend && npm start"
