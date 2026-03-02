const express = require("express");
const { pool } = require("../config/db");
 const auth = require("../middleware/auth");
// ✅ use your admin auth middleware

const router = express.Router();

/* ===================== BASIC LISTS ===================== */

// GET /api/admin/guards
router.get("/guards", auth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM guards ORDER BY name");
    res.json(result.rows);
  } catch (err) {
    console.error("Get guards error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/admin/shifts
router.get("/shifts", auth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM shifts ORDER BY shift_date, shift_start");
    res.json(result.rows);
  } catch (err) {
    console.error("Get shifts error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===================== DASHBOARD ===================== */

// GET /api/admin/dashboard/open-shifts
router.get("/dashboard/open-shifts", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM shifts WHERE status = 'OPEN' ORDER BY shift_date, shift_start"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("open-shifts error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/admin/dashboard/live-callouts
router.get("/dashboard/live-callouts", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT c.*, s.site_name
      FROM callouts c
      JOIN shifts s ON s.id = c.shift_id
      ORDER BY c.created_at DESC
      LIMIT 25
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error("live-callouts error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/admin/dashboard/guard-availability
router.get("/dashboard/guard-availability", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        is_active,
        acceptance_rate,
        reliability_score
      FROM guards
      ORDER BY name
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error("guard-availability error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
