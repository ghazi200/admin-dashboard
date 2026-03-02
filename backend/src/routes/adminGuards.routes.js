const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const {requireAccess} = require("../middleware/requireAccess"); // ✅ correct

const {
  listGuards,
  createGuard,
  updateGuard,
  deleteGuard,
  unlockGuard,
  updateGuardAvailability,
  getAvailabilityLogs,
  getRecentAvailabilityLogs, // ✅ EXACT name
  getGuardHistory,
  getGuardViewToken,
} = require("../controllers/adminGuards.controller");
console.log("controller keys:", Object.keys(require("../controllers/adminGuards.controller")));

console.log("authAdmin:", typeof authAdmin);
console.log("requireAccess:", typeof requireAccess);
console.log("listGuards:", typeof listGuards);
console.log("createGuard:", typeof createGuard);
console.log("listGuards", typeof listGuards);
console.log("getAvailabilityLogs", typeof getAvailabilityLogs);
console.log("getRecentAvailabilityLogs", typeof getRecentAvailabilityLogs);
console.log("updateGuardAvailability", typeof updateGuardAvailability);

let ra;
try { ra = typeof requireAccess === "function" ? requireAccess("guards:read") : undefined; } catch (e) { ra = e; }
console.log("requireAccess('guards:read'):", typeof ra, ra);


// CRUD
// =====================
router.get("/", authAdmin, requireAccess("guards:read"), listGuards);

// Guard view token (for /messages/guard) — must be before /:id
router.post("/guard-view-token", authAdmin, requireAccess("guards:read"), getGuardViewToken);

router.post("/", authAdmin, requireAccess("guards:write"), createGuard);

// Keep PUT if you already use it for “edit guard info”
router.put("/:id", authAdmin, requireAccess("guards:write"), updateGuard);

// ✅ Recent logs across all guards (place ABOVE /:id routes)
router.get(
  "/availability-logs",
  authAdmin,
  requireAccess("guards:read"),
  getRecentAvailabilityLogs
);

// ✅ PATCH for availability update (recommended)
router.patch(
  "/:id",
  authAdmin,
  requireAccess("guards:write"),
  updateGuardAvailability
);

router.delete("/:id", authAdmin, requireAccess("guards:delete"), deleteGuard);

router.post("/:id/unlock", authAdmin, requireAccess("guards:write"), unlockGuard);

// =====================
// ✅ Logs endpoint
// =====================
console.log("updateGuard:", typeof updateGuard);
console.log("deleteGuard:", typeof deleteGuard);
console.log("updateGuardAvailability:", typeof updateGuardAvailability);
console.log("getAvailabilityLogs:", typeof getAvailabilityLogs);
console.log("getRecentAvailabilityLogs:", typeof getRecentAvailabilityLogs);

router.get(
  "/:id/availability-logs",
  authAdmin,
  requireAccess("guards:read"),
  getAvailabilityLogs
);

// Comprehensive guard history endpoint
router.get(
  "/:id/history",
  authAdmin,
  requireAccess("guards:read"),
  getGuardHistory
);

module.exports = router;
