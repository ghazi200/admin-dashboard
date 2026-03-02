// backend/src/routes/adminTenants.routes.js
const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth"); // Sets req.admin
const requireRole = require("../middleware/requireRole");
const ctrl = require("../controllers/adminTenants.controller");

// Admin-only
// Routes are already mounted at /api/admin/tenants, so use root path "/" for tenants
router.get("/", auth, requireRole(["admin"]), ctrl.listTenants);
router.get("/sites", auth, requireRole(["admin"]), ctrl.listSites);

/**
 * PATCH /api/admin/tenants/:id/payroll-settings
 * body: { payroll_mode?: "PAYSTUB_UPLOAD"|"CALCULATED"|"HYBRID", ai_payroll_enabled?: boolean }
 * 
 * Allows admins to update payroll mode and AI payroll enabled flag for a tenant.
 * - Regular admins can only update their own tenant
 * - Super admins can update any tenant
 */
router.patch("/:id/payroll-settings", auth, requireRole(["admin"]), async (req, res) => {
  try {
    const { Tenant } = req.app.locals.models;
    const id = req.params.id;

    const payroll_mode = String(req.body.payroll_mode || "")
      .trim()
      .toUpperCase();

    const ai_payroll_enabled =
      typeof req.body.ai_payroll_enabled === "boolean"
        ? req.body.ai_payroll_enabled
        : undefined;

    // ✅ Security: Prevent cross-tenant updates if not super admin
    const isSuperAdmin = req.admin?.role === "super_admin";
    const adminTenantId = req.admin?.tenant_id || req.admin?.tenantId || req.user?.tenant_id || req.user?.tenantId;
    
    if (!isSuperAdmin && adminTenantId && adminTenantId !== id) {
      return res
        .status(403)
        .json({ message: "Forbidden: cannot modify other tenants" });
    }

    // Validate payroll_mode if provided
    const allowed = ["PAYSTUB_UPLOAD", "CALCULATED", "HYBRID"];
    if (payroll_mode && !allowed.includes(payroll_mode)) {
      return res.status(400).json({ message: "Invalid payroll_mode", allowed });
    }

    // Find tenant
    const tenant = await Tenant.findByPk(id);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    // Build update object (only update fields that are provided)
    const patch = {};
    if (payroll_mode) patch.payroll_mode = payroll_mode;
    if (ai_payroll_enabled !== undefined)
      patch.ai_payroll_enabled = ai_payroll_enabled;

    // If no fields to update, return early
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    await tenant.update(patch);

    return res.json({ ok: true, tenant });
  } catch (e) {
    console.error("Error updating payroll settings:", e);
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
