const express = require("express");
const auth = require("../middleware/auth"); // ✅ Fixed: use 'auth' not 'authAdmin'
const requirePayrollMode = require("../middleware/requirePayrollMode");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

// ✅ Admin only + mode gate (B or Hybrid)
// Note: requirePayrollMode sets req.tenant and validates mode
router.use(auth);
router.use(requireRole(["admin"]));
router.use(requirePayrollMode(["CALCULATED", "HYBRID"], { actor: "admin" }));

/**
 * GET /api/admin/payroll/status
 * Scaffold endpoint - confirms calculated payroll is enabled for this tenant
 * 
 * Future: This will be expanded with actual payroll calculation endpoints
 */
router.get("/status", async (req, res) => {
  try {
    return res.json({
      ok: true,
      message: "Calculated payroll enabled for this tenant (scaffold).",
      tenant: { 
        id: req.tenant.id, 
        payroll_mode: req.tenant.payroll_mode,
        ai_payroll_enabled: req.tenant.ai_payroll_enabled || false,
      },
    });
  } catch (e) {
    console.error("Error getting payroll status:", e);
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
