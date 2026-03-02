/**
 * Migration: Change notifications.entityId from INTEGER to VARCHAR/TEXT
 * to support UUIDs for shift swaps and other entities
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env") });
const { sequelize } = require("../models");

async function migrate() {
  try {
    console.log("\n🔄 Migrating notifications.entityId to STRING...");
    console.log("=" .repeat(50));
    
    // Check current column type
    const [currentType] = await sequelize.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Notifications' 
      AND column_name = 'entityId'
    `);
    
    if (currentType.length === 0) {
      console.log("⚠️  Column 'entityId' not found in 'Notifications' table");
      return;
    }
    
    console.log(`Current type: ${currentType[0].data_type}`);
    
    if (currentType[0].data_type === 'integer' || currentType[0].data_type === 'bigint') {
      console.log("Converting INTEGER to VARCHAR...");
      
      // Step 1: Add a temporary column
      await sequelize.query(`
        ALTER TABLE "Notifications" 
        ADD COLUMN "entityId_temp" VARCHAR(255)
      `);
      
      // Step 2: Copy and convert data
      await sequelize.query(`
        UPDATE "Notifications" 
        SET "entityId_temp" = CAST("entityId" AS TEXT) 
        WHERE "entityId" IS NOT NULL
      `);
      
      // Step 3: Drop old column
      await sequelize.query(`
        ALTER TABLE "Notifications" 
        DROP COLUMN "entityId"
      `);
      
      // Step 4: Rename temp column
      await sequelize.query(`
        ALTER TABLE "Notifications" 
        RENAME COLUMN "entityId_temp" TO "entityId"
      `);
      
      console.log("✅ Migration completed!");
    } else if (currentType[0].data_type === 'character varying' || currentType[0].data_type === 'text') {
      console.log("✅ Column is already VARCHAR/TEXT - no migration needed");
    } else {
      console.log(`⚠️  Unexpected column type: ${currentType[0].data_type}`);
      console.log("Attempting to convert anyway...");
      
      await sequelize.query(`
        ALTER TABLE "Notifications" 
        ALTER COLUMN "entityId" TYPE VARCHAR(255) 
        USING "entityId"::text
      `);
      
      console.log("✅ Migration completed!");
    }
    
    await sequelize.close();
    console.log("\n");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

migrate();
