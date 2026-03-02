require('dotenv').config();
const { sequelize } = require('../models');
const { v4: uuidv4 } = require('uuid');

async function createTestCallout() {
  try {
    // Get current week's Monday
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const mondayDate = monday.toISOString().split('T')[0];
    
    console.log('📅 Creating test callout for Monday:', mondayDate);
    
    // Find Bob Smith (or any guard)
    const [bobRows] = await sequelize.query(
      `SELECT id, name, email FROM guards WHERE LOWER(name) LIKE '%bob%' OR LOWER(email) LIKE '%bob%' LIMIT 1`
    );
    
    if (bobRows.length === 0) {
      console.log('❌ No guard found with "bob" in name/email');
      // Get any guard
      const [anyGuard] = await sequelize.query(`SELECT id, name, email FROM guards LIMIT 1`);
      if (anyGuard.length === 0) {
        console.log('❌ No guards found in database');
        await sequelize.close();
        process.exit(1);
      }
      var bob = anyGuard[0];
    } else {
      var bob = bobRows[0];
    }
    
    console.log(`✅ Found guard: ${bob.name || bob.email} (${bob.id.substring(0, 8)}...)`);
    
    // Find John Doe (or any other guard to accept)
    const [johnRows] = await sequelize.query(
      `SELECT id, name, email FROM guards WHERE (LOWER(name) LIKE '%john%' OR LOWER(name) LIKE '%doe%') AND id != $1 LIMIT 1`,
      { bind: [bob.id] }
    );
    
    if (johnRows.length === 0) {
      // Get a different guard
      const [otherGuard] = await sequelize.query(
        `SELECT id, name, email FROM guards WHERE id != $1 LIMIT 1`,
        { bind: [bob.id] }
      );
      if (otherGuard.length === 0) {
        console.log('❌ Need at least 2 guards for this test');
        await sequelize.close();
        process.exit(1);
      }
      var john = otherGuard[0];
    } else {
      var john = johnRows[0];
    }
    
    console.log(`✅ Found accepting guard: ${john.name || john.email} (${john.id.substring(0, 8)}...)`);
    
    // Create a shift for Monday 7am-3pm
    const shiftId = uuidv4();
    console.log(`\n📋 Creating shift: ${shiftId.substring(0, 8)}...`);
    console.log(`   Date: ${mondayDate}`);
    console.log(`   Time: 07:00-15:00`);
    console.log(`   Assigned to: ${bob.name || bob.email} (will call out)`);
    
    await sequelize.query(
      `INSERT INTO shifts (id, guard_id, shift_date, shift_start, shift_end, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      { bind: [shiftId, bob.id, mondayDate, '07:00:00', '15:00:00', 'OPEN'] }
    );
    
    console.log('✅ Shift created');
    
    // Create callout
    const calloutId = uuidv4();
    console.log(`\n📞 Creating callout: ${calloutId.substring(0, 8)}...`);
    console.log(`   Called out by: ${bob.name || bob.email}`);
    console.log(`   Reason: SICK`);
    
    await sequelize.query(
      `INSERT INTO callouts (id, shift_id, guard_id, reason, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      { bind: [calloutId, shiftId, bob.id, 'SICK'] }
    );
    
    console.log('✅ Callout created');
    
    // Accept callout (assign John and close shift)
    console.log(`\n✅ Accepting callout (assigning to ${john.name || john.email})...`);
    
    await sequelize.query(
      `UPDATE shifts 
       SET guard_id = $1, status = $2 
       WHERE id = $3`,
      { bind: [john.id, 'CLOSED', shiftId] }
    );
    
    console.log('✅ Shift assigned and closed');
    
    // Verify
    const [verify] = await sequelize.query(
      `SELECT s.id, s.shift_date, s.shift_start, s.shift_end, s.guard_id, s.status,
              g.name as guard_name, c.id as callout_id
       FROM shifts s
       LEFT JOIN guards g ON s.guard_id = g.id
       LEFT JOIN callouts c ON c.shift_id = s.id
       WHERE s.id = $1`,
      { bind: [shiftId] }
    );
    
    if (verify.length > 0) {
      const shift = verify[0];
      console.log(`\n✅ Verification:`);
      console.log(`   Shift: ${shift.shift_date} ${shift.shift_start}-${shift.shift_end}`);
      console.log(`   Assigned guard: ${shift.guard_name || 'Unknown'}`);
      console.log(`   Status: ${shift.status}`);
      console.log(`   Has callout: ${shift.callout_id ? 'YES' : 'NO'}`);
      console.log(`\n🎉 Test callout created successfully!`);
      console.log(`   Now check the schedule page - it should show "${shift.guard_name}" for Monday 7am-3pm`);
    }
    
    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    await sequelize.close();
    process.exit(1);
  }
}

createTestCallout();
