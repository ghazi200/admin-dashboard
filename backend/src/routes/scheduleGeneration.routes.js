const express = require('express');
const router = express.Router();

const authAdmin = require('../middleware/authAdmin');
const { requireAccess } = require('../middleware/requireAccess');
const scheduleGenerationController = require('../controllers/scheduleGeneration.controller');

// Generate schedule
router.post(
  '/generate',
  authAdmin,
  requireAccess('shifts:write'),
  scheduleGenerationController.generate
);

// Generate from template
router.post(
  '/generate-from-template',
  authAdmin,
  requireAccess('shifts:write'),
  scheduleGenerationController.generateFromTemplate
);

module.exports = router;
