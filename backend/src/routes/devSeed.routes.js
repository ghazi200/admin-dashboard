// backend/src/routes/devSeed.routes.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { DEFAULT_TEST_TENANT_ID } = require("../config/tenantConfig");

router.post("/seed-admin", async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;

    const adminEmail = "admin@test.com";
    const adminPassword = "password123";

    const supervisorEmail = "supervisor@test.com";
    const supervisorPassword = "password123";

    const hash = (pw) => bcrypt.hash(pw, 10);

    async function upsert(emailRaw, name, role, pw) {
      const email = String(emailRaw).trim().toLowerCase();
      const hashed = await hash(pw);

      let user = await Admin.findOne({ where: { email } });

      // Build a payload that works whether your column is password or password_hash
      const payload = {
        name,
        email,
        role,
        permissions: [],
        password: hashed,
        password_hash: hashed,
        tenant_id: DEFAULT_TEST_TENANT_ID, // ✅ Use abe-guard tenant for all test data
      };

      if (!user) {
        user = await Admin.create(payload);
        return { user, created: true };
      }

      await user.update({
        role,
        permissions: user.permissions || [],
        // set both to keep schema-compatible
        password: hashed,
        password_hash: hashed,
        tenant_id: DEFAULT_TEST_TENANT_ID, // ✅ Use abe-guard tenant for all test data
      });

      return { user, created: false };
    }

    const a = await upsert(adminEmail, "Admin", "admin", adminPassword);
    const s = await upsert(supervisorEmail, "Supervisor", "supervisor", supervisorPassword);

    return res.json({
      ok: true,
      results: [
        { email: a.user.email, role: a.user.role, created: a.created },
        { email: s.user.email, role: s.user.role, created: s.created },
      ],
      creds: {
        admin: { email: adminEmail, password: adminPassword },
        supervisor: { email: supervisorEmail, password: supervisorPassword },
      },
      note: "Seed complete (admin + supervisor created/updated).",
    });
  } catch (e) {
    console.error("seed-admin failed:", e);
    return res.status(500).json({ message: "Seed failed", error: e.message });
  }
});

module.exports = router;
