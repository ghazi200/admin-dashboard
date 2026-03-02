/**
 * Overtime Offers Routes (Admin Dashboard)
 */
const express = require("express");
const router = express.Router();
const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");
const overtimeOffersController = require("../controllers/overtimeOffers.controller");

// Create overtime offer
router.post(
  "/offer",
  authAdmin,
  requireAccess("shifts:write"),
  overtimeOffersController.createOvertimeOffer
);

// Get overtime offers
router.get(
  "/offers",
  authAdmin,
  requireAccess("dashboard:read"),
  overtimeOffersController.getOvertimeOffers
);

// Approve overtime request (from guard)
router.post(
  "/offers/:offerId/approve",
  authAdmin,
  requireAccess("shifts:write"),
  overtimeOffersController.approveOvertimeRequest
);

// Deny overtime request (from guard)
router.post(
  "/offers/:offerId/deny",
  authAdmin,
  requireAccess("shifts:write"),
  overtimeOffersController.denyOvertimeRequest
);

// Cancel overtime offer
router.post(
  "/offers/:offerId/cancel",
  authAdmin,
  requireAccess("shifts:write"),
  overtimeOffersController.cancelOvertimeOffer
);

module.exports = router;
