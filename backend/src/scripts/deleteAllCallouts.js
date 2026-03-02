// Script to delete all callouts from the database
// WARNING: This will delete ALL callouts permanently!

require("dotenv").config();
const { sequelize } = require("../models");

async function deleteAllCallouts() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database");

    // Get count before deletion
    const [countBefore] = await sequelize.query(
      "SELECT COUNT(*) as count FROM callouts"
    );
    const totalCallouts = countBefore[0].count;
    console.log(`📊 Found ${totalCallouts} callouts in database`);

    if (totalCallouts === 0) {
      console.log("✅ No callouts to delete");
      process.exit(0);
    }

    // Delete all callouts
    console.log("🗑️  Deleting all callouts...");
    const [result] = await sequelize.query("DELETE FROM callouts");
    
    console.log(`✅ Deleted ${totalCallouts} callouts`);
    console.log("✅ Database is now empty - ready for new callouts!");

    // Verify deletion
    const [countAfter] = await sequelize.query(
      "SELECT COUNT(*) as count FROM callouts"
    );
    console.log(`📊 Callouts remaining: ${countAfter[0].count}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error deleting callouts:", error);
    process.exit(1);
  }
}

deleteAllCallouts();
