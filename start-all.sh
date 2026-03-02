#!/bin/bash

# Quick Start Script for All ABE Guard AI Services
# This script helps you start all 4 services

echo "🚀 ABE Guard AI - Quick Start"
echo "=============================="
echo ""
echo "This will start all 4 services in separate terminal windows."
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Function to open a new terminal and run a command
open_terminal() {
    local title=$1
    local command=$2
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        osascript -e "tell application \"Terminal\" to do script \"cd '$command' && echo '${GREEN}✅ $title${NC}' && npm start || npm run dev\""
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux (gnome-terminal, xterm, etc.)
        gnome-terminal --title="$title" -- bash -c "cd '$command' && echo '✅ $title' && npm start || npm run dev; exec bash" 2>/dev/null || \
        xterm -T "$title" -e "cd '$command' && npm start || npm run dev; exec bash" 2>/dev/null || \
        echo "Please start manually: cd '$command' && npm start"
    else
        echo "Please start manually: cd '$command' && npm start"
    fi
}

echo "📦 Starting services..."
echo ""

# Start abe-guard-ai (port 4000)
echo "1️⃣  Starting abe-guard-ai (port 4000)..."
open_terminal "abe-guard-ai" "$SCRIPT_DIR/abe-guard-ai/backend"
sleep 2

# Start admin-dashboard backend (port 5000)
echo "2️⃣  Starting admin-dashboard backend (port 5000)..."
open_terminal "admin-dashboard-backend" "$SCRIPT_DIR/backend"
sleep 2

# Start guard-ui (port 3000)
echo "3️⃣  Starting guard-ui (port 3000)..."
open_terminal "guard-ui" "$SCRIPT_DIR/frontend-guard-ui"
sleep 2

# Start admin-dashboard frontend (port 3001)
echo "4️⃣  Starting admin-dashboard frontend (port 3001)..."
open_terminal "admin-dashboard-frontend" "$SCRIPT_DIR/frontend-admin-dashboard/admin-dashboard-frontend"
sleep 2

echo ""
echo "✅ All services starting!"
echo ""
echo "🌐 URLs:"
echo "   - Guard UI:        http://localhost:3000"
echo "   - Admin Dashboard: http://localhost:3001"
echo ""
echo "⏳ Wait a few seconds for services to start, then:"
echo "   1. Open Guard UI and login as a guard"
echo "   2. Create a callout (if possible)"
echo "   3. Open Admin Dashboard and verify live callouts update"
echo ""
echo "📖 See TESTING_GUIDE.md for detailed testing instructions"
