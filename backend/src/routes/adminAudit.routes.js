const express = require("express");
const router = express.Router();
const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");
const { listAuditEvents, exportAuditEvents } = require("../controllers/adminAudit.controller");

router.get("/", authAdmin, requireAccess("dashboard:read"), listAuditEvents);
router.get("/export", authAdmin, requireAccess("dashboard:read"), exportAuditEvents);

module.exports = router;
