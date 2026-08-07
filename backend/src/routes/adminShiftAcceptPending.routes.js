const express = require("express");
const router = express.Router();
const authAdmin = require("../middleware/authAdmin");
const ctrl = require("../controllers/adminShiftAcceptPending.controller");

router.get(
  "/pending-accepts",
  authAdmin,
  ctrl.requireAdminOrSupervisor,
  ctrl.listPendingAccepts
);

router.post(
  "/:shiftId/override-accept",
  authAdmin,
  ctrl.requireAdminOrSupervisor,
  ctrl.overridePendingAccept
);

module.exports = router;
