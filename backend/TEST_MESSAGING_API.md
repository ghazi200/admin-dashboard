# Testing Messaging API

## Prerequisites

1. **Backend server must be running**
   ```bash
   cd backend
   npm start
   ```

2. **Server must be restarted after adding new routes**
   - If you just added the messaging routes, restart the server
   - The routes are registered in `server.js` but won't be active until restart

## Running the API Tests

```bash
cd backend
node src/scripts/testMessagingAPI.js
```

## Manual Testing with curl

### 1. Login as Admin
```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password123"}'
```

Save the token from the response.

### 2. List Conversations
```bash
curl -X GET http://localhost:5000/api/admin/messages/conversations \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 3. Create Group Conversation
```bash
curl -X POST http://localhost:5000/api/admin/messages/conversations/group \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Group",
    "participantIds": [],
    "location": "Test Location"
  }'
```

### 4. Send Message
```bash
curl -X POST http://localhost:5000/api/admin/messages/conversations/CONVERSATION_ID/messages \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello, this is a test message!",
    "messageType": "text"
  }'
```

### 5. Get Messages
```bash
curl -X GET "http://localhost:5000/api/admin/messages/conversations/CONVERSATION_ID/messages?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Expected Results

- ✅ Server responds to `/health`
- ✅ Admin login returns JWT token
- ✅ All messaging endpoints return 200/201 (not 404)
- ✅ Conversations can be created
- ✅ Messages can be sent and retrieved

## Troubleshooting

### Routes return 404
- **Solution**: Restart the backend server
  ```bash
  # Stop the server (Ctrl+C)
  # Then restart:
  cd backend
  npm start
  ```

### Authentication fails
- **Solution**: Make sure you have a valid admin account
- Check the admin credentials in your `.env` or database

### Database errors
- **Solution**: Make sure the messaging tables exist
  ```bash
  node src/scripts/testMessagingBackend.js
  ```

## Test Script Output

The test script will show:
- ✅ Green checkmarks for successful tests
- ❌ Red X for failed tests
- ℹ️  Blue info for details
- ⚠️  Yellow warnings for issues
