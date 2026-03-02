/**
 * Incident Upload Configuration
 * 
 * Handles file uploads for incident attachments (photos, videos, audio).
 * Follows the same pattern as paystubs uploads.
 */

const path = require("path");
const fs = require("fs");

const INCIDENT_UPLOAD_ROOT = path.join(process.cwd(), "uploads", "incidents");
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB per file

/**
 * Ensures the incidents upload directory exists.
 * Safe to call multiple times - mkdirSync with recursive: true won't error if directory already exists.
 */
function ensureIncidentUploadDir() {
  if (!fs.existsSync(INCIDENT_UPLOAD_ROOT)) {
    fs.mkdirSync(INCIDENT_UPLOAD_ROOT, { recursive: true });
    console.log(`✅ Created incidents upload directory: ${INCIDENT_UPLOAD_ROOT}`);
  }
}

// ✅ Auto-create directory on module load (matches uploads.js pattern)
ensureIncidentUploadDir();

module.exports = { 
  INCIDENT_UPLOAD_ROOT, 
  ensureIncidentUploadDir, 
  MAX_UPLOAD_BYTES 
};
