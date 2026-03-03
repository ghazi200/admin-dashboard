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
// In production, never fall back to localhost — require DATABASE_URL
const rawUrl = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();
const isProduction = process.env.NODE_ENV === "production";
if (isProduction && !rawUrl) {
  console.error("DATABASE_URL is required in production. Set it in Railway Variables (e.g. from Postgres service).");
  process.exit(1);
}

if (rawUrl) {
  const host = rawUrl.split("@")[1]?.split("/")[0] || "(url)";
  console.log("config/db.js: Using DATABASE_URL (host: " + host + ")");
} else {
  console.log("config/db.js: Using DB_* fallback (host: " + (process.env.DB_HOST || "localhost") + ")");
}

const sequelize = rawUrl
  ? new Sequelize(rawUrl, {
      dialect: "postgres",
      logging: false,
    })
  : new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST || "localhost",
        dialect: "postgres",
        logging: false,
      }
    );

// ✅ Require correct database (abe_guard or Railway default) — exit if wrong
const REQUIRED_DB_NAMES = ["abe_guard", "abe-guard", "railway"];
function isAllowedDb(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return REQUIRED_DB_NAMES.includes(name) || lower === "railway";
}
if (sequelize.getDialect() === "postgres") {
  (async () => {
    try {
      await sequelize.authenticate();
      const [dbInfo] = await sequelize.query("SELECT current_database() as db_name");
      const dbName = dbInfo[0]?.db_name;
      if (!dbName || !isAllowedDb(dbName)) {
        console.error("❌ ERROR: config/db.js wrong database. Must use abe_guard (or railway on Railway).");
        console.error(`   Current: ${dbName || "(unknown)"}`);
        console.error("   Set DATABASE_URL in backend/.env to postgresql://.../abe_guard or .../railway");
        process.exit(1);
      }
      console.log(`✅ config/db.js: Connected to correct database (${dbName})`);
    } catch (error) {
      console.warn("⚠️  config/db.js: Could not verify database connection:", error.message);
    }
  })();
}

module.exports = { sequelize };
