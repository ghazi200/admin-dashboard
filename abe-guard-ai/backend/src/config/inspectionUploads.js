/**
 * Inspection Upload Configuration
 * 
 * Handles file uploads for inspection submissions (selfie photos).
 * Follows the same pattern as incident uploads.
 */

const path = require("path");
const fs = require("fs");

const INSPECTION_UPLOAD_ROOT = path.join(process.cwd(), "uploads", "inspections");
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB per file
const MAX_FILES = 3; // Selfie + optional badge + optional signage

/**
 * Ensures the inspections upload directory exists.
 * Safe to call multiple times - mkdirSync with recursive: true won't error if directory already exists.
 */
function ensureInspectionUploadDir() {
  if (!fs.existsSync(INSPECTION_UPLOAD_ROOT)) {
    fs.mkdirSync(INSPECTION_UPLOAD_ROOT, { recursive: true });
    console.log(`✅ Created inspections upload directory: ${INSPECTION_UPLOAD_ROOT}`);
  }
}

// ✅ Auto-create directory on module load (matches incidentUploads.js pattern)
ensureInspectionUploadDir();

module.exports = { 
  INSPECTION_UPLOAD_ROOT, 
  ensureInspectionUploadDir, 
  MAX_UPLOAD_BYTES,
  MAX_FILES
};
