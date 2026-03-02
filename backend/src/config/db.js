const { Sequelize } = require("sequelize");
const path = require("path");
const fs = require("fs");

// Load .env from backend directory
// __dirname is backend/src/config, so ../ goes to backend/src/, then ../../ goes to backend/, then .env is at backend/.env
const envPath = path.resolve(__dirname, "../../.env"); // backend/.env
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
} else {
  require("dotenv").config();
}

// Use DATABASE_URL if available (same as abe-guard-ai), otherwise fall back to DB_* variables
const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: "postgres",
      logging: false,
    })
  : new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST,
        dialect: "postgres",
        logging: false,
      }
    );

// ✅ Require correct database (abe_guard) — exit if wrong
const REQUIRED_DB_NAMES = ["abe_guard", "abe-guard"];
if (sequelize.getDialect() === "postgres") {
  (async () => {
    try {
      await sequelize.authenticate();
      const [dbInfo] = await sequelize.query("SELECT current_database() as db_name");
      const dbName = dbInfo[0]?.db_name;
      if (!dbName || !REQUIRED_DB_NAMES.includes(dbName)) {
        console.error("❌ ERROR: config/db.js wrong database. Must use abe_guard.");
        console.error(`   Current: ${dbName || "(unknown)"}`);
        console.error("   Set DATABASE_URL in backend/.env to postgresql://.../abe_guard");
        process.exit(1);
      }
      console.log(`✅ config/db.js: Connected to correct database (${dbName})`);
    } catch (error) {
      console.warn("⚠️  config/db.js: Could not verify database connection:", error.message);
    }
  })();
}

module.exports = { sequelize };
