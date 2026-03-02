/**
 * Test Messaging API Endpoints
 * 
 * Tests all messaging endpoints with actual HTTP requests
 * 
 * Usage: 
 *   1. Make sure backend server is running: npm start (in backend directory)
 *   2. Run: node src/scripts/testMessagingAPI.js
 */

const http = require('http');
const https = require('https');

const API_BASE_URL = process.env.API_URL || 'http://localhost:5000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'password123';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// HTTP request helper
function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (data) {
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
    }

    const protocol = url.protocol === 'https:' ? https : http;
    const req = protocol.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
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

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
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
      logInfo(`Token: ${response.body.token.substring(0, 20)}...`);
      return response.body.token;
    } else {
      logError(`Login failed: ${response.body.message || 'Unknown error'}`);
      logWarning('You may need to create a test admin account first');
      return null;
    }
  } catch (error) {
    logError(`Login request failed: ${error.message}`);
    return null;
  }
}

async function testAdminConversationsList(adminToken) {
  log('\n📋 Testing GET /api/admin/messages/conversations...\n', 'blue');

  try {
    const response = await makeRequest('GET', '/api/admin/messages/conversations', null, adminToken);

    if (response.status === 200) {
      logSuccess('Conversations list retrieved');
      logInfo(`Found ${response.body.conversations?.length || 0} conversations`);
      return response.body;
    } else {
      logError(`Failed: ${response.status} - ${response.body.message || 'Unknown error'}`);
      if (response.status === 404) {
        logWarning('Route not found - server may need to be restarted to load new routes');
        logInfo('Try: cd backend && npm start (or restart the server)');
      }
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

async function testCreateGroupConversation(adminToken) {
  log('\n💬 Testing POST /api/admin/messages/conversations/group...\n', 'blue');

  try {
    // First, get a guard ID (we'll need to query the database or use a known ID)
    // For now, we'll create a group with just the admin
    const response = await makeRequest(
      'POST',
      '/api/admin/messages/conversations/group',
      {
        name: 'Test Group Chat',
        participantIds: [], // Empty for now - just admin
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
        logError(`Error details: ${response.body.error}`);
      }
      return null;
    }
  } catch (error) {
    logError(`Request failed: ${error.message}`);
    return null;
  }
}

async function testGetConversation(adminToken, conversationId) {
  log('\n📖 Testing GET /api/admin/messages/conversations/:id...\n', 'blue');

  try {
    const response = await makeRequest(
      'GET',
      `/api/admin/messages/conversations/${conversationId}`,
      null,
      adminToken
    );

    if (response.status === 200) {
      logSuccess('Conversation details retrieved');
      logInfo(`Type: ${response.body.conversation?.type}`);
      logInfo(`Participants: ${response.body.conversation?.participants?.length || 0}`);
      return response.body.conversation;
    } else {
      logError(`Failed: ${response.status} - ${response.body.message || 'Unknown error'}`);
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
        content: 'Hello! This is a test message from the API test script.',
        messageType: 'text',
      },
      adminToken
    );

    if (response.status === 201) {
      logSuccess('Message sent successfully');
      const msg = response.body.message || (response.body.id && response.body);
      logInfo(`Message ID: ${msg?.id}`);
      logInfo(`Content: ${msg?.content}`);
      const createdAt = msg?.created_at ?? msg?.createdAt;
      if (createdAt) {
        const d = new Date(createdAt);
        if (!Number.isNaN(d.getTime())) {
          logInfo(`created_at: ${createdAt} (ISO OK)`);
        } else {
          logWarning(`created_at not parseable: ${createdAt}`);
        }
      }
      return msg || response.body.message;
    } else {
      logError(`Failed: ${response.status} - ${response.body.message || 'Unknown error'}`);
      if (response.body.error) {
        logError(`Error details: ${response.body.error}`);
      }
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
      const messages = response.body.messages || [];
      const pagination = response.body.pagination || {};
      logInfo(`Total messages: ${pagination.total ?? 0}`);
      logInfo(`Messages in response: ${messages.length}`);
      messages.forEach((m, i) => {
        const ts = m.created_at ?? m.createdAt;
        if (ts) {
          const valid = !Number.isNaN(new Date(ts).getTime());
          logInfo(`  [${i}] id=${m.id} created_at=${ts} ${valid ? '(ISO OK)' : '(invalid)'}`);
        }
      });
      return response.body;
    } else {
      logError(`Failed: ${response.status} - ${response.body.message || 'Unknown error'}`);
      return null;
    }
  } catch (error) {
    logError(`Request failed: ${error.message}`);
    return null;
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

async function testUnauthorizedAccess() {
  log('\n🔒 Testing Unauthorized Access...\n', 'blue');

  try {
    const response = await makeRequest('GET', '/api/admin/messages/conversations');

    if (response.status === 401 || response.status === 403) {
      logSuccess('Unauthorized access correctly rejected');
      return true;
    } else {
      logError(`Security issue: Unauthorized request returned ${response.status}`);
      return false;
    }
  } catch (error) {
    logError(`Request failed: ${error.message}`);
    return false;
  }
}

async function main() {
  log('\n═══════════════════════════════════════════════════════', 'blue');
  log('🧪 Testing Messaging API Endpoints', 'blue');
  log('═══════════════════════════════════════════════════════\n', 'blue');

  const results = {
    serverConnection: false,
    adminLogin: false,
    conversationsList: false,
    createGroup: false,
    getConversation: false,
    sendMessage: false,
    getMessages: false,
    markAsRead: false,
    unauthorized: false,
  };

  // Test 1: Server connection
  results.serverConnection = await testServerConnection();
  if (!results.serverConnection) {
    logError('\n❌ Cannot connect to server. Please start the backend server first.');
    logInfo('Run: cd backend && npm start');
    process.exit(1);
  }

  // Test 2: Admin login
  const adminToken = await testAdminLogin();
  results.adminLogin = adminToken !== null;

  if (!adminToken) {
    logError('\n❌ Cannot proceed without admin authentication.');
    logWarning('You may need to create a test admin account or use correct credentials.');
    process.exit(1);
  }

  // Test 3: Unauthorized access
  results.unauthorized = await testUnauthorizedAccess();

  // Test 4: List conversations
  const conversationsList = await testAdminConversationsList(adminToken);
  results.conversationsList = conversationsList !== null;

  // Test 5: Create group conversation
  const groupConversation = await testCreateGroupConversation(adminToken);
  results.createGroup = groupConversation !== null;

  if (!groupConversation) {
    logWarning('Skipping remaining tests (no conversation created)');
  } else {
    const conversationId = groupConversation.id;

    // Test 6: Get conversation details
    const conversationDetails = await testGetConversation(adminToken, conversationId);
    results.getConversation = conversationDetails !== null;

    // Test 7: Send message
    const message = await testSendMessage(adminToken, conversationId);
    results.sendMessage = message !== null;

    // Test 8: Get messages
    const messages = await testGetMessages(adminToken, conversationId);
    results.getMessages = messages !== null;

    // Test 9: Mark as read
    results.markAsRead = await testMarkAsRead(adminToken, conversationId);
  }

  // Summary
  log('\n═══════════════════════════════════════════════════════', 'blue');
  log('📊 Test Summary', 'blue');
  log('═══════════════════════════════════════════════════════\n', 'blue');

  const allTests = [
    { name: 'Server Connection', result: results.serverConnection },
    { name: 'Admin Login', result: results.adminLogin },
    { name: 'Unauthorized Access', result: results.unauthorized },
    { name: 'List Conversations', result: results.conversationsList },
    { name: 'Create Group Conversation', result: results.createGroup },
    { name: 'Get Conversation Details', result: results.getConversation },
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
    log('\n🎉 All API tests passed!', 'green');
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
