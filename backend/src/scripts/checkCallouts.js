require("dotenv").config();
const { sequelize, CallOut, Guard } = require("../models");

(async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected");

    // Check CallOuts table
    console.log("\n📋 Checking CallOuts in database...");
    const callouts = await CallOut.findAll({
      include: [{ model: Guard, required: false }],
      limit: 10,
    });

    console.log(`Found ${callouts.length} callouts`);
    callouts.forEach((c, i) => {
      console.log(`\nCallout ${i + 1}:`);
      console.log(`  ID: ${c.id}`);
      console.log(`  GuardId: ${c.guardId} (type: ${typeof c.guardId})`);
      console.log(`  Guard: ${c.Guard ? c.Guard.name : "NOT FOUND"}`);
      console.log(`  ContactType: ${c.contactType}`);
      console.log(`  Active: ${c.active}`);
      console.log(`  CreatedAt: ${c.createdAt}`);
    });

    // Check Guards table
    console.log("\n👥 Checking Guards in database...");
    const guards = await Guard.findAll({ limit: 5 });
    console.log(`Found ${guards.length} guards`);
    guards.forEach((g, i) => {
      console.log(`  Guard ${i + 1}: ID=${g.id}, Name=${g.name}, Email=${g.email}`);
    });

    // Check raw SQL query
    console.log("\n🔍 Raw SQL query test...");
    const [results] = await sequelize.query(
      "SELECT * FROM \"CallOuts\" LIMIT 5;"
    );
    console.log(`Raw query found ${results.length} rows`);
    if (results.length > 0) {
      console.log("Sample row:", JSON.stringify(results[0], null, 2));
    }

    // Check table name variations
    console.log("\n🔍 Checking table name...");
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%callout%' OR table_name LIKE '%CallOut%';
    `);
    console.log("Tables with 'callout' in name:", tables);

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.error(err);
    process.exit(1);
  }
})();
