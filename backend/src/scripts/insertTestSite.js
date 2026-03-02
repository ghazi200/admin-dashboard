/**
 * Insert a test site so it shows on the Geographic Dashboard map.
 * Uses abe_guard DB. Run from backend: node src/scripts/insertTestSite.js
 *
 * By default inserts a GLOBAL site (tenant_id = NULL) so all admins see it:
 * - Super_admins see all sites; tenant admins see global sites + their tenant's sites.
 *
 * Optional: TENANT_ID=uuid node src/scripts/insertTestSite.js (to also add one for that tenant)
 */
const path = require("path");
const fs = require("fs");
const https = require("https");

const backendEnv = path.resolve(__dirname, "../../.env");
const rootEnv = path.resolve(__dirname, "../../../.env");
if (fs.existsSync(backendEnv)) {
  require("dotenv").config({ path: backendEnv });
} else if (fs.existsSync(rootEnv)) {
  require("dotenv").config({ path: rootEnv });
} else {
  require("dotenv").config();
}

const { sequelize } = require("../models");

// Real address: 248 Duffield Street, Brooklyn, NY 11212 (used as default site on map)
const REAL_ADDRESS = {
  name: "248 Duffield Street",
  address_1: "248 Duffield Street",
  address_2: "Brooklyn, NY 11212",
  latitude: 40.6686,
  longitude: -73.9097,
};

/** Geocode an address using OpenStreetMap Nominatim (free, no API key). */
function geocode(address) {
  return new Promise((resolve, reject) => {
    const q = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
    const opts = {
      headers: { "User-Agent": "AdminDashboard-SiteScript/1.0" },
    };
    https
      .get(url, opts, (res) => {
        let body = "";
        res.on("data", (ch) => (body += ch));
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (Array.isArray(data) && data[0] && data[0].lat != null && data[0].lon != null) {
              resolve({ lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) });
            } else {
              resolve(null);
            }
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

async function ensureColumns() {
  await sequelize.query("ALTER TABLE sites ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7)");
  await sequelize.query("ALTER TABLE sites ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7)");
}

async function allowNullTenantId() {
  await sequelize.query("ALTER TABLE sites ALTER COLUMN tenant_id DROP NOT NULL");
}

async function insertSite(name, address_1, address_2, latitude, longitude, tenantId) {
  const [existing] = tenantId
    ? await sequelize.query("SELECT id FROM sites WHERE name = $1 AND tenant_id = $2 LIMIT 1", {
        bind: [name, tenantId],
      })
    : await sequelize.query("SELECT id FROM sites WHERE name = $1 AND tenant_id IS NULL LIMIT 1", {
        bind: [name],
      });
  if (existing && existing.length > 0) return false;

  await sequelize.query(
    `INSERT INTO sites (id, name, address_1, address_2, latitude, longitude, tenant_id, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())`,
    {
      bind: [name, address_1 || null, address_2 || null, latitude, longitude, tenantId],
    }
  );
  return true;
}

async function main() {
  try {
    await sequelize.authenticate();
    const [dbInfo] = await sequelize.query("SELECT current_database() AS db_name");
    const dbName = dbInfo[0]?.db_name;
    if (!["abe_guard", "abe-guard"].includes(dbName)) {
      console.error("❌ Wrong database. Must use abe_guard.");
      process.exit(1);
    }

    await ensureColumns();
    await allowNullTenantId();

    // Geocode real address for accurate map pin (248 Duffield Street, Brooklyn, NY 11212)
    let lat = REAL_ADDRESS.latitude;
    let lng = REAL_ADDRESS.longitude;
    const fullAddress = [REAL_ADDRESS.address_1, REAL_ADDRESS.address_2].filter(Boolean).join(", ");
    try {
      const coords = await geocode(fullAddress);
      if (coords) {
        lat = coords.lat;
        lng = coords.lon;
        console.log("✅ Geocoded address:", fullAddress, "→", lat.toFixed(5), lng.toFixed(5));
      }
    } catch (e) {
      console.warn("⚠️ Geocoding failed, using fallback coordinates:", e.message);
    }

    // 1) Update any existing global site (e.g. "Map Test Site") to the real address so map shows one pin
    await sequelize.query(
      `UPDATE sites SET name = $1, address_1 = $2, address_2 = $3, latitude = $4, longitude = $5, updated_at = NOW()
       WHERE tenant_id IS NULL AND (name = $6 OR address_1 = $7)`,
      {
        bind: [
          REAL_ADDRESS.name,
          REAL_ADDRESS.address_1,
          REAL_ADDRESS.address_2,
          lat,
          lng,
          "Map Test Site",
          "123 Main St",
        ],
      }
    );

    // 2) Insert global site only if we don't already have one with this real address
    const insertedGlobal = await insertSite(
      REAL_ADDRESS.name,
      REAL_ADDRESS.address_1,
      REAL_ADDRESS.address_2,
      lat,
      lng,
      null
    );
    if (insertedGlobal) {
      console.log("✅ Site inserted:", REAL_ADDRESS.name, "at", fullAddress);
    } else {
      console.log("✅ Site already exists:", REAL_ADDRESS.name, fullAddress);
    }

    // 2) Optional: insert for a specific tenant if TENANT_ID is set
    const tenantId = process.env.TENANT_ID || null;
    if (tenantId) {
      const insertedTenant = await insertSite(
        REAL_ADDRESS.name + " (Tenant)",
        REAL_ADDRESS.address_1,
        REAL_ADDRESS.address_2,
        lat,
        lng,
        tenantId
      );
      if (insertedTenant) console.log("✅ Tenant test site inserted for tenant:", tenantId);
    }

    console.log("   Refresh the Map page in the admin dashboard to see the site.");
    await sequelize.close();
    process.exit(0);
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}

main();
