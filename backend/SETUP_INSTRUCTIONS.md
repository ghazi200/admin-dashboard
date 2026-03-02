# Setup Instructions for Messaging Backend

## Quick Setup

### 1. Install Multer

```bash
cd backend
npm install multer
```

**Note**: If you get permission errors, you may need to:
- Run with sudo: `sudo npm install multer`
- Or fix npm permissions: `sudo chown -R $(whoami) ~/.npm`

### 2. Restart the Server

After installing multer, restart the backend server:

```bash
# Stop current server (Ctrl+C if running)
cd backend
npm start
```

### 3. Run Tests

```bash
# Automated setup and test
node src/scripts/setupAndTestMessaging.js

# Or just run tests
node src/scripts/testCompleteMessagingBackend.js
```

## What the Script Does

The automated script (`setupAndTestMessaging.js`) will:
1. ✅ Check if multer is installed
2. ⚠️  Attempt to install multer (may require manual installation)
3. ✅ Verify multer installation
4. ✅ Check if server is running
5. ✅ Run comprehensive backend tests
6. ✅ Provide detailed results

## Manual Installation Steps

If the automated script can't install multer due to permissions:

### Step 1: Install Multer
```bash
cd /Users/ghaziabdullah/admin-dashboard/backend
npm install multer
```

### Step 2: Verify Installation
```bash
node -e "require('multer'); console.log('✅ Multer installed')"
```

### Step 3: Start Server
```bash
npm start
```

### Step 4: Run Tests
```bash
# In another terminal
cd /Users/ghaziabdullah/admin-dashboard/backend
node src/scripts/testCompleteMessagingBackend.js
```

## Expected Test Results

After successful setup:
- ✅ Multer installed and verified
- ✅ Server running and accessible
- ✅ All 11 backend tests passing
- ✅ Backend ready for frontend integration

## Troubleshooting

### Permission Errors
If you get `EPERM` errors:
```bash
# Option 1: Use sudo (not recommended for local dev)
sudo npm install multer

# Option 2: Fix npm permissions
sudo chown -R $(whoami) ~/.npm
npm install multer

# Option 3: Use nvm (recommended)
# Install nvm, then use it to manage Node.js
```

### Server Not Running
```bash
# Check if server is running
curl http://localhost:5000/health

# If not, start it
cd backend
npm start
```

### Upload Route 404
- Make sure server was restarted after adding upload routes
- Check that `messageUpload.routes.js` is registered in `server.js`

## Test Coverage

The tests verify:
- ✅ Server connectivity
- ✅ Route registration
- ✅ File upload service
- ✅ Socket.IO service
- ✅ Authentication
- ✅ Upload endpoints
- ✅ Conversation management
- ✅ Message sending/receiving
- ✅ Read receipts

## Next Steps After Setup

Once all tests pass:
1. ✅ Backend is fully functional
2. ✅ Ready for frontend integration
3. ✅ All APIs are working
4. ✅ File uploads are ready
