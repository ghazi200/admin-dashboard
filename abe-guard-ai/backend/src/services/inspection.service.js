/**
 * Inspection Service
 * 
 * Provides utilities for:
 * - Challenge code generation
 * - Image hash calculation (SHA-256)
 * - Duplicate hash detection
 * - AI verification (Phase 3 placeholder)
 */

const crypto = require("crypto");
const fs = require("fs");
const { Op } = require("sequelize");

/**
 * Generates a unique challenge code (e.g., "ABE-4921")
 * Format: ABE-{4 random digits}
 * @returns {string}
 */
function generateChallengeCode() {
  const digits = Math.floor(1000 + Math.random() * 9000); // 1000-9999
  return `ABE-${digits}`;
}

/**
 * Calculates SHA-256 hash of a file
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} - SHA-256 hash in hex format
 */
async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Checks if any uploaded photo hash matches previous submissions
 * @param {Array<string>} photoHashes - Array of SHA-256 hashes from current submission
 * @param {string} guardId - Guard ID
 * @param {object} models - Sequelize models ({ InspectionSubmission })
 * @param {number} daysBack - How many days back to check (default: 30)
 * @returns {Promise<{hasDuplicate: boolean, duplicateHashes: Array<string>, message: string}>}
 */
async function checkDuplicateHashes(photoHashes, guardId, models, daysBack = 30) {
  const { InspectionSubmission } = models;

  if (!photoHashes || photoHashes.length === 0) {
    return {
      hasDuplicate: false,
      duplicateHashes: [],
      message: "No photos to check",
    };
  }

  // Find all submissions from this guard in the last N days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const recentSubmissions = await InspectionSubmission.findAll({
    where: {
      guard_id: guardId,
      submitted_at: { [Op.gte]: cutoffDate },
    },
    attributes: ["id", "photos_json"],
  });

  // Extract all previous hashes
  const previousHashes = new Set();
  recentSubmissions.forEach((submission) => {
    const photos = submission.photos_json || [];
    photos.forEach((photo) => {
      if (photo.hash_sha256) {
        previousHashes.add(photo.hash_sha256);
      }
    });
  });

  // Check for matches
  const duplicateHashes = photoHashes.filter((hash) => previousHashes.has(hash));

  return {
    hasDuplicate: duplicateHashes.length > 0,
    duplicateHashes,
    message:
      duplicateHashes.length > 0
        ? `⚠️ Found ${duplicateHashes.length} duplicate photo(s) from previous submissions`
        : "✅ No duplicate photos detected",
  };
}

/**
 * Validates that a challenge code is present in submission
 * (This is a placeholder - actual OCR/image recognition would be in Phase 3)
 * For now, we'll trust manual review by admin
 * @param {string} challengeCode - Expected challenge code
 * @param {Array<string>} photoPaths - Paths to uploaded photos
 * @returns {Promise<{found: boolean, confidence: number, message: string}>}
 */
async function validateChallengeCode(challengeCode, photoPaths) {
  // Phase 3: Implement OCR or image recognition here
  // For now, return placeholder that always passes
  // Admin will manually verify challenge code presence

  return {
    found: true, // Placeholder - assume found until AI verification is added
    confidence: 0.5, // Low confidence indicates manual review needed
    message: "Challenge code validation requires manual review (AI OCR not yet implemented)",
  };
}

/**
 * AI Verification placeholder (Phase 3)
 * 
 * In Phase 3, this would:
 * - Check if face is visible
 * - Verify photo quality (brightness, blur, darkness)
 * - Attempt OCR for challenge code
 * - Compare with guard profile photo (if available)
 * 
 * @param {Array<string>} photoPaths - Paths to uploaded photos
 * @param {string} guardId - Guard ID (for profile photo lookup)
 * @param {string} challengeCode - Expected challenge code
 * @param {object} models - Sequelize models ({ Guard })
 * @returns {Promise<{verdict: string, confidence: number, notes: object}>}
 */
async function performAIVerification(photoPaths, guardId, challengeCode, models) {
  // Phase 3: Implement actual AI verification
  // For now, return placeholder

  return {
    verdict: "VALID", // "VALID" | "SUSPICIOUS" | "POOR_QUALITY"
    confidence: 0.5, // 0.00-1.00
    notes: {
      faceDetected: null, // Would be true/false after AI analysis
      qualityScore: null, // Would be 0.00-1.00
      challengeCodeFound: null, // Would be true/false after OCR
      message: "AI verification not yet implemented (Phase 3)",
    },
  };
}

module.exports = {
  generateChallengeCode,
  calculateFileHash,
  checkDuplicateHashes,
  validateChallengeCode,
  performAIVerification,
};
