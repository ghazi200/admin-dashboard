/**
 * Quick API Test - Just checks if routes are accessible
 * 
 * Usage: node src/scripts/quickAPITest.js
 */

const http = require('http');

const API_BASE_URL = 'http://localhost:5000';

function makeRequest(method, path, token = null) {
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

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: body ? JSON.parse(body) : {},
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: body,
          });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('\n🔍 Quick API Route Check\n');

  // Test 1: Health check
  try {
    const health = await makeRequest('GET', '/health');
    console.log(`✅ Health: ${health.status === 200 ? 'OK' : `Status ${health.status}`}`);
  } catch (e) {
    console.log(`❌ Health: Server not running - ${e.message}`);
    console.log('\n⚠️  Please start the server: cd backend && npm start\n');
    process.exit(1);
  }

  // Test 2: Check if messaging routes exist (should get 401/403, not 404)
  try {
    const conversations = await makeRequest('GET', '/api/admin/messages/conversations');
    
    if (conversations.status === 404) {
      console.log('❌ Messaging routes: 404 Not Found');
      console.log('\n⚠️  Routes not found! The server needs to be restarted.');
      console.log('   The routes were added to server.js but the server');
      console.log('   needs to be restarted to load them.\n');
      console.log('   Solution:');
      console.log('   1. Stop the server (Ctrl+C)');
      console.log('   2. Restart: cd backend && npm start\n');
    } else if (conversations.status === 401 || conversations.status === 403) {
      console.log(`✅ Messaging routes: ${conversations.status} (Authentication required - routes exist!)`);
    } else {
      console.log(`ℹ️  Messaging routes: Status ${conversations.status}`);
    }
  } catch (e) {
    console.log(`❌ Messaging routes: Error - ${e.message}`);
  }

  // Test 3: Check guard routes
  try {
    const guardRoutes = await makeRequest('GET', '/api/guard/messages/conversations');
    
    if (guardRoutes.status === 404) {
      console.log('❌ Guard messaging routes: 404 Not Found');
    } else if (guardRoutes.status === 401 || guardRoutes.status === 403) {
      console.log(`✅ Guard messaging routes: ${guardRoutes.status} (Authentication required - routes exist!)`);
    } else {
      console.log(`ℹ️  Guard messaging routes: Status ${guardRoutes.status}`);
    }
  } catch (e) {
    console.log(`❌ Guard messaging routes: Error - ${e.message}`);
  }

  console.log('');
}

main().catch(console.error);
