/**
 * Check if overtime_offers table exists in the database
 */
require("dotenv").config();
const { sequelize } = require("../models");

async function checkOvertimeOffersTable() {
  try {
    console.log("🔍 Checking if overtime_offers table exists...\n");

    // Check if table exists
    const [tableCheck] = await sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'overtime_offers'
      )
    `);

    if (tableCheck && tableCheck[0] && tableCheck[0].exists) {
      console.log("✅ overtime_offers table exists\n");

      // Check table structure
      const [columns] = await sequelize.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'overtime_offers'
        ORDER BY ordinal_position
      `);

      console.log("📋 Table structure:");
      columns.forEach(col => {
        console.log(`   ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });

      // Check if there are any records
      const [count] = await sequelize.query(`
        SELECT COUNT(*) as count FROM overtime_offers
      `);
      console.log(`\n📊 Total records: ${count[0].count}`);

    } else {
      console.error("❌ overtime_offers table does NOT exist");
      console.log("\n💡 To create the table, run:");
      console.log("   cd ../abe-guard-ai/backend");
      console.log("   node src/scripts/createOvertimeOffersTable.js");
    }

  } catch (error) {
    console.error("❌ Error checking table:", error.message);
    console.error(error);
  } finally {
    await sequelize.close();
  }
}

checkOvertimeOffersTable();
