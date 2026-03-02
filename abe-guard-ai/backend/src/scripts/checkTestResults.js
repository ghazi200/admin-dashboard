require("dotenv").config();
const { sequelize } = require("../config/db");
const { TimeEntry, ClockInVerification } = require("../models");

(async () => {
  try {
    await sequelize.authenticate();
    const shiftId = process.argv[2] || '20da491e-073a-4aab-a750-73a58e2fdc9d';
    
    const te = await TimeEntry.findOne({
      where: { shift_id: shiftId },
      order: [['clock_in_at', 'DESC']]
    });
    
    if (te) {
      console.log('Time Entry ID:', te.id);
      console.log('Risk Score:', te.spoofing_risk_score);
      console.log('Verification Notes:', te.verification_notes ? JSON.stringify(te.verification_notes, null, 2) : 'None');
      const verifs = await ClockInVerification.findAll({
        where: { time_entry_id: te.id }
      });
      console.log('\nVerification Records:', verifs.length);
      verifs.forEach((v, i) => {
        console.log(`  ${i+1}. ${v.verification_type} - ${v.verification_result}`);
      });
    } else {
      console.log('No time entry found');
    }
    
    await sequelize.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
