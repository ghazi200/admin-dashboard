/**
 * Password policy for admin accounts
 * - Minimum length
 * - Uppercase, lowercase, number, special character
 * - Optional: reject common passwords (could add a list later)
 */

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

/** @type {string[]} */
const COMMON = [
  "password", "password1", "password123", "admin", "admin123",
  "letmein", "welcome", "monkey", "qwerty", "abc123", "123456",
  "Password1", "Password123", "Admin123", "Welcome1",
];

/**
 * Validate password against policy.
 * @param {string} password - Plain password
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePassword(password) {
  if (typeof password !== "string") {
    return { valid: false, message: "Password must be a string" };
  }
  const p = password.trim();
  if (p.length < MIN_LENGTH) {
    return { valid: false, message: `Password must be at least ${MIN_LENGTH} characters` };
  }
  if (p.length > MAX_LENGTH) {
    return { valid: false, message: `Password must be no more than ${MAX_LENGTH} characters` };
  }
  if (!/[A-Z]/.test(p)) {
    return { valid: false, message: "Password must contain at least one uppercase letter" };
  }
  if (!/[a-z]/.test(p)) {
    return { valid: false, message: "Password must contain at least one lowercase letter" };
  }
  if (!/[0-9]/.test(p)) {
    return { valid: false, message: "Password must contain at least one number" };
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)) {
    return { valid: false, message: "Password must contain at least one special character (!@#$%^&* etc.)" };
  }
  const lower = p.toLowerCase();
  if (COMMON.some((c) => lower.includes(c) || lower === c)) {
    return { valid: false, message: "Password is too common. Choose a stronger password." };
  }
  return { valid: true };
}

/**
 * Get a user-facing description of the policy (for UI).
 */
function getPolicyDescription() {
  return `Password must be ${MIN_LENGTH}-${MAX_LENGTH} characters and include: uppercase, lowercase, number, and special character.`;
}

module.exports = {
  validatePassword,
  getPolicyDescription,
  MIN_LENGTH,
  MAX_LENGTH,
};
