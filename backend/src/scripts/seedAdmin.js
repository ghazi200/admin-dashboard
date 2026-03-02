require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Admin, sequelize } = require("../models");
const { DEFAULT_TEST_TENANT_ID } = require("../config/tenantConfig");

(async () => {
  try {
    await sequelize.authenticate();

    const email = "admin@test.com";
    const password = "password123";

    const existing = await Admin.findOne({ where: { email } });

    if (existing) {
      console.log("✅ Admin already exists:", email);

      // Reset password to password123 (recommended so you can login)
      existing.password = await bcrypt.hash(password, 10);
      existing.role = existing.role || "admin";
      existing.name = existing.name || "Test Admin";
      existing.tenant_id = DEFAULT_TEST_TENANT_ID; // ✅ Use abe-guard tenant
      await existing.save();

      console.log("✅ Admin password reset to password123:", email);
      process.exit(0);
    }

    await Admin.create({
      name: "Test Admin",
      email,
      password: await bcrypt.hash(password, 10),
      role: "admin",
      tenant_id: DEFAULT_TEST_TENANT_ID, // ✅ Use abe-guard tenant for all test data
    });

    console.log("✅ Seeded admin:", email);
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }
})();
