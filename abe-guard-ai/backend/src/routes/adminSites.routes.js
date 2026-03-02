/**
 * Admin Sites Routes
 * 
 * Routes for admins to list sites/buildings.
 * Supports tenant admins (their tenant) and super admins (all tenants).
 */

const express = require("express");
const adminAuth = require("../middleware/auth"); // ✅ Use 'auth' not 'authAdmin'

const router = express.Router();

// ✅ Admin only routes (require authentication)
router.use(adminAuth);

/**
 * GET /api/admin/sites?tenantId=...
 * Returns sites for tenant (or all for super admin)
 */
router.get("/", async (req, res) => {
  try {
    const { Site } = req.app.locals.models;

    const isSuperAdmin = req.admin?.role === "super_admin";

    let tenantId;
    if (isSuperAdmin) {
      // Super admin can specify tenantId or see all
      tenantId = req.query?.tenantId || null;
    } else {
      // Tenant admin restricted to their tenant
      tenantId = req.admin?.tenant_id || req.user?.tenant_id;
      
      if (!tenantId) {
        return res.status(400).json({ 
          message: "Missing tenantId. Tenant admin must be assigned to a tenant." 
        });
      }
    }

    const where = { is_active: true };
    if (tenantId) {
      where.tenant_id = tenantId;
    }

    const rows = await Site.findAll({
      where,
      order: [["name", "ASC"]],
    });

    return res.json(rows);
  } catch (e) {
    console.error("❌ Error listing sites:", e);
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
