/**
 * Set login password for an existing guard (production beta testers).
 * Usage:
 *   node src/scripts/setGuardPassword.js email@example.com 'TempPass123!'
 * Requires DATABASE_URL in backend/.env (public Railway URL, not empty, not .railway.internal).
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const { Guard, sequelize } = require("../models");

const email = String(process.argv[2] || "").trim().toLowerCase();
const password = String(process.argv[3] || "");

if (!email || !password) {
  console.error("Usage: node src/scripts/setGuardPassword.js <email> <password>");
  process.exit(1);
}

function dbHostLabel() {
  const url = String(process.env.DATABASE_URL || "").trim();
  if (!url) return "missing (falling back to localhost DB_*)";
  return url.split("@")[1]?.split("/")[0] || url;
}

(async () => {
  try {
    const url = String(process.env.DATABASE_URL || "").trim();
    if (!url) {
      console.error("DATABASE_URL is empty in backend/.env");
      console.error("Paste the PUBLIC Railway Postgres URL from Railway → Postgres → Connect.");
      console.error("Do NOT use postgres.railway.internal (that only works inside Railway).");
      process.exit(1);
    }
    if (url.includes("railway.internal")) {
      console.error("DATABASE_URL uses postgres.railway.internal — that will not work from your Mac.");
      console.error("Use the public URL from Railway → Postgres → Connect (e.g. *.proxy.rlwy.net).");
      process.exit(1);
    }

    await sequelize.authenticate();
    console.log("Connected to:", dbHostLabel());

    const guard = await Guard.findOne({
      where: { email: { [Op.iLike]: email } },
    });

    if (!guard) {
      const similar = await Guard.findAll({
        where: { email: { [Op.iLike]: `%${email.split("@")[0]}%` } },
        attributes: ["name", "email"],
        limit: 5,
      });
      console.error("Guard not found:", email);
      if (similar.length) {
        console.error("Similar emails in this database:");
        similar.forEach((g) => console.error(`  - ${g.name} | ${g.email}`));
      } else {
        const [count] = await sequelize.query("SELECT COUNT(*)::int AS n FROM guards");
        console.error(`This database has ${count[0].n} guard(s) — Seth may only exist in production admin.`);
        console.error("Create Seth in Admin → Guards, then fix DATABASE_URL to Railway public URL.");
      }
      process.exit(1);
    }

    const hash = await bcrypt.hash(password, 10);
    await guard.update({
      password_hash: hash,
      failed_login_attempts: 0,
      locked_until: null,
    });
    console.log("Password set for:", guard.name || email);
    console.log("  Email:", guard.email);
    console.log("  Password:", password);
    process.exit(0);
  } catch (err) {
    console.error("Failed:", err.message);
    console.error("DB target:", dbHostLabel());
    process.exit(1);
  }
})();
