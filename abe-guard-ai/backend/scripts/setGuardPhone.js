#!/usr/bin/env node
/**
 * Set a guard's phone by email (E.164 recommended for Twilio).
 *
 *   node scripts/setGuardPhone.js marcus@abesecurity.com +18777804236
 *   node scripts/setGuardPhone.js marcus@abesecurity.com clear   # set NULL (skip SMS)
 */
require("../src/loadEnv");
const { sequelize } = require("../src/config/db");
const { Guard } = require("../src/models");
const { Op } = require("sequelize");

function toE164(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (raw === "clear" || raw === "null" || raw === "-") return null;
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

async function main() {
  const email = process.argv[2];
  const phoneArg = process.argv[3];
  if (!email || !phoneArg) {
    console.error("Usage: node scripts/setGuardPhone.js <guard-email> <E.164-or-digits|clear>");
    process.exit(1);
  }
  await sequelize.authenticate();
  const g = await Guard.findOne({
    where: { email: { [Op.iLike]: email.trim() } },
  });
  if (!g) {
    console.error("No guard with email:", email);
    process.exit(1);
  }
  const phone = toE164(phoneArg);
  g.phone = phone;
  await g.save();
  console.log("Updated", g.name, g.email, "phone →", phone ?? "(null, SMS skipped)");
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
