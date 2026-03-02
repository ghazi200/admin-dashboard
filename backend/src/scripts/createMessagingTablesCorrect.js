/**
 * Migration Script: Create Messaging System Tables (CORRECTED)
 * 
 * Uses the same database connection as models/index.js
 * This ensures we're using the correct abe_guard database
 */

// Use the models connection which already has the correct DATABASE_URL
const path = require('path');
const modelsPath = path.resolve(__dirname, '../models');
const models = require(modelsPath);
const { sequelize } = models;

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Verify we're connected to the correct database (abe_guard)
    const [dbInfo] = await sequelize.query('SELECT current_database() as db_name');
    const dbName = dbInfo[0]?.db_name;
    console.log(`📊 Connected to database: ${dbName}`);

    if (dbName === 'abe_guard' || dbName === 'abe-guard') {
      console.log('✅ CORRECT DATABASE (abe_guard)!\n');
    } else {
      console.log(`❌ WRONG DATABASE! Connected to "${dbName}" instead of "abe_guard"`);
      console.log('   Please check your DATABASE_URL in .env file\n');
      process.exit(1);
    }

    console.log('📊 Creating messaging tables...\n');

    // 1. Create conversations table
    console.log('1️⃣ Creating conversations table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('direct', 'group')),
        name VARCHAR(255),
        created_by_type VARCHAR(20) CHECK (created_by_type IN ('guard', 'admin')),
        created_by_id UUID,
        shift_id UUID,
        location VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('   ✅ conversations table created');

    // 2. Create conversation_participants table
    console.log('2️⃣ Creating conversation_participants table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS conversation_participants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        participant_type VARCHAR(20) NOT NULL CHECK (participant_type IN ('guard', 'admin')),
        participant_id UUID NOT NULL,
        joined_at TIMESTAMP DEFAULT NOW(),
        last_read_at TIMESTAMP,
        muted BOOLEAN DEFAULT FALSE,
        UNIQUE(conversation_id, participant_type, participant_id)
      );
    `);
    console.log('   ✅ conversation_participants table created');

    // 3. Create messages table
    console.log('3️⃣ Creating messages table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('guard', 'admin')),
        sender_id UUID NOT NULL,
        content TEXT NOT NULL,
        message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'system')),
        attachment_url TEXT,
        attachment_name VARCHAR(255),
        attachment_size INTEGER,
        attachment_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP
      );
    `);
    console.log('   ✅ messages table created');

    // 4. Create message_reads table
    console.log('4️⃣ Creating message_reads table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS message_reads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        reader_type VARCHAR(20) NOT NULL CHECK (reader_type IN ('guard', 'admin')),
        reader_id UUID NOT NULL,
        read_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(message_id, reader_type, reader_id)
      );
    `);
    console.log('   ✅ message_reads table created');

    // 5. Create indexes for performance
    console.log('\n📊 Creating indexes...\n');

    const indexes = [
      { name: 'idx_conversations_tenant', sql: 'CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);' },
      { name: 'idx_conversations_type', sql: 'CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type);' },
      { name: 'idx_conversations_shift', sql: 'CREATE INDEX IF NOT EXISTS idx_conversations_shift ON conversations(shift_id) WHERE shift_id IS NOT NULL;' },
      { name: 'idx_participants_conversation', sql: 'CREATE INDEX IF NOT EXISTS idx_participants_conversation ON conversation_participants(conversation_id);' },
      { name: 'idx_participants_user', sql: 'CREATE INDEX IF NOT EXISTS idx_participants_user ON conversation_participants(participant_type, participant_id);' },
      { name: 'idx_messages_conversation', sql: 'CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);' },
      { name: 'idx_messages_sender', sql: 'CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_type, sender_id);' },
      { name: 'idx_reads_message', sql: 'CREATE INDEX IF NOT EXISTS idx_reads_message ON message_reads(message_id);' },
      { name: 'idx_reads_reader', sql: 'CREATE INDEX IF NOT EXISTS idx_reads_reader ON message_reads(reader_type, reader_id);' },
    ];

    for (const index of indexes) {
      try {
        await sequelize.query(index.sql);
        console.log(`   ✅ Created index: ${index.name}`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`   ⚠️  Index ${index.name} already exists`);
        } else {
          console.error(`   ❌ Error creating index ${index.name}:`, err.message);
        }
      }
    }

    // 6. Add foreign key to tenants if tenants table exists
    console.log('\n🔗 Adding foreign key constraints...\n');
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants') THEN
            ALTER TABLE conversations 
            ADD CONSTRAINT fk_conversations_tenant 
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
            RAISE NOTICE 'Added foreign key: conversations.tenant_id -> tenants.id';
          END IF;
        END $$;
      `);
      console.log('   ✅ Foreign key constraints added (if tenants table exists)');
    } catch (err) {
      console.log('   ⚠️  Could not add foreign key (tenants table may not exist):', err.message);
    }

    // Verify tables were created
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('conversations', 'conversation_participants', 'messages', 'message_reads')
      ORDER BY table_name
    `);

    console.log('\n✅ All messaging tables created successfully!');
    console.log('\n📋 Tables created in abe_guard database:');
    tables.forEach(t => console.log(`   ✅ ${t.table_name}`));

  } catch (error) {
    console.error('❌ Error creating messaging tables:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
