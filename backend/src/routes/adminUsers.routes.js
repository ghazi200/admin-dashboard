const express = require("express");
const router = express.Router();
const authAdmin = require("../middleware/authAdmin");
const {requireAccess} = require("../middleware/requireAccess");
const users = require("../controllers/adminUsers.controller");

// Only admins (or admin-granted) can manage users
router.get("/", authAdmin, requireAccess("users:read"), users.listAdmins);
router.post("/", authAdmin, requireAccess("users:write"), users.createUser);
router.put("/:id/permissions", authAdmin, requireAccess("users:write"), users.setPermissions);
router.put("/:id/role", authAdmin, requireAccess("users:write"), users.setRole);
router.delete("/:id", authAdmin, requireAccess("users:write"), users.deleteUser);

module.exports = router;
