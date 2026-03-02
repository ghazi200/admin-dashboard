// Script to create a guard token for testing
// Usage: Run from abe-guard-ai/backend directory
//   node ../../admin-dashboard/CREATE_GUARD_TOKEN.js [guard-email] [password]

require("dotenv").config();
const jwt = require("jsonwebtoken");
const { pool } = require("./src/config/db");
const bcrypt = require("bcrypt");

async function createGuardToken(email, password) {
  try {
    await pool.query("SELECT 1"); // Test connection
    
    // Find guard by email
    const result = await pool.query(
      "SELECT * FROM guards WHERE lower(email)=lower($1) LIMIT 1",
      [email]
    );

    if (!result.rows.length) {
      console.error("❌ Guard not found:", email);
      process.exit(1);
    }

    const guard = result.rows[0];
    
    // If password provided, verify it
    if (password) {
      const hash = guard.password_hash || guard.password || "";
      if (!hash) {
        console.error("❌ Guard account missing password hash");
        process.exit(1);
      }
      const valid = await bcrypt.compare(password, hash);
      if (!valid) {
        console.error("❌ Invalid password");
        process.exit(1);
      }
    }

    // Create token
    const token = jwt.sign(
      {
        guardId: guard.id,
        tenant_id: guard.tenant_id || null,
        role: "guard",
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    console.log("✅ Guard token created:");
    console.log("\nToken:");
    console.log(token);
    console.log("\nGuard info:");
    console.log("  ID:", guard.id);
    console.log("  Email:", guard.email);
    console.log("  Name:", guard.name || guard.full_name || "N/A");
    console.log("\nTo use in browser console:");
    console.log(`localStorage.setItem('guardToken', '${token}');`);
    console.log("\nTo test with curl:");
    console.log(`curl -X POST http://localhost:4000/shifts/YOUR_SHIFT_ID/running-late \\`);
    console.log(`  -H "Authorization: Bearer ${token}" \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"reason": "train delay"}'`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

const email = process.argv[2] || "bob@abe.com";
const password = process.argv[3] || null;

createGuardToken(email, password);
