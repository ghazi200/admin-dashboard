const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const {requireAccess} = require("../middleware/requireAccess"); // ✅ correct

const {
  listGuards,
  createGuard,
  importGuardsCsv,
  downloadGuardImportTemplate,
  updateGuard,
  deleteGuard,
  unlockGuard,
  setGuardPassword,
  updateGuardAvailability,
  getAvailabilityLogs,
  getRecentAvailabilityLogs, // ✅ EXACT name
  getGuardHistory,
  getGuardViewToken,
} = require("../controllers/adminGuards.controller");

const multer = require("multer");
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    const ok =
      name.endsWith(".csv") ||
      String(file.mimetype || "").includes("csv") ||
      String(file.mimetype || "") === "text/plain" ||
      String(file.mimetype || "") === "application/vnd.ms-excel";
    cb(ok ? null : new Error("Only .csv files are allowed"), ok);
  },
});
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

// Bulk CSV import — must be before /:id
router.get(
  "/import/template",
  authAdmin,
  requireAccess("guards:write"),
  downloadGuardImportTemplate
);
router.post(
  "/import",
  authAdmin,
  requireAccess("guards:write"),
  (req, res, next) => {
    uploadCsv.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ message: err.message || "Upload failed" });
      return next();
    });
  },
  importGuardsCsv
);

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

router.post(
  "/:id/set-password",
  authAdmin,
  requireAccess("guards:write"),
  setGuardPassword
);

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
