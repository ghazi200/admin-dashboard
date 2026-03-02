// backend/src/routes/aiPolicy.routes.js
const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth"); // Sets req.admin
const requireRole = require("../middleware/requireRole");
const { upload } = require("../config/policyUpload");
const ctrl = require("../controllers/aiPolicy.controller");

// --- dev-safety checks (remove later if you want) ---
if (typeof requireRole !== "function") {
  throw new Error("requireRole middleware is not a function. Check ../middleware/requireRole export.");
}
if (!upload || typeof upload.single !== "function") {
  throw new Error("upload is not configured correctly. Check ../config/policyUpload export.");
}
if (!ctrl || typeof ctrl.uploadPolicy !== "function" || typeof ctrl.askPolicy !== "function") {
  throw new Error("aiPolicy.controller exports missing uploadPolicy/askPolicy functions.");
}

// ADMIN: list documents
router.get("/documents", auth, requireRole(["admin"]), ctrl.listDocuments);

// ADMIN: upload doc (PDF optional) + metadata + optional rawText
// upload.single() works fine - if no file is sent, req.file will be undefined
router.post("/upload", auth, requireRole(["admin"]), upload.single("file"), ctrl.uploadPolicy);

// ADMIN: update document active status
router.patch("/documents/:id/active", auth, requireRole(["admin"]), ctrl.updateDocumentActive);

// ADMIN: delete document
router.delete("/documents/:id", auth, requireRole(["admin"]), ctrl.deleteDocument);

// ADMIN: reindex document
router.post("/documents/:id/reindex", auth, requireRole(["admin"]), ctrl.reindexDocument);

// USER: ask policy (uses guardAuth or auth depending on user type)
router.post("/ask", requireRole(["guard", "supervisor", "admin"]), ctrl.askPolicy);

module.exports = router;
