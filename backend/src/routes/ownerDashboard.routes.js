const express = require("express");
const router = express.Router();
const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");
const ownerDashboardController = require("../controllers/ownerDashboard.controller");

router.get("/summary", authAdmin, ownerDashboardController.getSummary);
router.get("/staff", authAdmin, requireAccess("dashboard:read"), ownerDashboardController.listStaff);
router.post("/staff", authAdmin, requireAccess("dashboard:write"), ownerDashboardController.createStaff);
router.put("/staff/:id", authAdmin, requireAccess("dashboard:write"), ownerDashboardController.updateStaff);
router.delete("/staff/:id", authAdmin, requireAccess("dashboard:write"), ownerDashboardController.deleteStaff);

module.exports = router;
