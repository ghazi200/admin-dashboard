/**
 * Guard Sites Routes
 * 
 * Routes for guards to list sites/buildings for their tenant.
 * Used for incident reporting site selection.
 */

const express = require("express");
const guardAuth = require("../middleware/guardAuth"); // ✅ Use 'guardAuth' not 'authGuard'

const router = express.Router();

// ✅ Guard only routes (require authentication)
router.use(guardAuth);

/**
 * GET /api/guard/sites (or /sites for guard UI)
 * Returns active sites for guard's tenant
 */
router.get("/", async (req, res) => {
  try {
    const { Site } = req.app.locals.models;
    
    // ✅ Use req.user (not req.guard) - guardAuth sets req.user
    const tenantId = req.user?.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ 
        message: "Guard missing tenant_id. Guard must be assigned to a tenant." 
      });
    }

    // ✅ Debug: Log what we're querying
    console.log(`🔍 [guardSites] Querying sites for tenant: ${tenantId}`);
    
    const rows = await Site.findAll({
      where: { 
        tenant_id: tenantId, 
        is_active: true 
      },
      order: [["name", "ASC"]],
      attributes: ['id', 'tenant_id', 'name', 'address_1', 'address_2', 'city', 'state', 'zip', 'lat', 'lng', 'is_active', 'created_at', 'updated_at'], // ✅ Explicitly select Site fields only
      // ✅ Explicitly exclude any associations that might cause issues
      include: [], // No includes - just Sites
      raw: false, // Get Sequelize instances so we can convert properly
    });

    // ✅ Debug: Log what we got
    console.log(`🔍 [guardSites] Found ${rows.length} sites`);
    if (rows.length > 0) {
      const firstSite = rows[0].toJSON();
      console.log(`🔍 [guardSites] First site keys:`, Object.keys(firstSite));
    }

    // ✅ Convert Sequelize instances to plain JSON
    const sites = rows.map(site => {
      const json = site.toJSON();
      // ✅ Extra safety: Only include Site fields we want
      return {
        id: json.id,
        tenant_id: json.tenant_id,
        name: json.name,
        address_1: json.address_1 || null,
        address_2: json.address_2 || null,
        city: json.city || null,
        state: json.state || null,
        zip: json.zip || null,
        lat: json.lat || null,
        lng: json.lng || null,
        is_active: json.is_active,
        created_at: json.created_at,
        updated_at: json.updated_at,
      };
    });
    
    return res.json(sites);
  } catch (e) {
    console.error("❌ Error listing sites:", e);
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
