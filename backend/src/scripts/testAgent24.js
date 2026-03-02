/**
 * Test script for AI AGENT 24
 * 
 * Tests the chat assistant with various queries
 */

require('dotenv').config();
const axios = require('axios');

const API_BASE = process.env.ADMIN_DASHBOARD_URL || 'http://localhost:5000';
const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'password123';

async function testAgent24() {
  try {
    console.log('🤖 Testing AI AGENT 24\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Step 1: Login to get admin token
    console.log('📋 Step 1: Logging in as admin...\n');
    
    const loginRes = await axios.post(`${API_BASE}/api/admin/login`, {
      email: TEST_ADMIN_EMAIL,
      password: TEST_ADMIN_PASSWORD,
    });

    if (!loginRes.data || !loginRes.data.token) {
      console.error('❌ Login failed. Please check credentials.');
      console.log('💡 Make sure you have an admin account:');
      console.log('   curl -X POST http://localhost:5000/api/dev/seed-admin');
      return;
    }

    const token = loginRes.data.token;
    console.log('✅ Login successful\n');

    // Step 2: Test various queries
    const testQueries = [
      {
        name: 'High-Risk Shifts Query',
        message: 'Show me high-risk shifts',
        expectedKeywords: ['high-risk', 'risk', 'shift'],
      },
      {
        name: 'Unfilled Shifts Query',
        message: 'List unfilled shifts',
        expectedKeywords: ['unfilled', 'shift'],
      },
      {
        name: 'Guard Performance Query',
        message: 'Who is most reliable for night shifts?',
        expectedKeywords: ['reliable', 'guard', 'performance'],
      },
      {
        name: 'Callout History Query',
        message: 'Show me recent callouts',
        expectedKeywords: ['callout', 'recent'],
      },
      {
        name: 'Shift Schedule Query',
        message: 'What shifts are scheduled for today?',
        expectedKeywords: ['shift', 'today', 'schedule'],
      },
    ];

    console.log('📋 Step 2: Testing chat queries...\n');

    for (let i = 0; i < testQueries.length; i++) {
      const test = testQueries[i];
      console.log(`\n${i + 1}. Testing: ${test.name}`);
      console.log(`   Query: "${test.message}"\n`);

      try {
        const chatRes = await axios.post(
          `${API_BASE}/api/admin/assistant/chat`,
          {
            message: test.message,
            history: [],
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (chatRes.data && chatRes.data.ok) {
          const response = chatRes.data.response || chatRes.data.answer || '';
          console.log(`   ✅ Response received (${response.length} characters)`);
          console.log(`   Response preview: ${response.substring(0, 150)}...\n`);

          // Check if response contains expected keywords (case-insensitive)
          const responseLower = response.toLowerCase();
          const foundKeywords = test.expectedKeywords.filter(keyword =>
            responseLower.includes(keyword.toLowerCase())
          );

          if (foundKeywords.length > 0) {
            console.log(`   ✅ Found expected keywords: ${foundKeywords.join(', ')}`);
          } else {
            console.log(`   ⚠️  Expected keywords not found: ${test.expectedKeywords.join(', ')}`);
          }

          // Show additional data if available
          if (chatRes.data.data) {
            console.log(`   📊 Data provided:`, Object.keys(chatRes.data.data).join(', '));
          }

          if (chatRes.data.citations && chatRes.data.citations.length > 0) {
            console.log(`   📚 Citations: ${chatRes.data.citations.length}`);
          }

          if (chatRes.data.actions && chatRes.data.actions.length > 0) {
            console.log(`   ⚡ Actions: ${chatRes.data.actions.length}`);
          }
        } else {
          console.log(`   ❌ Failed: ${chatRes.data?.message || 'Unknown error'}`);
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.response?.data?.message || error.message}`);
        if (error.response?.status === 401) {
          console.log('   💡 Token may have expired. Please login again.');
        }
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Step 3: Test conversation history
    console.log('\n\n📋 Step 3: Testing conversation history...\n');
    
    const historyTest = [
      { role: 'user', content: 'Show me high-risk shifts' },
      { role: 'assistant', content: 'I found 3 high-risk shifts...' },
      { role: 'user', content: 'Tell me more about the first one' },
    ];

    console.log('   Sending follow-up question with history...\n');

    try {
      const followUpRes = await axios.post(
        `${API_BASE}/api/admin/assistant/chat`,
        {
          message: 'Tell me more about the first one',
          history: historyTest.slice(0, 2), // Send first 2 messages as history
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (followUpRes.data && followUpRes.data.ok) {
        console.log('   ✅ Follow-up response received');
        console.log(`   Response: ${(followUpRes.data.response || followUpRes.data.answer || '').substring(0, 200)}...\n`);
      } else {
        console.log(`   ⚠️  Follow-up failed: ${followUpRes.data?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.log(`   ❌ Follow-up error: ${error.response?.data?.message || error.message}`);
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ AI AGENT 24 TEST COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n💡 To test in the UI:');
    console.log('   1. Open http://localhost:3001/supervisor');
    console.log('   2. Start chatting with AI AGENT 24');
    console.log('   3. Try queries like:');
    console.log('      - "Show me high-risk shifts"');
    console.log('      - "List unfilled shifts"');
    console.log('      - "Who is most reliable?"');
    console.log('      - "Recent callouts"');
    console.log('      - "Shifts for tomorrow"');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    console.error('\n💡 Make sure:');
    console.error('   1. Backend server is running on port 5000');
    console.error('   2. Admin account exists (run: curl -X POST http://localhost:5000/api/dev/seed-admin)');
    console.error('   3. Database is accessible');
  }
}

// Run the test
testAgent24();
