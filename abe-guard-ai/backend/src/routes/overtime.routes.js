/**
 * Overtime Routes
 * Routes for guard overtime status and offers
 */
const express = require("express");
const router = express.Router();
const auth = require("../middleware/guardAuth");
const overtimeController = require("../controllers/overtime.controller");

// Get overtime status for a shift
router.get("/status/:shiftId", auth, overtimeController.getOvertimeStatus);

// Get pending overtime offers
router.get("/offers", auth, overtimeController.getOvertimeOffers);

// Request overtime (guard-initiated)
router.post("/request", auth, overtimeController.requestOvertime);

// Accept overtime offer
router.post("/offers/:offerId/accept", auth, overtimeController.acceptOvertimeOffer);

// Decline overtime offer
router.post("/offers/:offerId/decline", auth, overtimeController.declineOvertimeOffer);

module.exports = router;
