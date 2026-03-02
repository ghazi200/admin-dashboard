/**
 * Create Tenants Table Migration
 * 
 * Run this script to create the tenants table in the database
 */

require("dotenv").config();
const { Sequelize, DataTypes } = require("sequelize");

// Load .env and get DATABASE_URL
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const isTest = process.env.NODE_ENV === "test";

const sequelize = isTest
  ? new Sequelize({
      dialect: "sqlite",
      storage: "file::memory:",
      logging: false,
    })
  : process.env.DATABASE_URL
    ? new Sequelize(process.env.DATABASE_URL, {
        dialect: "postgres",
        logging: console.log,
      })
    : new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASS,
        {
          host: process.env.DB_HOST,
          dialect: "postgres",
          logging: console.log,
        }
      );

const Tenant = require("../models/Tenant")(sequelize, DataTypes);

async function createTenantsTable() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to database");

    console.log("🔧 Creating tenants table...");
    await Tenant.sync({ force: false });
    console.log("✅ Created tenants table");

    // Add indexes (check if table exists first)
    try {
      const [tableCheck] = await sequelize.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'status'
      `);
      
      if (tableCheck && tableCheck.length > 0) {
        await sequelize.query(`
          CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status);
          CREATE INDEX IF NOT EXISTS idx_tenants_subscription_plan ON tenants (subscription_plan);
          CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants (domain) WHERE domain IS NOT NULL;
        `);
        console.log("✅ Created indexes");
      } else {
        console.log("⚠️  Table columns not found, skipping indexes");
      }
    } catch (idxError) {
      console.warn("⚠️  Could not create indexes:", idxError.message);
    }

    console.log("✅ Tenants table created successfully!");
    console.log("\n💡 Next steps:");
    console.log("   1. Create a super-admin user (role: 'super_admin')");
    console.log("   2. Access the Super-Admin UI at /super-admin");
    console.log("   3. Create your first tenant");

  } catch (error) {
    console.error("❌ Error creating tenants table:", error);
  } finally {
    await sequelize.close();
  }
}

createTenantsTable();
