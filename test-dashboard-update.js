/**
 * Test script to verify dashboard availability updates
 * This simulates updating a guard's availability and checking if the dashboard endpoint reflects the change
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api/admin';
let adminToken = null;

async function login() {
  try {
    console.log('🔐 Logging in as admin...');
    const response = await axios.post(`${BASE_URL}/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    adminToken = response.data.token;
    console.log('✅ Login successful');
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data?.message || error.message);
    // Try with different credentials
    try {
      const response = await axios.post(`${BASE_URL}/login`, {
        email: 'admin@test.com',
        password: 'password'
      });
      adminToken = response.data.token;
      console.log('✅ Login successful with alternative credentials');
      return true;
    } catch (err) {
      console.error('❌ Alternative login also failed');
      return false;
    }
  }
}

async function getGuardAvailability() {
  try {
    const response = await axios.get(`${BASE_URL}/dashboard/guard-availability`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    return response.data;
  } catch (error) {
    console.error('❌ Failed to get guard availability:', error.response?.data?.message || error.message);
    return null;
  }
}

async function listGuards() {
  try {
    const response = await axios.get(`${BASE_URL}/guards`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    return response.data;
  } catch (error) {
    console.error('❌ Failed to list guards:', error.response?.data?.message || error.message);
    return null;
  }
}

async function updateGuardAvailability(guardId, isAvailable) {
  try {
    const response = await axios.patch(`${BASE_URL}/guards/${guardId}`, {
      availability: isAvailable,
      isAvailable: isAvailable
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    return response.data;
  } catch (error) {
    console.error('❌ Failed to update guard availability:', error.response?.data?.message || error.message);
    console.error('   Status:', error.response?.status);
    console.error('   Data:', error.response?.data);
    return null;
  }
}

async function testDashboardUpdate() {
  console.log('🧪 Starting dashboard update test...\n');

  // Step 1: Login
  const loggedIn = await login();
  if (!loggedIn) {
    console.log('❌ Cannot proceed without authentication');
    return;
  }

  // Step 2: Get initial availability
  console.log('\n📊 Step 1: Getting initial guard availability...');
  const initialAvailability = await getGuardAvailability();
  if (!initialAvailability) {
    console.log('❌ Cannot get initial availability');
    return;
  }
  console.log('✅ Initial availability:', {
    total: initialAvailability.total,
    active: initialAvailability.active,
    available: initialAvailability.available,
    unavailable: initialAvailability.unavailable
  });

  // Step 3: List guards to find one to update
  console.log('\n👥 Step 2: Listing guards...');
  const guards = await listGuards();
  if (!guards || !Array.isArray(guards) || guards.length === 0) {
    console.log('❌ No guards found');
    return;
  }
  const testGuard = guards[0];
  console.log(`✅ Found guard: ${testGuard.name} (${testGuard.id})`);
  console.log(`   Current availability: ${testGuard.availability}`);

  // Step 4: Update guard availability
  const newAvailability = !testGuard.availability;
  console.log(`\n🔄 Step 3: Updating guard availability to ${newAvailability}...`);
  const updateResult = await updateGuardAvailability(testGuard.id, newAvailability);
  if (!updateResult) {
    console.log('❌ Update failed');
    return;
  }
  console.log('✅ Update successful');
  console.log('   Updated guard:', {
    name: updateResult.name,
    availability: updateResult.availability
  });

  // Step 5: Wait a bit for the database to update
  console.log('\n⏳ Step 4: Waiting 2 seconds for database to update...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Step 6: Check if dashboard reflects the change
  console.log('\n📊 Step 5: Checking if dashboard reflects the change...');
  const updatedAvailability = await getGuardAvailability();
  if (!updatedAvailability) {
    console.log('❌ Cannot get updated availability');
    return;
  }
  console.log('✅ Updated availability:', {
    total: updatedAvailability.total,
    active: updatedAvailability.active,
    available: updatedAvailability.available,
    unavailable: updatedAvailability.unavailable
  });

  // Step 7: Compare
  console.log('\n📈 Step 6: Comparing results...');
  const availableChanged = initialAvailability.available !== updatedAvailability.available;
  const unavailableChanged = initialAvailability.unavailable !== updatedAvailability.unavailable;
  
  if (availableChanged || unavailableChanged) {
    console.log('✅ SUCCESS: Dashboard updated!');
    console.log('   Available changed:', availableChanged, 
      `(${initialAvailability.available} → ${updatedAvailability.available})`);
    console.log('   Unavailable changed:', unavailableChanged,
      `(${initialAvailability.unavailable} → ${updatedAvailability.unavailable})`);
  } else {
    console.log('⚠️  WARNING: Dashboard did not update');
    console.log('   Available:', initialAvailability.available, '→', updatedAvailability.available);
    console.log('   Unavailable:', initialAvailability.unavailable, '→', updatedAvailability.unavailable);
    console.log('\n   This could mean:');
    console.log('   - The guard is not in the active guards list');
    console.log('   - The availability log was not created');
    console.log('   - There is a tenant filtering issue');
    console.log('   - The query is not finding the updated log');
  }

  // Step 8: Restore original state
  console.log(`\n🔄 Step 7: Restoring original availability (${testGuard.availability})...`);
  await updateGuardAvailability(testGuard.id, testGuard.availability);
  await new Promise(resolve => setTimeout(resolve, 1000));
  const restoredAvailability = await getGuardAvailability();
  console.log('✅ Restored availability:', {
    available: restoredAvailability?.available,
    unavailable: restoredAvailability?.unavailable
  });

  console.log('\n✅ Test complete!');
}

// Run the test
testDashboardUpdate().catch(error => {
  console.error('❌ Test failed with error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
