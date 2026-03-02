const express = require('express');
const router = express.Router();
const { handleGuardResponse } = require('../services/guardResponseHandler');

/**
 * Example confirmation link: /email/confirm?guardId=123&shiftId=abc&response=YES
 */
router.get('/confirm', async (req, res) => {
  try {
    const { guardId, shiftId, response } = req.query;

    if (!guardId || !shiftId || !['YES', 'NO'].includes(response?.toUpperCase())) {
      return res.status(400).send('Invalid confirmation link.');
    }

    await handleGuardResponse(guardId, 'EMAIL', response.toUpperCase(), shiftId);

    res.send('✅ Your response has been recorded. Thank you!');
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Error recording your response.');
  }
});

module.exports = router;
