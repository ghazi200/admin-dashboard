/**
 * Guard Sites — list tenant sites for incident reporting (Incident page).
 * Guard UI calls GET {GUARD_API_URL}/sites (same host as unified Railway backend).
 */
const express = require("express");
const authGuard = require("../middleware/authGuard");

const router = express.Router();
router.use(authGuard);

router.get("/", async (req, res) => {
  try {
    const { Site } = req.app.locals.models || {};
    if (!Site) {
      return res.status(500).json({ message: "Server models not ready" });
    }

    const tenantId = req.guard?.tenant_id ?? null;
    if (!tenantId) {
      return res.status(400).json({
        message: "Guard missing tenant_id. Guard must be assigned to a tenant.",
      });
    }

    const rows = await Site.findAll({
      where: { tenant_id: tenantId },
      order: [["name", "ASC"]],
      attributes: [
        "id",
        "tenant_id",
        "name",
        "address_1",
        "address_2",
        "latitude",
        "longitude",
        "created_at",
        "updated_at",
      ],
    });

    const sites = rows.map((s) => {
      const j = s.toJSON ? s.toJSON() : s;
      const lat = j.latitude != null && j.latitude !== "" ? parseFloat(j.latitude, 10) : null;
      const lng = j.longitude != null && j.longitude !== "" ? parseFloat(j.longitude, 10) : null;
      return {
        id: j.id,
        tenant_id: j.tenant_id,
        name: j.name,
        address_1: j.address_1 || null,
        address_2: j.address_2 || null,
        lat: Number.isNaN(lat) ? null : lat,
        lng: Number.isNaN(lng) ? null : lng,
        latitude: j.latitude ?? null,
        longitude: j.longitude ?? null,
        created_at: j.created_at,
        updated_at: j.updated_at,
      };
    });

    return res.json(sites);
  } catch (e) {
    console.error("guardSites list error:", e?.message || e);
    return res.status(500).json({ message: e.message || "Failed to list sites" });
  }
});

module.exports = router;
