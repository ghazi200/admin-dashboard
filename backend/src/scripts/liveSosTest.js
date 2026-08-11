#!/usr/bin/env node
/**
 * Live SOS test against production admin API.
 * Calls Ghazi (+13475307327 by default), creates emergency + incident.
 *
 * Usage:
 *   node src/scripts/liveSosTest.js
 *   SOS_NOTIFY_PHONE=+13475307327 GUARD_EMAIL=... node src/scripts/liveSosTest.js
 */
require("dotenv").config();
const axios = require("axios");
const jwt = require("jsonwebtoken");

const BASE =
  process.env.SOS_TEST_BASE_URL ||
  process.env.PUBLIC_BASE_URL ||
  "https://admin-dashboard-production-2596.up.railway.app";

const NOTIFY = process.env.SOS_NOTIFY_PHONE || "+13475307327";

async function main() {
  const { sequelize, Guard } = require("../models");
  await sequelize.authenticate();

  let guard = null;
  if (process.env.GUARD_EMAIL) {
    guard = await Guard.findOne({ where: { email: process.env.GUARD_EMAIL } });
  }
  if (!guard) {
    guard = await Guard.findOne({
      where: { email: { [require("sequelize").Op.ne]: null } },
      order: [["created_at", "DESC"]],
    });
  }
  if (!guard) throw new Error("No guard found");

  const token = jwt.sign(
    { guardId: guard.id, tenant_id: guard.tenant_id, email: guard.email, role: "guard" },
    process.env.JWT_SECRET,
    { expiresIn: "30m" }
  );

  console.log("BASE", BASE);
  console.log("GUARD", guard.name, guard.id);
  console.log("NOTIFY", NOTIFY);

  const res = await axios.post(
    `${BASE.replace(/\/+$/, "")}/emergency/sos`,
    {
      lat: 40.758,
      lng: -73.9855,
      accuracy: 12,
      notifyPhone: NOTIFY,
    },
    {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      timeout: 60000,
      validateStatus: () => true,
    }
  );

  console.log("HTTP", res.status);
  console.log(JSON.stringify(res.data, null, 2));

  if (res.status >= 200 && res.status < 300) {
    const adminLogin = await axios.post(
      `${BASE.replace(/\/+$/, "")}/api/admin/login`,
      { email: process.env.ADMIN_EMAIL || "admin@test.com", password: process.env.ADMIN_PASSWORD || "password123" },
      { validateStatus: () => true, timeout: 20000 }
    );
    if (adminLogin.status === 200 && adminLogin.data?.token) {
      const emerg = await axios.get(
        `${BASE.replace(/\/+$/, "")}/api/admin/dashboard/active-emergencies`,
        { headers: { Authorization: `Bearer ${adminLogin.data.token}` }, timeout: 20000 }
      );
      console.log(
        "ACTIVE_EMERGENCIES",
        emerg.status,
        (emerg.data?.data || []).map((e) => ({
          id: e.id,
          guard: e.guardName,
          status: e.status,
        }))
      );
    } else {
      console.log("Admin login for verify failed", adminLogin.status, adminLogin.data?.message);
    }
  }

  await sequelize.close();
  process.exit(res.status >= 200 && res.status < 300 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
