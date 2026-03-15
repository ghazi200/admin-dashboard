/**
 * One-off: Create missing tables (time_entries, overtime_offers, emergency_events) in Railway Postgres.
 * Run from repo root with: node run-railway-migrations.js
 * Loads DATABASE_URL from .env.railway.migrate (gitignored) or from env.
 * After running: delete .env.railway.migrate and rotate the DB password in Railway.
 */
const path = require("path");
const fs = require("fs");

// Load .env.railway.migrate (no dotenv dependency)
const envPath = path.join(__dirname, ".env.railway.migrate");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^DATABASE_URL=(.+)$/);
    if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, "").trim();
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || !DATABASE_URL.includes("/railway")) {
  console.error("❌ DATABASE_URL must point to /railway (use .env.railway.migrate or export DATABASE_URL)");
  process.exit(1);
}

const { Sequelize } = require("sequelize");
const sequelize = new Sequelize(DATABASE_URL, { dialect: "postgres", logging: false });

async function run() {
  try {
    await sequelize.authenticate();
    const [rows] = await sequelize.query("SELECT current_database() AS db_name");
    console.log("✅ Connected to database:", rows?.[0]?.db_name);

    // 1. time_entries (admin dashboard clock-status needs this)
    console.log("\n1. Creating time_entries (if not exists)...");
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS time_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID,
        shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        guard_id UUID NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
        clock_in_at TIMESTAMP,
        clock_out_at TIMESTAMP,
        lunch_start_at TIMESTAMP,
        lunch_end_at TIMESTAMP,
        clock_in_lat DOUBLE PRECISION,
        clock_in_lng DOUBLE PRECISION,
        clock_in_accuracy_m DOUBLE PRECISION,
        clock_out_lat DOUBLE PRECISION,
        clock_out_lng DOUBLE PRECISION,
        clock_out_accuracy_m DOUBLE PRECISION,
        device_type TEXT,
        device_os TEXT,
        device_id TEXT,
        ip_address TEXT,
        spoofing_risk_score DECIMAL(3,2),
        verification_notes JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("   ✅ time_entries done");

    // 2. overtime_offers
    console.log("\n2. Creating overtime_offers (if not exists)...");
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS overtime_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guard_id UUID NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
        shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        admin_id UUID,
        proposed_end_time TIMESTAMP NOT NULL,
        current_end_time TIMESTAMP NOT NULL,
        extension_hours DECIMAL(4,2) NOT NULL,
        reason TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'requested', 'accepted', 'declined', 'expired', 'cancelled')),
        guard_response_at TIMESTAMP,
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        meta JSONB DEFAULT '{}'::jsonb
      );
    `);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_overtime_offers_guard_id ON overtime_offers(guard_id);`).catch(() => {});
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_overtime_offers_shift_id ON overtime_offers(shift_id);`).catch(() => {});
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_overtime_offers_status ON overtime_offers(status);`).catch(() => {});
    console.log("   ✅ overtime_offers done");

    // 3. emergency_events (admin dashboard active-emergencies needs this)
    console.log("\n3. Creating emergency_events (if not exists)...");
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS emergency_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        guard_id UUID NOT NULL,
        tenant_id UUID,
        supervisor_id UUID,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        accuracy DOUBLE PRECISION,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        resolved_at TIMESTAMP,
        resolved_by UUID,
        notes TEXT,
        activated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_emergency_events_guard_id ON emergency_events(guard_id);`).catch(() => {});
    await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_emergency_events_status ON emergency_events(status);`).catch(() => {});
    console.log("   ✅ emergency_events done");

    console.log("\n✅ All migrations completed. You can delete .env.railway.migrate and rotate the DB password.");
  } catch (e) {
    console.error("❌ Migration failed:", e.message);
    if (e.message && (e.message.includes("does not exist") || e.message.includes("relation"))) {
      console.error("   Make sure 'guards' and 'shifts' tables exist (run admin or abe-guard-ai sync first).");
    }
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
