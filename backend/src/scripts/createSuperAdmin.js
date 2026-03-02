/**
 * Create Super-Admin User Script
 * 
 * This script creates a super-admin user in the database.
 * Run: node src/scripts/createSuperAdmin.js
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Admin, sequelize } = require("../models");

(async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database");

    // Get email and password from command line args or use defaults
    const email = process.argv[2] || "superadmin@example.com";
    const password = process.argv[3] || "superadmin123";
    const name = process.argv[4] || "Super Admin";

    console.log(`\n🔧 Creating super-admin user...`);
    console.log(`   Email: ${email}`);
    console.log(`   Name: ${name}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role: super_admin\n`);

    // Check if admin already exists
    const existing = await Admin.findOne({ where: { email: email.toLowerCase().trim() } });

    if (existing) {
      // Update existing admin to super-admin
      const hash = await bcrypt.hash(password, 10);
      await existing.update({
        name,
        password: hash,
        role: "super_admin",
        tenant_id: null, // Super-admins don't belong to a tenant
      });
      console.log("✅ Updated existing admin to super-admin:", email);
    } else {
      // Create new super-admin
      const hash = await bcrypt.hash(password, 10);
      await Admin.create({
        name,
        email: email.toLowerCase().trim(),
        password: hash,
        role: "super_admin",
        permissions: [],
        tenant_id: null, // Super-admins don't belong to a tenant
      });
      console.log("✅ Created new super-admin:", email);
    }

    console.log("\n✅ Super-admin user ready!");
    console.log("\n📋 Login Credentials:");
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log("\n💡 Next steps:");
    console.log("   1. Start the backend server (if not running)");
    console.log("   2. Go to http://localhost:3001/login");
    console.log("   3. Login with the credentials above");
    console.log("   4. Navigate to /super-admin in the sidebar");

    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to create super-admin:", err);
    process.exit(1);
  }
})();
