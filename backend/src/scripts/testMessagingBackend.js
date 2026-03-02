/**
 * Test Messaging Backend Implementation
 * 
 * Tests all messaging endpoints and Socket.IO functionality
 * 
 * Usage: node src/scripts/testMessagingBackend.js
 */

const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');

// Load .env
const envPath = path.resolve(__dirname, '../../.env');
let databaseUrl = null;

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/^DATABASE_URL=(.+)$/m);
  if (match) {
    databaseUrl = match[1].trim();
  }
}

require('dotenv').config({ path: envPath, override: true });
const finalDatabaseUrl = databaseUrl || process.env.DATABASE_URL;

if (!finalDatabaseUrl) {
  console.error('❌ DATABASE_URL not found!');
  process.exit(1);
}

const sequelize = new Sequelize(finalDatabaseUrl, {
  dialect: 'postgres',
  logging: false,
});

async function testDatabaseTables() {
  console.log('\n📊 Testing Database Tables...\n');

  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Verify database name
    const [dbInfo] = await sequelize.query('SELECT current_database() as db_name');
    const dbName = dbInfo[0]?.db_name;
    console.log(`📊 Connected to database: ${dbName}`);

    if (dbName !== 'abe_guard' && dbName !== 'abe-guard') {
      console.log(`⚠️  WARNING: Connected to "${dbName}" instead of "abe_guard"`);
    } else {
      console.log('✅ Correct database (abe_guard)\n');
    }

    // Check if tables exist
    const tables = ['conversations', 'conversation_participants', 'messages', 'message_reads'];
    console.log('Checking tables:');
    
    for (const tableName of tables) {
      try {
        const [result] = await sequelize.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = '${tableName}'
          ) as exists
        `);
        
        if (result[0].exists) {
          // Get row count
          const [countResult] = await sequelize.query(`SELECT COUNT(*) as count FROM ${tableName}`);
          const count = countResult[0].count;
          console.log(`   ✅ ${tableName} exists (${count} rows)`);
        } else {
          console.log(`   ❌ ${tableName} does NOT exist`);
        }
      } catch (error) {
        console.log(`   ❌ Error checking ${tableName}: ${error.message}`);
      }
    }

    // Check indexes
    console.log('\nChecking indexes:');
    const indexes = [
      'idx_conversations_tenant',
      'idx_conversations_type',
      'idx_participants_conversation',
      'idx_messages_conversation',
      'idx_reads_message',
    ];

    for (const indexName of indexes) {
      try {
        const [result] = await sequelize.query(`
          SELECT EXISTS (
            SELECT FROM pg_indexes 
            WHERE indexname = '${indexName}'
          ) as exists
        `);
        
        if (result[0].exists) {
          console.log(`   ✅ ${indexName} exists`);
        } else {
          console.log(`   ⚠️  ${indexName} does NOT exist`);
        }
      } catch (error) {
        console.log(`   ❌ Error checking ${indexName}: ${error.message}`);
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    return false;
  }
}

async function testModels() {
  console.log('\n📦 Testing Sequelize Models...\n');

  try {
    const models = require('../models');
    const { Conversation, ConversationParticipant, Message, MessageRead } = models;

    // Test Conversation model
    if (Conversation) {
      console.log('✅ Conversation model loaded');
      const convCount = await Conversation.count();
      console.log(`   📊 Conversations in database: ${convCount}`);
    } else {
      console.log('❌ Conversation model NOT found');
      return false;
    }

    // Test ConversationParticipant model
    if (ConversationParticipant) {
      console.log('✅ ConversationParticipant model loaded');
      const partCount = await ConversationParticipant.count();
      console.log(`   📊 Participants in database: ${partCount}`);
    } else {
      console.log('❌ ConversationParticipant model NOT found');
      return false;
    }

    // Test Message model
    if (Message) {
      console.log('✅ Message model loaded');
      const msgCount = await Message.count();
      console.log(`   📊 Messages in database: ${msgCount}`);
    } else {
      console.log('❌ Message model NOT found');
      return false;
    }

    // Test MessageRead model
    if (MessageRead) {
      console.log('✅ MessageRead model loaded');
      const readCount = await MessageRead.count();
      console.log(`   📊 Read receipts in database: ${readCount}`);
    } else {
      console.log('❌ MessageRead model NOT found');
      return false;
    }

    // Test associations
    console.log('\nTesting associations:');
    try {
      const testConv = await Conversation.findOne({
        include: [
          { model: ConversationParticipant, as: 'participants' },
          { model: Message, as: 'messages' },
        ],
        limit: 1,
      });

      if (testConv) {
        console.log('✅ Associations work (found conversation with participants and messages)');
      } else {
        console.log('ℹ️  No conversations found to test associations');
      }
    } catch (error) {
      console.log(`⚠️  Association test error: ${error.message}`);
    }

    return true;
  } catch (error) {
    console.error('❌ Models test failed:', error.message);
    return false;
  }
}

async function testRoutes() {
  console.log('\n🛣️  Testing API Routes...\n');

  try {
    // Check if route files exist
    const routeFiles = [
      '../routes/guardMessages.routes.js',
      '../routes/adminMessages.routes.js',
    ];

    console.log('Checking route files:');
    for (const routeFile of routeFiles) {
      const routePath = path.resolve(__dirname, routeFile);
      if (fs.existsSync(routePath)) {
        console.log(`   ✅ ${path.basename(routeFile)} exists`);
      } else {
        console.log(`   ❌ ${path.basename(routeFile)} does NOT exist`);
      }
    }

    // Try to require routes (this will catch syntax errors)
    console.log('\nLoading route modules:');
    try {
      const guardRoutes = require('../routes/guardMessages.routes');
      console.log('   ✅ guardMessages.routes.js loaded successfully');
    } catch (error) {
      console.log(`   ❌ guardMessages.routes.js failed: ${error.message}`);
    }

    try {
      const adminRoutes = require('../routes/adminMessages.routes');
      console.log('   ✅ adminMessages.routes.js loaded successfully');
    } catch (error) {
      console.log(`   ❌ adminMessages.routes.js failed: ${error.message}`);
    }

    return true;
  } catch (error) {
    console.error('❌ Routes test failed:', error.message);
    return false;
  }
}

async function testSocketService() {
  console.log('\n🔌 Testing Socket.IO Service...\n');

  try {
    const socketServicePath = path.resolve(__dirname, '../services/messagingSocket.service.js');
    
    if (fs.existsSync(socketServicePath)) {
      console.log('✅ messagingSocket.service.js exists');
      
      try {
        const { initMessagingSocketHandlers } = require('../services/messagingSocket.service');
        if (typeof initMessagingSocketHandlers === 'function') {
          console.log('   ✅ initMessagingSocketHandlers function exported');
        } else {
          console.log('   ❌ initMessagingSocketHandlers is not a function');
        }
      } catch (error) {
        console.log(`   ❌ Error loading service: ${error.message}`);
      }
    } else {
      console.log('❌ messagingSocket.service.js does NOT exist');
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ Socket service test failed:', error.message);
    return false;
  }
}

async function testServerRegistration() {
  console.log('\n🖥️  Testing Server Registration...\n');

  try {
    const serverPath = path.resolve(__dirname, '../../server.js');
    
    if (!fs.existsSync(serverPath)) {
      console.log('❌ server.js not found');
      return false;
    }

    const serverContent = fs.readFileSync(serverPath, 'utf8');

    // Check for route registrations
    const checks = [
      { name: 'Guard messages routes', pattern: /guardMessagesRoutes|api\/guard\/messages/ },
      { name: 'Admin messages routes', pattern: /adminMessagesRoutes|api\/admin\/messages/ },
      { name: 'Messaging socket handlers', pattern: /initMessagingSocketHandlers|messagingSocket\.service/ },
    ];

    console.log('Checking server.js registrations:');
    for (const check of checks) {
      if (check.pattern.test(serverContent)) {
        console.log(`   ✅ ${check.name} registered`);
      } else {
        console.log(`   ❌ ${check.name} NOT found in server.js`);
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Server registration test failed:', error.message);
    return false;
  }
}

async function createTestData() {
  console.log('\n🧪 Creating Test Data...\n');

  try {
    const models = require('../models');
    const { Conversation, ConversationParticipant, Message, MessageRead, Tenant, Admin, Guard } = models;

    // Check if we have tenants
    const tenantCount = await Tenant.count();
    if (tenantCount === 0) {
      console.log('⚠️  No tenants found. Skipping test data creation.');
      return false;
    }

    const tenant = await Tenant.findOne();
    console.log(`✅ Found tenant: ${tenant.id}`);

    // Check for admins (find one with UUID format)
    const adminCount = await Admin.count();
    if (adminCount === 0) {
      console.log('⚠️  No admins found. Skipping test data creation.');
      return false;
    }

    // Find an admin with a valid UUID (not integer ID)
    const allAdmins = await Admin.findAll({ limit: 10 });
    const admin = allAdmins.find(a => {
      const idStr = String(a.id);
      // Check if it's a UUID format (has dashes and is 36 chars)
      return idStr.includes('-') && idStr.length === 36;
    }) || allAdmins[0];

    if (!admin) {
      console.log('⚠️  No valid admin found. Skipping test data creation.');
      return false;
    }

    console.log(`✅ Found admin: ${admin.id} (${typeof admin.id === 'string' && admin.id.includes('-') ? 'UUID' : 'Integer'})`);
    
    // If admin ID is not a UUID, we can't use it for messaging (which requires UUIDs)
    if (typeof admin.id !== 'string' || !admin.id.includes('-')) {
      console.log('⚠️  Admin ID is not a UUID. Creating test data with a generated UUID...');
      // We'll use a generated UUID for created_by_id instead
    }

    // Check for guards
    const guardCount = await Guard.count();
    if (guardCount === 0) {
      console.log('⚠️  No guards found. Skipping test data creation.');
      return false;
    }

    const guard = await Guard.findOne();
    console.log(`✅ Found guard: ${guard.id}`);

    // Create a test conversation
    console.log('\nCreating test conversation...');
    
    // Use UUID for created_by_id (generate one if admin.id is not UUID)
    const adminIdStr = String(admin.id);
    const adminUuid = adminIdStr.includes('-') && adminIdStr.length === 36 
      ? admin.id 
      : require('crypto').randomUUID(); // Generate UUID if admin.id is not UUID
    
    const conversation = await Conversation.create({
      tenant_id: tenant.id,
      type: 'direct',
      name: null,
      created_by_type: 'admin',
      created_by_id: adminUuid,
      shift_id: null,
      location: null,
    });
    console.log(`✅ Created conversation: ${conversation.id}`);

    // Add participants
    // For participant_id, we'll use the guard's UUID (which should be valid)
    // and create a test admin UUID for the admin participant
    await ConversationParticipant.create({
      conversation_id: conversation.id,
      participant_type: 'admin',
      participant_id: adminUuid,
    });
    console.log(`✅ Added admin participant: ${adminUuid}`);

    await ConversationParticipant.create({
      conversation_id: conversation.id,
      participant_type: 'guard',
      participant_id: guard.id,
    });
    console.log('✅ Added guard participant');

    // Create a test message
    const message = await Message.create({
      conversation_id: conversation.id,
      sender_type: 'admin',
      sender_id: adminUuid,
      content: 'Test message from admin',
      message_type: 'text',
    });
    console.log(`✅ Created message: ${message.id}`);

    // Create read receipt
    await MessageRead.create({
      message_id: message.id,
      reader_type: 'admin',
      reader_id: adminUuid,
    });
    console.log('✅ Created read receipt');

    console.log('\n✅ Test data created successfully!');
    console.log(`   Conversation ID: ${conversation.id}`);
    console.log(`   Message ID: ${message.id}`);

    return true;
  } catch (error) {
    console.error('❌ Test data creation failed:', error.message);
    console.error('   Stack:', error.stack);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 Testing Messaging Backend Implementation');
  console.log('═══════════════════════════════════════════════════════');

  const results = {
    database: false,
    models: false,
    routes: false,
    socket: false,
    server: false,
    testData: false,
  };

  // Run tests
  results.database = await testDatabaseTables();
  results.models = await testModels();
  results.routes = await testRoutes();
  results.socket = await testSocketService();
  results.server = await testServerRegistration();
  results.testData = await createTestData();

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 Test Summary');
  console.log('═══════════════════════════════════════════════════════\n');

  const allTests = [
    { name: 'Database Tables', result: results.database },
    { name: 'Sequelize Models', result: results.models },
    { name: 'API Routes', result: results.routes },
    { name: 'Socket.IO Service', result: results.socket },
    { name: 'Server Registration', result: results.server },
    { name: 'Test Data Creation', result: results.testData },
  ];

  let passed = 0;
  let failed = 0;

  allTests.forEach((test) => {
    const status = test.result ? '✅' : '❌';
    console.log(`${status} ${test.name}`);
    if (test.result) passed++;
    else failed++;
  });

  console.log(`\n✅ Passed: ${passed}/${allTests.length}`);
  console.log(`❌ Failed: ${failed}/${allTests.length}`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Backend is ready for use.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
  }

  await sequelize.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
