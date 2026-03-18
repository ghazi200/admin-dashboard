/**
 * Seed or reset guard bob@abe.com with password password123.
 * Run from backend: node src/scripts/seedGuardBob.js
 * To target Railway DB: DATABASE_URL='your-railway-postgres-url' node src/scripts/seedGuardBob.js
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const bcrypt = require("bcryptjs");
const { Guard, sequelize } = require("../models");
const { DEFAULT_TEST_TENANT_ID } = require("../config/tenantConfig");

const EMAIL = "bob@abe.com";
const PASSWORD = "password123";

(async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ DB connected");

    const hash = await bcrypt.hash(PASSWORD, 10);
    const existing = await Guard.findOne({ where: { email: EMAIL } });

    if (existing) {
      existing.password_hash = hash;
      existing.failed_login_attempts = 0;
      existing.locked_until = null;
      existing.name = existing.name || "Bob Smith";
      if (!existing.tenant_id) existing.tenant_id = DEFAULT_TEST_TENANT_ID;
      await existing.save();
      console.log("✅ Guard updated:", EMAIL, "password set to", PASSWORD);
    } else {
      await Guard.create({
        name: "Bob Smith",
        email: EMAIL,
        password_hash: hash,
        tenant_id: DEFAULT_TEST_TENANT_ID,
      });
      console.log("✅ Guard created:", EMAIL, "password", PASSWORD);
    }
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  }
})();
