const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const guardAuthController = require("../controllers/guardAuth.Controller");
const { loginValidators, handleLoginValidation } = require("../middleware/validateLogin");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || "10", 10),
  message: { message: "Too many login attempts; try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", authLimiter, loginValidators, handleLoginValidation, guardAuthController.login);

module.exports = router;
