#!/usr/bin/env node
/**
 * List all tables in the database (public schema).
 * Run from backend: node scripts/listTables.js
 * Requires DATABASE_URL or DB_* in backend/.env
 */
const path = require("path");
const fs = require("fs");
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
} else {
  require("dotenv").config();
}

const { Sequelize } = require("sequelize");

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const dialect = "postgres";
  const sequelize = dbUrl
    ? new Sequelize(dbUrl, { dialect, logging: false })
    : new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASS,
        { host: process.env.DB_HOST, dialect, logging: false }
      );

  try {
    await sequelize.authenticate();
    console.log("✅ DB connection OK\n");

    const [rows] = await sequelize.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);

    const bySchema = {};
    for (const r of rows) {
      const s = r.table_schema || "public";
      if (!bySchema[s]) bySchema[s] = [];
      bySchema[s].push(r.table_name);
    }

    console.log("TABLES BY SCHEMA:");
    console.log("----------------");
    for (const [schema, tables] of Object.entries(bySchema).sort()) {
      console.log(`\n${schema}:`);
      tables.sort().forEach((t) => console.log(`  - ${t}`));
    }
    console.log("\nTotal tables:", rows.length);
  } catch (e) {
    console.error("❌ Error:", e.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
