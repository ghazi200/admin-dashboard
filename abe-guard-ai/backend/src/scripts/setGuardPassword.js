/**
 * Set password for a guard account
 * Usage: node src/scripts/setGuardPassword.js <email> <password>
 */

require("dotenv").config();
const bcrypt = require("bcrypt");
const { pool } = require("../config/db");

async function setGuardPassword(email, password) {
  try {
    if (!email || !password) {
      console.error("❌ Usage: node setGuardPassword.js <email> <password>");
      process.exit(1);
    }

    // Find guard by email
    const result = await pool.query(
      "SELECT id, email, name FROM guards WHERE lower(email)=lower($1) LIMIT 1",
      [email]
    );

    if (!result.rows.length) {
      console.error(`❌ Guard not found: ${email}`);
      process.exit(1);
    }

    const guard = result.rows[0];

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password
    await pool.query(
      "UPDATE guards SET password_hash = $1 WHERE id = $2",
      [hashedPassword, guard.id]
    );

    console.log("✅ Password set successfully!");
    console.log(`   Guard: ${guard.name || guard.email}`);
    console.log(`   Email: ${guard.email}`);
    console.log(`   Password: ${password}`);
    console.log("\n💡 You can now login with:");
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

const email = process.argv[2];
const password = process.argv[3];

setGuardPassword(email, password);
