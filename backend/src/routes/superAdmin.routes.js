const express = require("express");
const router = express.Router();
const authAdmin = require("../middleware/authAdmin");
const requireSuperAdmin = require("../middleware/requireSuperAdmin");
const superAdminController = require("../controllers/superAdmin.controller");

// All routes require super-admin role
router.use(authAdmin);
router.use(requireSuperAdmin);

// Tenant management
router.get("/tenants", superAdminController.listTenants);
router.post("/tenants", superAdminController.createTenant);
router.put("/tenants/:id", superAdminController.updateTenant);
router.delete("/tenants/:id", superAdminController.deleteTenant);
router.get("/tenants/:id/stats", superAdminController.getTenantStats);

// Admin management for tenants
router.post("/tenants/:id/admins", superAdminController.createTenantAdmin);

// Analytics
router.get("/analytics", superAdminController.getSuperAdminAnalytics);
router.get("/incidents", superAdminController.getSuperAdminIncidents);
router.get("/company-rankings", superAdminController.getCompanyRankings);

module.exports = router;
