// Script to set password for a guard
// Usage: node set_guard_password.js <email> <password>

require("dotenv").config();
const bcrypt = require("bcrypt");
const { pool } = require("./src/config/db");

async function setGuardPassword(email, password) {
  try {
    await pool.query("SELECT 1"); // Test connection
    
    // Find guard by email
    const result = await pool.query(
      "SELECT id, email, name FROM guards WHERE lower(email)=lower($1) LIMIT 1",
      [email]
    );

    if (!result.rows.length) {
      console.error("❌ Guard not found:", email);
      process.exit(1);
    }

    const guard = result.rows[0];
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Update guard password
    await pool.query(
      "UPDATE guards SET password_hash = $1 WHERE id = $2",
      [hashedPassword, guard.id]
    );
    
    console.log("✅ Password set for guard:");
    console.log("  Email:", guard.email);
    console.log("  Name:", guard.name);
    console.log("  Password:", password);
    console.log("\nYou can now login with:");
    console.log(`  Email: ${email}`);
    console.log(`  Password: ${password}`);
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: node set_guard_password.js <email> <password>");
  process.exit(1);
}

setGuardPassword(email, password);
