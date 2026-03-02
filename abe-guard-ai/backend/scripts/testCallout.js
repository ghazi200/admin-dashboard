require('dotenv').config();
const { sequelize } = require('../src/config/db');
const { handleCallout } = require('../src/controllers/callouts.controller');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    const shiftId = '3549833e-41cc-4caa-85fd-fc85f4b64d69';

    console.log('📣 Triggering AI callout for shift:', shiftId);
    const result = await handleCallout(shiftId, 'SICK');

    console.log('✅ Result:', result);
    process.exit(0);
  } catch (err) {
    console.error('❌ Callout test failed:', err);
    process.exit(1);
  }
})();
