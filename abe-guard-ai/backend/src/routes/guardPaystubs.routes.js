const express = require("express");
const guardAuth = require("../middleware/guardAuth"); // ✅ Fixed: use 'guardAuth' not 'authGuard'
const requirePayrollMode = require("../middleware/requirePayrollMode");

const router = express.Router();

// ✅ Guard only + mode gate (A or Hybrid)
// Note: requirePayrollMode sets req.tenant and validates mode
// guardAuth sets req.user with guardId and tenant_id
router.use(guardAuth);
router.use(requirePayrollMode(["PAYSTUB_UPLOAD", "HYBRID"], { actor: "guard" }));

/**
 * GET /api/guard/paystubs/current
 * Returns the most recent pay stub for the authenticated guard
 */
router.get("/current", async (req, res) => {
  try {
    const { PayStub } = req.app.locals.models;

    // ✅ FIXED: guardAuth sets req.user (not req.guard) with guardId
    const guardId = req.user?.guardId || req.user?.id;

    if (!guardId) {
      return res.status(401).json({ message: "Guard ID not found in token" });
    }

    const stub = await PayStub.findOne({
      where: { tenant_id: req.tenant.id, guard_id: guardId },
      order: [["pay_date", "DESC"]],
    });

    return res.json(stub || null);
  } catch (e) {
    console.error("Error fetching current pay stub:", e);
    return res.status(500).json({ message: e.message });
  }
});

/**
 * GET /api/guard/paystubs
 * Returns list of pay stubs for the authenticated guard (most recent first)
 */
router.get("/", async (req, res) => {
  try {
    const { PayStub } = req.app.locals.models;

    // ✅ FIXED: guardAuth sets req.user (not req.guard) with guardId
    const guardId = req.user?.guardId || req.user?.id;

    if (!guardId) {
      return res.status(401).json({ message: "Guard ID not found in token" });
    }

    const rows = await PayStub.findAll({
      where: { tenant_id: req.tenant.id, guard_id: guardId },
      order: [["pay_date", "DESC"]],
      limit: 50,
    });

    return res.json(rows);
  } catch (e) {
    console.error("Error listing pay stubs:", e);
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
