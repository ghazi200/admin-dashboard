const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const adminAuthController = require("../controllers/adminAuth.Controller");
const { loginValidators, handleLoginValidation } = require("../middleware/validateLogin");

// Stricter rate limit for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || "10", 10),
  message: { message: "Too many login attempts; try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/register", adminAuthController.register);
router.post("/login", authLimiter, loginValidators, handleLoginValidation, adminAuthController.login);
router.post("/mfa/verify-login", authLimiter, adminAuthController.verifyMfaLogin);
router.get("/me", authAdmin, adminAuthController.me);
router.post("/change-password", authAdmin, adminAuthController.changePassword);
router.post("/logout-other-devices", authAdmin, adminAuthController.logoutOtherDevices);
router.post("/mfa/setup", authAdmin, adminAuthController.mfaSetup);
router.post("/mfa/verify-setup", authAdmin, adminAuthController.mfaVerifySetup);
router.post("/mfa/disable", authAdmin, adminAuthController.mfaDisable);

module.exports = router;
