const express = require('express');
const router = express.Router();
let twilio = null;

try {
  twilio = require("twilio");
} catch (e) {
  console.warn("⚠️ Twilio not installed — SMS routes running in stub mode");
}

const { handleGuardResponse } = require('../services/guardResponseHandler');

router.post('/sms', async (req, res) => {
  try {
    const from = req.body.From; // phone number
    const body = req.body.Body.trim().toUpperCase(); // message content

    if (!['YES', 'NO'].includes(body)) {
      return res.status(400).send('<Response><Message>Please reply YES or NO</Message></Response>');
    }

    // Call the handler
    await handleGuardResponse(from, 'SMS', body);

    // Respond to Twilio
    res.send('<Response><Message>Thanks! Your response has been recorded.</Message></Response>');
  } catch (err) {
    console.error(err);
    res.status(500).send('<Response><Message>Error processing your response</Message></Response>');
  }
});

module.exports = router;
