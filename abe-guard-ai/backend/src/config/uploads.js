const path = require("path");
const fs = require("fs");

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "paystubs");
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Ensures the paystubs upload directory exists.
 * Safe to call multiple times - mkdirSync with recursive: true won't error if directory already exists.
 */
function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_ROOT)) {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  }
}

// ✅ Auto-create directory on module load (matches policyUpload.js pattern)
ensureUploadDir();

module.exports = { UPLOAD_ROOT, ensureUploadDir, MAX_UPLOAD_BYTES };
