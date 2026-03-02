// src/routes/guardPolicy.routes.js
"use strict";

const express = require("express");
const router = express.Router();

// ✅ Use guardAuth middleware for guard authentication
const auth = require("../middleware/guardAuth");

// ✅ existing controller
const { askPolicy } = require("../controllers/aiPolicy.controller");

/**
 * POST /api/guard/policy/ask
 */
router.post("/policy/ask", auth, askPolicy);

module.exports = router;
