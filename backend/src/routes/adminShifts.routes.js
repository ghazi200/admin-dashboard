// src/routes/adminShifts.routes.js
const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const {requireAccess} = require("../middleware/requireAccess");

const shifts = require("../controllers/adminShifts.controller");

// Read
router.get("/", authAdmin, requireAccess("shifts:read"), shifts.listShifts);

// Running late - MUST come before /:id route (more specific routes first)
router.get("/:id/running-late", authAdmin, requireAccess("shifts:read"), shifts.getRunningLate);
router.post("/:id/running-late", authAdmin, requireAccess("shifts:write"), shifts.markRunningLate);

// Specific shift routes (must come after more specific routes)
router.get("/:id", authAdmin, requireAccess("shifts:read"), shifts.getShift);

// Write
router.post("/", authAdmin, requireAccess("shifts:write"), shifts.createShift);
router.put("/:id", authAdmin, requireAccess("shifts:write"), shifts.updateShift);

// Delete
router.delete("/:id", authAdmin, requireAccess("shifts:delete"), shifts.deleteShift);

module.exports = router;
