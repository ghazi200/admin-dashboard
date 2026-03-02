/**
 * Admin Shift Swap Routes
 * 
 * Routes for admin to manage shift swaps
 */

const express = require("express");
const router = express.Router();

const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");

const {
  listShiftSwaps,
  approveShiftSwap,
  rejectShiftSwap,
} = require("../controllers/adminShiftSwap.controller");

/**
 * GET /api/admin/shift-swaps
 * Get all shift swap requests
 */
router.get("/", authAdmin, requireAccess("shifts:read"), listShiftSwaps);

/**
 * POST /api/admin/shift-swaps/:id/approve
 * Approve a shift swap
 */
router.post("/:id/approve", authAdmin, requireAccess("shifts:write"), approveShiftSwap);

/**
 * POST /api/admin/shift-swaps/:id/reject
 * Reject a shift swap
 */
router.post("/:id/reject", authAdmin, requireAccess("shifts:write"), rejectShiftSwap);

module.exports = router;
