const express = require("express");
const router = express.Router();
const authGuard = require("../middleware/authGuard");
const {
  triggerEmergencySOS,
  getEmergencyContacts,
  addEmergencyContact,
} = require("../controllers/emergencySos.controller");

router.use(authGuard);
router.post("/sos", triggerEmergencySOS);
router.get("/contacts", getEmergencyContacts);
router.post("/contacts", addEmergencyContact);

module.exports = router;
