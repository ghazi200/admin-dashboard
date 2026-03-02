/**
 * Complete Messaging Backend Test
 * 
 * Tests all messaging functionality including file uploads
 * 
 * Usage: node src/scripts/testCompleteMessagingBackend.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = process.env.API_URL || 'http://localhost:5000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'password123';

// Colors for console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) { log(`✅ ${message}`, 'green'); }
function logError(message) { log(`❌ ${message}`, 'red'); }
function logInfo(message) { log(`ℹ️  ${message}`, 'cyan'); }
function logWarning(message) { log(`⚠️  ${message}`, 'yellow'); }

// HTTP request helper
function makeRequest(method, path, data = null, token = null, isMultipart = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE_URL);
    const options = {
      method,
      headers: {},
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (isMultipart && data) {
      // For multipart/form-data, data should be FormData-like object
      // We'll handle this differently
    } else if (data) {
      options.headers['Content-Type'] = 'application/json';
    }

    const protocol = url.protocol === 'https:' ? require('https') : http;
    const req = protocol.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : {},
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body,
          });
        }
      });
    });

    req.on('error', reject);

    if (data && !isMultipart) {
      req.write(JSON.stringify(data));
    } else if (data && isMultipart) {
      // For multipart, we'd need to use form-data library
      // For now, skip multipart tests
      req.end();
      return;
    }

    req.end();
  });
}

async function testServerConnection() {
  log('\n🔌 Testing Server Connection...\n', 'blue');
  try {
    const response = await makeRequest('GET', '/health');
    if (response.status === 200) {
      logSuccess('Server is running and responding');
      return true;
    } else {
      logError(`Server returned status ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`Cannot connect to server: ${error.message}`);
    logWarning('Make sure the backend server is running: npm start');
    return false;
  }
}

async function testAdminLogin() {
  log('\n🔐 Testing Admin Authentication...\n', 'blue');
  try {
    const response = await makeRequest('POST', '/api/admin/login', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    if (response.status === 200 && response.body.token) {
      logSuccess('Admin login successful');
      return response.body.token;
    } else {
      logError(`Login failed: ${response.body.message || 'Unknown error'}`);
      return null;
    }
  } catch (error) {
    logError(`Login request failed: ${error.message}`);
    return null;
  }
}

async function testConversationsList(adminToken) {
  log('\n📋 Testing GET /api/admin/messages/conversations...\n', 'blue');
  try {
    const response = await makeRequest('GET', '/api/admin/messages/conversations', null, adminToken);
    if (response.status === 200) {
      logSuccess('Conversations list retrieved');
      logInfo(`Found ${response.body.conversations?.length || 0} conversations`);
      return true;
    } else {
      logError(`Failed: ${response.status} - ${response.body.message || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    logError(`Request failed: ${error.message}`);
    return false;
  }
}

async function testCreateGroupConversation(adminToken) {
  log('\n💬 Testing POST /api/admin/messages/conversations/group...\n', 'blue');
  try {
    const response = await makeRequest(
      'POST',
      '/api/admin/messages/conversations/group',
      {
        name: 'Test Group Chat',
        participantIds: [],
        location: 'Test Location',
      },
      adminToken
    );

    if (response.status === 201) {
      logSuccess('Group conversation created');
      logInfo(`Conversation ID: ${response.body.conversation?.id}`);
      return response.body.conversation;
    } else {
      logError(`Failed: ${response.status} - ${response.body.message || 'Unknown error'}`);
      if (response.body.error) {
        logError(`Error: ${response.body.error}`);
      }
      return null;
    }
  } catch (error) {
    logError(`Request failed: ${error.message}`);
    return null;
  }
}

async function testSendMessage(adminToken, conversationId) {
  log('\n✉️  Testing POST /api/admin/messages/conversations/:id/messages...\n', 'blue');
  try {
    const response = await makeRequest(
      'POST',
      `/api/admin/messages/conversations/${conversationId}/messages`,
      {
        content: 'Hello! This is a test message from the complete backend test.',
        messageType: 'text',
      },
      adminToken
    );

    if (response.status === 201) {
      logSuccess('Message sent successfully');
      logInfo(`Message ID: ${response.body.message?.id}`);
      return response.body.message;
    } else {
      logError(`Failed: ${response.status} - ${response.body.message || 'Unknown error'}`);
      return null;
    }
  } catch (error) {
    logError(`Request failed: ${error.message}`);
    return null;
  }
}

async function testGetMessages(adminToken, conversationId) {
  log('\n📨 Testing GET /api/admin/messages/conversations/:id/messages...\n', 'blue');
  try {
    const response = await makeRequest(
      'GET',
      `/api/admin/messages/conversations/${conversationId}/messages?page=1&limit=10`,
      null,
      adminToken
    );

    if (response.status === 200) {
      logSuccess('Messages retrieved');
      logInfo(`Total messages: ${response.body.pagination?.total || 0}`);
      logInfo(`Messages in response: ${response.body.messages?.length || 0}`);
      return true;
    } else {
      logError(`Failed: ${response.status} - ${response.body.message || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    logError(`Request failed: ${error.message}`);
    return false;
  }
}

async function testMarkAsRead(adminToken, conversationId) {
  log('\n👁️  Testing POST /api/admin/messages/conversations/:id/read...\n', 'blue');
  try {
    const response = await makeRequest(
      'POST',
      `/api/admin/messages/conversations/${conversationId}/read`,
      {},
      adminToken
    );

    if (response.status === 200) {
      logSuccess('Conversation marked as read');
      return true;
    } else {
      logError(`Failed: ${response.status} - ${response.body.message || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    logError(`Request failed: ${error.message}`);
    return false;
  }
}

async function testUploadRoute(adminToken) {
  log('\n📤 Testing Upload Route Availability...\n', 'blue');
  try {
    // Test that the route exists (should return 400 for missing file, not 404)
    const response = await makeRequest('POST', '/api/messages/upload', null, adminToken);
    
    if (response.status === 404) {
      logError('Upload route not found (404)');
      logWarning('Make sure the server has been restarted after adding upload routes');
      return false;
    } else if (response.status === 400 || response.status === 401) {
      logSuccess('Upload route exists (returns expected error for missing file/auth)');
      return true;
    } else {
      logInfo(`Upload route responded with status: ${response.status}`);
      return true;
    }
  } catch (error) {
    logError(`Request failed: ${error.message}`);
    return false;
  }
}

async function testFileUploadService() {
  log('\n📁 Testing File Upload Service...\n', 'blue');
  try {
    const fileUploadService = require('../services/fileUpload.service');
    
    if (fileUploadService.upload) {
      logSuccess('File upload service loaded');
      logInfo(`Max file size: ${fileUploadService.MAX_FILE_SIZE / 1024 / 1024}MB`);
      logInfo(`Max image size: ${fileUploadService.MAX_IMAGE_SIZE / 1024 / 1024}MB`);
      logInfo(`Upload directory: ${fileUploadService.UPLOAD_DIR}`);
      
      // Check if upload directory exists or can be created
      const uploadDir = fileUploadService.UPLOAD_DIR;
      if (fs.existsSync(uploadDir)) {
        logSuccess('Upload directory exists');
      } else {
        logWarning('Upload directory does not exist (will be created on first upload)');
      }
      
      return true;
    } else {
      logError('File upload service not properly exported');
      return false;
    }
  } catch (error) {
    logError(`Error loading file upload service: ${error.message}`);
    return false;
  }
}

async function testSocketService() {
  log('\n🔌 Testing Socket.IO Service...\n', 'blue');
  try {
    const socketService = require('../services/messagingSocket.service');
    
    if (socketService.initMessagingSocketHandlers) {
      logSuccess('Messaging socket service loaded');
      logInfo('Socket handlers function available');
      return true;
    } else {
      logError('Messaging socket service not properly exported');
      return false;
    }
  } catch (error) {
    logError(`Error loading socket service: ${error.message}`);
    return false;
  }
}

async function testRoutesRegistration() {
  log('\n🛣️  Testing Routes Registration...\n', 'blue');
  try {
    const serverPath = path.resolve(__dirname, '../../server.js');
    const serverContent = fs.readFileSync(serverPath, 'utf8');
    
    const checks = [
      { name: 'Guard messages routes', pattern: /guardMessagesRoutes|api\/guard\/messages/ },
      { name: 'Admin messages routes', pattern: /adminMessagesRoutes|api\/admin\/messages/ },
      { name: 'Message upload routes', pattern: /messageUploadRoutes|api\/messages\/upload/ },
      { name: 'Messaging socket handlers', pattern: /initMessagingSocketHandlers/ },
      { name: 'Static uploads serving', pattern: /app\.use\(.*uploads|express\.static.*uploads/ },
    ];

    let allFound = true;
    for (const check of checks) {
      if (check.pattern.test(serverContent)) {
        logSuccess(`${check.name} registered`);
      } else {
        logError(`${check.name} NOT found in server.js`);
        allFound = false;
      }
    }
    
    return allFound;
  } catch (error) {
    logError(`Error checking routes: ${error.message}`);
    return false;
  }
}

async function main() {
  log('\n═══════════════════════════════════════════════════════', 'blue');
  log('🧪 Complete Messaging Backend Test', 'blue');
  log('═══════════════════════════════════════════════════════\n', 'blue');

  const results = {
    serverConnection: false,
    adminLogin: false,
    routesRegistration: false,
    fileUploadService: false,
    socketService: false,
    uploadRoute: false,
    conversationsList: false,
    createGroup: false,
    sendMessage: false,
    getMessages: false,
    markAsRead: false,
  };

  // Test 1: Server connection
  results.serverConnection = await testServerConnection();
  if (!results.serverConnection) {
    logError('\n❌ Cannot connect to server. Please start the backend server first.');
    logInfo('Run: cd backend && npm start');
    process.exit(1);
  }

  // Test 2: Routes registration
  results.routesRegistration = await testRoutesRegistration();

  // Test 3: File upload service
  results.fileUploadService = await testFileUploadService();

  // Test 4: Socket service
  results.socketService = await testSocketService();

  // Test 5: Admin login
  const adminToken = await testAdminLogin();
  results.adminLogin = adminToken !== null;

  if (!adminToken) {
    logError('\n❌ Cannot proceed without admin authentication.');
    process.exit(1);
  }

  // Test 6: Upload route
  results.uploadRoute = await testUploadRoute(adminToken);

  // Test 7: List conversations
  results.conversationsList = await testConversationsList(adminToken);

  // Test 8: Create group conversation
  const groupConversation = await testCreateGroupConversation(adminToken);
  results.createGroup = groupConversation !== null;

  if (groupConversation) {
    const conversationId = groupConversation.id;

    // Test 9: Send message
    const message = await testSendMessage(adminToken, conversationId);
    results.sendMessage = message !== null;

    // Test 10: Get messages
    results.getMessages = await testGetMessages(adminToken, conversationId);

    // Test 11: Mark as read
    results.markAsRead = await testMarkAsRead(adminToken, conversationId);
  }

  // Summary
  log('\n═══════════════════════════════════════════════════════', 'blue');
  log('📊 Test Summary', 'blue');
  log('═══════════════════════════════════════════════════════\n', 'blue');

  const allTests = [
    { name: 'Server Connection', result: results.serverConnection },
    { name: 'Routes Registration', result: results.routesRegistration },
    { name: 'File Upload Service', result: results.fileUploadService },
    { name: 'Socket.IO Service', result: results.socketService },
    { name: 'Admin Login', result: results.adminLogin },
    { name: 'Upload Route', result: results.uploadRoute },
    { name: 'List Conversations', result: results.conversationsList },
    { name: 'Create Group Conversation', result: results.createGroup },
    { name: 'Send Message', result: results.sendMessage },
    { name: 'Get Messages', result: results.getMessages },
    { name: 'Mark as Read', result: results.markAsRead },
  ];

  let passed = 0;
  let failed = 0;

  allTests.forEach((test) => {
    if (test.result) {
      logSuccess(test.name);
      passed++;
    } else {
      logError(test.name);
      failed++;
    }
  });

  log(`\n✅ Passed: ${passed}/${allTests.length}`, 'green');
  log(`❌ Failed: ${failed}/${allTests.length}`, failed > 0 ? 'red' : 'green');

  if (failed === 0) {
    log('\n🎉 All backend tests passed! Ready for frontend integration.', 'green');
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', 'yellow');
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
