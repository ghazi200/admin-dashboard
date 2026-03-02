/**
 * Verify messaging tables are in the correct database (abe_guard)
 */

// Read DATABASE_URL directly from .env file
const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');

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

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    const [dbInfo] = await sequelize.query('SELECT current_database() as db_name');
    const dbName = dbInfo[0]?.db_name;
    console.log(`📊 Connected to database: ${dbName}`);

    if (dbName === 'abe_guard' || dbName === 'abe-guard') {
      console.log('✅ CORRECT DATABASE!\n');
    } else {
      console.log(`❌ WRONG DATABASE! Should be abe_guard, but connected to ${dbName}\n`);
      process.exit(1);
    }

    // Check for messaging tables
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('conversations', 'conversation_participants', 'messages', 'message_reads')
      ORDER BY table_name
    `);

    console.log('📋 Messaging tables:');
    if (tables.length === 4) {
      tables.forEach(t => console.log(`   ✅ ${t.table_name}`));
      console.log('\n✅ All messaging tables exist in abe_guard database!');
    } else {
      console.log(`   ⚠️  Found ${tables.length}/4 tables`);
      tables.forEach(t => console.log(`   - ${t.table_name}`));
      console.log('\n❌ Some tables are missing. Run createMessagingTables.js again.');
      process.exit(1);
    }

    await sequelize.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
