// Script to create a guard user in abe-guard-ai database
// Usage: Run from abe-guard-ai/backend directory
//   node CREATE_GUARD_USER.js [email] [password] [name]

require("dotenv").config();
const bcrypt = require("bcrypt");
const { pool } = require("./src/config/db");

async function createGuardUser(email, password, name) {
  try {
    await pool.query("SELECT 1"); // Test connection
    
    // Check if password_hash column exists, if not add it
    const colCheck = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'guards' AND column_name IN ('password_hash', 'password')`
    );
    
    if (colCheck.rows.length === 0) {
      console.log("📝 Adding password_hash column to guards table...");
      await pool.query(
        `ALTER TABLE guards ADD COLUMN password_hash VARCHAR(255)`
      );
      console.log("✅ Column added");
    }
    
    // Check if guard already exists
    const checkResult = await pool.query(
      "SELECT id, email, name FROM guards WHERE lower(email)=lower($1) LIMIT 1",
      [email]
    );

    if (checkResult.rows.length) {
      const guard = checkResult.rows[0];
      console.log("⚠️ Guard already exists:");
      console.log("  ID:", guard.id);
      console.log("  Email:", guard.email);
      console.log("  Name:", guard.name);
      
      // Update password if provided
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
          "UPDATE guards SET password_hash = $1 WHERE id = $2",
          [hashedPassword, guard.id]
        );
        console.log("✅ Password updated to:", password);
      }
      
      await pool.end();
      return;
    }

    // Create new guard
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO guards (email, password_hash, name, is_active, created_at)
       VALUES ($1, $2, $3, true, NOW())
       RETURNING id, email, name`,
      [email, hashedPassword, name]
    );

    const guard = result.rows[0];
    console.log("✅ Guard created:");
    console.log("  ID:", guard.id);
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

const email = process.argv[2] || "guard@test.com";
const password = process.argv[3] || "password123";
const name = process.argv[4] || "Test Guard";

createGuardUser(email, password, name);
