# Quick Start - Messaging Backend Setup

## Automated Setup (Recommended)

Run the automated setup and test script:

```bash
cd backend
node src/scripts/setupAndTestMessaging.js
```

This script will:
1. ✅ Check if multer is installed
2. ✅ Install multer if needed
3. ✅ Verify the installation
4. ✅ Check if server is running
5. ✅ Run comprehensive backend tests
6. ✅ Provide detailed results

## Manual Setup

If you prefer to do it manually:

### 1. Install Multer
```bash
cd backend
npm install multer
```

### 2. Start the Server
```bash
npm start
```

### 3. Run Tests (in another terminal)
```bash
cd backend
node src/scripts/testCompleteMessagingBackend.js
```

## What Gets Tested

The automated script tests:
- ✅ Dependency installation (multer)
- ✅ Server connectivity
- ✅ Route registration
- ✅ File upload service
- ✅ Socket.IO service
- ✅ Authentication
- ✅ Upload endpoints
- ✅ Conversation management
- ✅ Message sending/receiving
- ✅ Read receipts

## Expected Results

After running the setup script:
- ✅ Multer installed and verified
- ✅ Server running and accessible
- ✅ All 11 backend tests passing
- ✅ Backend ready for frontend integration

## Troubleshooting

### "Cannot find module 'multer'"
**Solution**: The script will install it automatically, or run `npm install multer` manually

### "Server is not running"
**Solution**: Start the server in another terminal: `cd backend && npm start`

### "Upload route not found (404)"
**Solution**: Restart the server after installing multer

### Tests fail
**Solution**: Check the test output for specific errors. Most issues are resolved by:
1. Installing multer
2. Restarting the server

## Next Steps

Once all tests pass:
1. ✅ Backend is fully functional
2. ✅ Ready for frontend integration
3. ✅ All APIs are working
4. ✅ File uploads are ready
