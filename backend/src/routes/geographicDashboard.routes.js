/**
 * Geographic Dashboard routes (sites for map view, route optimization, analytics)
 * Mounted at: /api/admin/geographic
 */
const express = require("express");
const router = express.Router();
const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");
const geographicDashboardController = require("../controllers/geographicDashboard.controller");

// Health check (no auth) — lets clients verify the admin-dashboard backend is running (not another app on :5000)
router.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "geographic-dashboard",
    routes: ["GET /sites", "POST /sites", "DELETE /sites/:siteId", "POST /route-optimize", "GET /analytics"],
  });
});

function safeGetSites(req, res, next) {
  geographicDashboardController.getSites(req, res).catch((err) => {
    console.error("getSites route catch:", err.message);
    if (!res.headersSent) res.json({ data: [] });
  });
}

router.get(
  "/sites",
  authAdmin,
  requireAccess("dashboard:read"),
  safeGetSites
);

router.get(
  "/sites/:siteId/details",
  authAdmin,
  requireAccess("dashboard:read"),
  (req, res, next) => geographicDashboardController.getSiteDetails(req, res).catch((err) => {
    console.error("getSiteDetails route catch:", err.message);
    if (!res.headersSent) res.status(500).json({ message: err.message || "Failed to load site details" });
  })
);

router.post(
  "/sites",
  authAdmin,
  requireAccess("dashboard:read"),
  geographicDashboardController.createSite
);

router.delete(
  "/sites/:siteId",
  authAdmin,
  requireAccess("dashboard:read"),
  geographicDashboardController.deleteSite
);

router.post(
  "/route-optimize",
  authAdmin,
  requireAccess("dashboard:read"),
  geographicDashboardController.getRouteOptimize
);

router.get(
  "/analytics",
  authAdmin,
  requireAccess("dashboard:read"),
  geographicDashboardController.getAnalytics
);

module.exports = router;
