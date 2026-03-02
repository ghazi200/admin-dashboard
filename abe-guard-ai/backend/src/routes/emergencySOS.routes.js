// backend/src/routes/emergencySOS.routes.js
const express = require("express");
const router = express.Router();
const guardAuth = require("../middleware/guardAuth");

const {
  triggerEmergencySOS,
  getEmergencyContacts,
  addEmergencyContact,
} = require("../controllers/emergencySOS.controller");

// All routes require guard authentication
router.use(guardAuth);

// Emergency SOS routes
router.post("/sos", triggerEmergencySOS);
router.get("/contacts", getEmergencyContacts);
router.post("/contacts", addEmergencyContact);

module.exports = router;
