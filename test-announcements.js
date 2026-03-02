#!/usr/bin/env node

/**
 * Test script for Announcements API
 * Tests the announcements endpoints in abe-guard-ai backend
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:4000';
const API_URL = `${BASE_URL}/api/admin/announcements`;

// You'll need to provide an admin token
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

if (!ADMIN_TOKEN) {
  console.log('⚠️  No ADMIN_TOKEN provided. Set it as an environment variable:');
  console.log('   export ADMIN_TOKEN="your-token-here"');
  console.log('');
  console.log('To get your token:');
  console.log('1. Open admin dashboard in browser');
  console.log('2. Open browser console (F12)');
  console.log('3. Run: localStorage.getItem("adminToken")');
  console.log('4. Copy the token');
  process.exit(1);
}

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

async function testAnnouncements() {
  console.log('🧪 Testing Announcements API');
  console.log('============================\n');

  try {
    // Test 1: List announcements
    console.log('1️⃣  Testing GET /api/admin/announcements');
    try {
      const listRes = await client.get(API_URL);
      console.log('   ✅ Success!');
      console.log(`   📊 Found ${listRes.data?.data?.length || listRes.data?.length || 0} announcements`);
      if (listRes.data?.data?.length > 0) {
        console.log(`   📝 Latest: "${listRes.data.data[0].title}"`);
      }
    } catch (err) {
      console.log('   ❌ Failed:', err.response?.data?.message || err.message);
      console.log('   Status:', err.response?.status);
    }

    console.log('');

    // Test 2: Create announcement
    console.log('2️⃣  Testing POST /api/admin/announcements');
    const testAnnouncement = {
      title: `Test Announcement ${new Date().toISOString()}`,
      message: 'This is a test announcement created by the test script. It should appear in the admin dashboard and guard UI.',
      category: 'COMPANY_WIDE',
      priority: 'MEDIUM',
    };

    try {
      const createRes = await client.post(API_URL, testAnnouncement);
      console.log('   ✅ Success!');
      console.log(`   📝 Created announcement: "${createRes.data?.data?.title || createRes.data?.title}"`);
      console.log(`   🆔 ID: ${createRes.data?.data?.id || createRes.data?.id}`);
      
      const createdId = createRes.data?.data?.id || createRes.data?.id;

      // Test 3: Update announcement
      console.log('');
      console.log('3️⃣  Testing PUT /api/admin/announcements/:id');
      try {
        const updateRes = await client.put(`${API_URL}/${createdId}`, {
          priority: 'HIGH',
          message: testAnnouncement.message + ' (Updated)',
        });
        console.log('   ✅ Success!');
        console.log(`   📝 Updated priority to: ${updateRes.data?.data?.priority || 'HIGH'}`);
      } catch (err) {
        console.log('   ❌ Failed:', err.response?.data?.message || err.message);
      }

      // Test 4: Delete announcement
      console.log('');
      console.log('4️⃣  Testing DELETE /api/admin/announcements/:id');
      try {
        const deleteRes = await client.delete(`${API_URL}/${createdId}`);
        console.log('   ✅ Success!');
        console.log('   🗑️  Announcement deleted (deactivated)');
      } catch (err) {
        console.log('   ❌ Failed:', err.response?.data?.message || err.message);
      }

    } catch (err) {
      console.log('   ❌ Failed:', err.response?.data?.message || err.message);
      console.log('   Status:', err.response?.status);
      if (err.response?.data) {
        console.log('   Response:', JSON.stringify(err.response.data, null, 2));
      }
    }

    console.log('');
    console.log('✅ Test complete!');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

// Check if backend is running
axios.get(`${BASE_URL}/health`).catch(() => {
  console.log('⚠️  Warning: Could not reach abe-guard-ai backend at', BASE_URL);
  console.log('   Make sure it\'s running on port 4000');
  console.log('');
}).then(() => {
  testAnnouncements();
});
