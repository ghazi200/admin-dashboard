# Installation and Testing Guide

## 1. Install Dependencies

Install multer for file uploads:
```bash
cd backend
npm install multer
```

## 2. Restart the Server

After installing multer and adding new routes, restart the server:
```bash
# Stop current server (Ctrl+C)
npm start
```

## 3. Run Tests

### Quick Test (Route Availability)
```bash
node src/scripts/quickAPITest.js
```

### Complete Backend Test
```bash
node src/scripts/testCompleteMessagingBackend.js
```

### API Test (Full HTTP Testing)
```bash
node src/scripts/testMessagingAPI.js
```

## Expected Results

After installation and restart, all tests should pass:
- ✅ Server connection
- ✅ Routes registration
- ✅ File upload service
- ✅ Socket.IO service
- ✅ Admin authentication
- ✅ Upload route
- ✅ All messaging endpoints

## Troubleshooting

### Multer Not Found
**Error**: `Cannot find module 'multer'`
**Solution**: Run `npm install multer` in the backend directory

### Upload Route Returns 404
**Error**: `Upload route not found (404)`
**Solution**: Restart the server after adding upload routes

### UUID Error
**Error**: `invalid input syntax for type uuid: "1"`
**Solution**: This is fixed in the code - admin IDs are now converted to UUIDs automatically

## Test Results

After successful installation:
- All 11 tests should pass
- File upload service should load
- All routes should be accessible
- Messages can be created and retrieved
